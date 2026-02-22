// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "src/AgentBondingCurve.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BondingCurveFactory
 * @author Hitesh (vyqno)
 * @notice Factory contract that deploys a new `AgentBondingCurve` for each
 *         registered AI agent.
 * @dev Each agent ID can only have one bonding curve. The factory uses
 *      `defaultBasePrice` and `defaultSlope` for every new curve and transfers
 *      ownership of the newly created curve to the caller.
 */
contract BondingCurveFactory is Ownable {
    // ──────────────────────────────────────────────
    //  Custom Errors
    // ──────────────────────────────────────────────

    /// @dev Thrown when a bonding curve already exists for the given agent ID.
    error Factory__CurveAlreadyExists();

    /// @dev Thrown when default base price is set to zero.
    error Factory__ZeroBasePrice();

    /// @dev Thrown when default slope exceeds AgentBondingCurve.MAX_SLOPE.
    error Factory__SlopeExceedsMax();

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Default base price applied to every new bonding curve (in wei).
    uint256 public immutable defaultBasePrice;

    /// @notice Default slope applied to every new bonding curve (in wei).
    uint256 public immutable defaultSlope;

    /// @notice Mapping from agent ID -> deployed bonding curve address.
    mapping(uint256 => address) public agentCurves;

    /// @notice Array of all agent IDs that have a deployed bonding curve.
    uint256[] public allAgentIds;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a new bonding curve is created for an agent.
    event CurveCreated(uint256 indexed agentId, address curveAddress);

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @notice Deploy the factory with default curve parameters.
     * @param _basePrice Default base price for new curves (in wei, must be > 0).
     * @param _slope     Default slope for new curves (in wei per whole token).
     */
    constructor(uint256 _basePrice, uint256 _slope) Ownable(msg.sender) {
        if (_basePrice == 0) revert Factory__ZeroBasePrice();
        if (_slope > 0.01 ether) revert Factory__SlopeExceedsMax();

        defaultBasePrice = _basePrice;
        defaultSlope = _slope;
    }

    // ──────────────────────────────────────────────
    //  External Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Deploy a new `AgentBondingCurve` for the given agent.
     * @dev Reverts if a curve already exists for `agentId`. Ownership of the new
     *      curve is transferred to `msg.sender` so the caller can configure the
     *      curve adjuster and other settings.
     * @param agentId The agent ID to create a curve for.
     * @param name    ERC-20 token name for the curve (e.g. "Bot1 Shares").
     * @param symbol  ERC-20 token symbol (e.g. "BOT1").
     * @return curveAddress The address of the newly deployed bonding curve.
     */
    function createCurve(
        uint256 agentId,
        string calldata name,
        string calldata symbol
    ) external onlyOwner returns (address) {
        if (agentCurves[agentId] != address(0)) revert Factory__CurveAlreadyExists();

        AgentBondingCurve curve = new AgentBondingCurve(
            name,
            symbol,
            agentId,
            defaultBasePrice,
            defaultSlope
        );
        curve.transferOwnership(msg.sender);

        agentCurves[agentId] = address(curve);
        allAgentIds.push(agentId);

        emit CurveCreated(agentId, address(curve));
        return address(curve);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Get the bonding curve address for a given agent.
     * @param agentId The agent ID to look up.
     * @return curveAddress The bonding curve address (zero if none exists).
     */
    function getCurve(uint256 agentId) external view returns (address) {
        return agentCurves[agentId];
    }

    /**
     * @notice Return all agent IDs that have a deployed bonding curve.
     * @return ids Array of agent IDs.
     */
    function getAllAgentIds() external view returns (uint256[] memory) {
        return allAgentIds;
    }
}
