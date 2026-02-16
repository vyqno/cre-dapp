// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title AgentBondingCurve
 * @author Hitesh (vyqno)
 * @notice An ERC-20 token whose price follows a linear bonding curve tied to an
 *         AI agent's CRE-verified performance.
 * @dev Price model:
 *        currentPrice = basePrice + slope * supply
 *
 *      Buy cost (integral from `supply` to `supply + tokens`):
 *        cost = basePrice * tokens + slope * tokens * (2 * supply + tokens) / 2
 *
 *      The `slope` is adjustable by an authorized CRE workflow (`curveAdjuster`).
 *      Better-performing agents get steeper slopes -> faster price appreciation.
 *
 *      Security:
 *        - Inherits OpenZeppelin `ReentrancyGuard` to protect `buy()` and `sell()`.
 *        - Uses OpenZeppelin `Address.sendValue()` for ETH transfers (AA/multisig safe).
 *        - Follows the Checks-Effects-Interactions (CEI) pattern.
 *        - Reserve solvency invariant: reserveBalance >= cost of buying back all tokens.
 *        - Custom errors for gas-efficient reverts.
 */
contract AgentBondingCurve is ERC20, Ownable, ReentrancyGuard {
    using Address for address payable;

    // ──────────────────────────────────────────────
    //  Custom Errors
    // ──────────────────────────────────────────────

    /// @dev Thrown when base price is set to zero in constructor.
    error BondingCurve__ZeroBasePrice();

    /// @dev Thrown when slope exceeds MAX_SLOPE.
    error BondingCurve__SlopeExceedsMax();

    /// @dev Thrown when setCurveAdjuster is called with address(0).
    error BondingCurve__ZeroAdjusterAddress();

    /// @dev Thrown when buy() is called with msg.value == 0.
    error BondingCurve__ZeroETHSent();

    /// @dev Thrown when the ETH sent cannot buy the minimum number of tokens.
    error BondingCurve__BelowMinimumBuy();

    /// @dev Thrown when the computed cost is zero (should not happen in practice).
    error BondingCurve__ZeroCost();

    /// @dev Thrown when msg.value < cost (should not happen after binary search).
    error BondingCurve__InsufficientETH();

    /// @dev Thrown when sell amount is less than 1 whole token.
    error BondingCurve__SellBelowMinimum();

    /// @dev Thrown when seller does not hold enough tokens.
    error BondingCurve__InsufficientBalance();

    /// @dev Thrown when sell refund exceeds reserve (should never happen if solvency holds).
    error BondingCurve__InsufficientReserves();

    /// @dev Thrown when getSellRefund is called with 0 tokens.
    error BondingCurve__ZeroSellAmount();

    /// @dev Thrown when getSellRefund tokens exceed supply.
    error BondingCurve__ExceedsSupply();

    /// @dev Thrown when caller is not the authorized curve adjuster.
    error BondingCurve__NotAuthorizedAdjuster();

    /// @dev Thrown when a slope increase would make the reserve unable to cover sellbacks.
    error BondingCurve__SlopeWouldCauseInsolvency();

    /// @dev Thrown when sell amount is not a whole-token multiple.
    error BondingCurve__NotWholeTokenMultiple();

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice One whole token (18 decimals).
    uint256 private constant ONE_TOKEN = 1e18;

    /// @notice Minimum purchase: 1 whole token.
    uint256 private constant MIN_BUY_TOKENS = ONE_TOKEN;

    /// @notice Max slope to prevent extreme price spikes (0.01 ETH per token).
    uint256 public constant MAX_SLOPE = 0.01 ether;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice The agent ID this bonding curve is bound to.
    uint256 public immutable agentId;

    /// @notice Minimum token price when supply is zero (in wei).
    uint256 public basePrice;

    /// @notice Price increment per whole token of supply (in wei).
    uint256 public slope;

    /// @notice ETH held in reserve to back outstanding tokens.
    uint256 public reserveBalance;

    /// @notice Address authorized to call `adjustSlope` (CRE workflow).
    address public curveAdjuster;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when tokens are purchased from the curve.
    event TokensBought(address indexed buyer, uint256 amount, uint256 cost);

    /// @notice Emitted when tokens are sold back to the curve.
    event TokensSold(address indexed seller, uint256 amount, uint256 refund);

    /// @notice Emitted when the bonding curve slope is adjusted by CRE.
    event SlopeAdjusted(uint256 oldSlope, uint256 newSlope);

    /// @notice Emitted when the curve adjuster address is updated.
    event CurveAdjusterUpdated(address indexed oldAdjuster, address indexed newAdjuster);

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param _name         ERC-20 token name.
     * @param _symbol       ERC-20 token symbol.
     * @param _agentId      The agent ID this curve is associated with.
     * @param _basePrice    Starting price in wei when supply is zero.
     * @param _initialSlope Initial slope value in wei per whole token.
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _agentId,
        uint256 _basePrice,
        uint256 _initialSlope
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        if (_basePrice == 0) revert BondingCurve__ZeroBasePrice();
        if (_initialSlope > MAX_SLOPE) revert BondingCurve__SlopeExceedsMax();

        agentId = _agentId;
        basePrice = _basePrice;
        slope = _initialSlope;
    }

    // ──────────────────────────────────────────────
    //  Owner Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Set the address authorized to adjust the bonding curve slope.
     * @param adjuster The authorized adjuster address (cannot be zero).
     */
    function setCurveAdjuster(address adjuster) external onlyOwner {
        if (adjuster == address(0)) revert BondingCurve__ZeroAdjusterAddress();

        address oldAdjuster = curveAdjuster;
        curveAdjuster = adjuster;

        emit CurveAdjusterUpdated(oldAdjuster, adjuster);
    }

    // ──────────────────────────────────────────────
    //  Pricing Functions (whole-token granularity)
    // ──────────────────────────────────────────────

    /**
     * @notice Return the current marginal price based on total supply.
     * @return Current price in wei per whole token.
     */
    function currentPrice() public view returns (uint256) {
        uint256 supply = totalSupply() / ONE_TOKEN;
        return basePrice + (slope * supply);
    }

    /**
     * @notice Calculate the ETH cost to buy `tokenAmount` tokens at the current supply.
     * @dev Uses the bonding curve integral:
     *      cost = basePrice * tokens + slope * tokens * (2 * supply + tokens) / 2
     * @param tokenAmount Number of tokens to buy (18 decimals, must be whole-token multiple).
     * @return Total ETH cost in wei.
     */
    function getBuyPrice(uint256 tokenAmount) public view returns (uint256) {
        uint256 supply = totalSupply() / ONE_TOKEN;
        uint256 tokens = tokenAmount / ONE_TOKEN;
        if (tokens == 0) return 0;
        return basePrice * tokens + (slope * tokens * (2 * supply + tokens)) / 2;
    }

    /**
     * @notice Calculate the ETH refund for selling `tokenAmount` tokens.
     * @param tokenAmount Number of tokens to sell (18 decimals, must be whole-token multiple).
     * @return ETH refund in wei.
     */
    function getSellRefund(uint256 tokenAmount) public view returns (uint256) {
        uint256 supply = totalSupply() / ONE_TOKEN;
        uint256 tokens = tokenAmount / ONE_TOKEN;
        if (tokens == 0) revert BondingCurve__ZeroSellAmount();
        if (tokens > supply) revert BondingCurve__ExceedsSupply();

        uint256 newSupply = supply - tokens;
        return basePrice * tokens + (slope * tokens * (2 * newSupply + tokens)) / 2;
    }

    // ──────────────────────────────────────────────
    //  Trading Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Buy agent tokens by sending ETH. Excess ETH is refunded.
     * @dev Binary search finds max affordable whole-token amount.
     *      Uses OpenZeppelin Address.sendValue() for ETH refunds (AA/multisig compatible).
     *      Follows CEI: Checks -> Effects (_mint, reserveBalance) -> Interactions (refund).
     * @return tokenAmount Number of tokens minted to the buyer.
     */
    function buy() external payable nonReentrant returns (uint256) {
        // ── Checks ──
        if (msg.value == 0) revert BondingCurve__ZeroETHSent();

        // Binary search for max tokens affordable (whole-token granularity)
        uint256 low = ONE_TOKEN;
        uint256 high = (msg.value * ONE_TOKEN) / basePrice;
        if (high < low) high = low;

        // Snap to whole-token boundaries
        low = (low / ONE_TOKEN) * ONE_TOKEN;
        high = (high / ONE_TOKEN) * ONE_TOKEN;
        if (high < ONE_TOKEN) high = ONE_TOKEN;

        uint256 tokenAmount = 0;
        for (uint256 i = 0; i < 50; i++) {
            uint256 mid = ((low + high) / 2 / ONE_TOKEN) * ONE_TOKEN;
            if (mid < ONE_TOKEN) mid = ONE_TOKEN;
            uint256 midCost = getBuyPrice(mid);
            if (midCost <= msg.value) {
                tokenAmount = mid;
                low = mid + ONE_TOKEN;
            } else {
                if (mid == ONE_TOKEN) break;
                high = mid - ONE_TOKEN;
            }
            if (low > high) break;
        }

        uint256 cost = getBuyPrice(tokenAmount);
        if (tokenAmount < MIN_BUY_TOKENS) revert BondingCurve__BelowMinimumBuy();
        if (cost == 0) revert BondingCurve__ZeroCost();
        if (cost > msg.value) revert BondingCurve__InsufficientETH();

        // ── Effects ──
        _mint(msg.sender, tokenAmount);
        reserveBalance += cost;

        // ── Interactions ──
        if (msg.value > cost) {
            payable(msg.sender).sendValue(msg.value - cost);
        }

        emit TokensBought(msg.sender, tokenAmount, cost);
        return tokenAmount;
    }

    /**
     * @notice Sell agent tokens back to the bonding curve for ETH.
     * @dev Follows CEI: Checks -> Effects (_burn, reserveBalance) -> Interactions (refund).
     * @param tokenAmount Number of tokens to sell (must be whole-token multiple).
     */
    function sell(uint256 tokenAmount) external nonReentrant {
        // ── Checks ──
        if (tokenAmount < ONE_TOKEN) revert BondingCurve__SellBelowMinimum();
        if (balanceOf(msg.sender) < tokenAmount) revert BondingCurve__InsufficientBalance();

        // Snap to whole token to match pricing granularity
        uint256 wholeTokens = (tokenAmount / ONE_TOKEN) * ONE_TOKEN;
        if (wholeTokens == 0) revert BondingCurve__NotWholeTokenMultiple();

        uint256 refund = getSellRefund(wholeTokens);
        if (refund > reserveBalance) revert BondingCurve__InsufficientReserves();

        // ── Effects ──
        _burn(msg.sender, wholeTokens);
        reserveBalance -= refund;

        // ── Interactions ──
        payable(msg.sender).sendValue(refund);

        emit TokensSold(msg.sender, wholeTokens, refund);
    }

    // ──────────────────────────────────────────────
    //  CRE Adjuster Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Adjust the bonding curve slope based on agent performance.
     * @dev If tokens are outstanding, an upward slope adjustment is capped to
     *      maintain reserve solvency — the reserve must always cover the cost
     *      of buying back all outstanding tokens at the new slope.
     * @param newSlope The new slope value in wei per whole token.
     */
    function adjustSlope(uint256 newSlope) external {
        if (msg.sender != curveAdjuster) revert BondingCurve__NotAuthorizedAdjuster();
        if (newSlope > MAX_SLOPE) revert BondingCurve__SlopeExceedsMax();

        // Solvency check: if slope increases and tokens exist,
        // verify reserve can still cover full sellback at new slope.
        uint256 supply = totalSupply();
        if (supply > 0 && newSlope > slope) {
            uint256 supplyTokens = supply / ONE_TOKEN;
            uint256 newSellCost = basePrice * supplyTokens
                + (newSlope * supplyTokens * supplyTokens) / 2;
            if (newSellCost > reserveBalance) revert BondingCurve__SlopeWouldCauseInsolvency();
        }

        uint256 oldSlope = slope;
        slope = newSlope;

        emit SlopeAdjusted(oldSlope, newSlope);
    }
}
