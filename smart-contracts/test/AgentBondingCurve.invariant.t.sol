// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentBondingCurve} from "../src/AgentBondingCurve.sol";

/**
 * @title AgentBondingCurve Invariant Tests
 * @dev Stateful invariant testing — Foundry executes random sequences of
 *      buy/sell/adjustSlope calls and checks that protocol invariants hold
 *      after EVERY call in the sequence.
 *
 *      Invariants verified:
 *        1. Reserve solvency: reserve >= cost to buy back all outstanding tokens
 *        2. Supply/balance consistency: contract ETH balance >= reserveBalance
 *        3. Price monotonicity: price >= basePrice always
 *        4. Slope within bounds: slope <= MAX_SLOPE
 *        5. Whole-token supply: totalSupply % 1e18 == 0
 */
contract BondingCurveHandler is Test {
    AgentBondingCurve public curve;
    address[] public actors;

    constructor(AgentBondingCurve _curve) {
        curve = _curve;
        for (uint256 i = 1; i <= 5; i++) {
            // forge-lint: disable-next-line(unsafe-typecast)
            address actor = address(uint160(0xA000 + i));
            actors.push(actor);
            vm.deal(actor, 100 ether);
        }
    }

    function buy(uint256 actorSeed, uint256 ethAmount) external {
        address actor = actors[actorSeed % actors.length];
        ethAmount = bound(ethAmount, 0.001 ether, 5 ether);

        vm.prank(actor);
        try curve.buy{value: ethAmount}() returns (uint256) {} catch {}
    }

    function sell(uint256 actorSeed, uint256 pctToSell) external {
        address actor = actors[actorSeed % actors.length];
        uint256 balance = curve.balanceOf(actor);
        if (balance < 1e18) return;

        pctToSell = bound(pctToSell, 1, 100);
        uint256 sellAmount = (balance * pctToSell / 100 / 1e18) * 1e18;
        if (sellAmount == 0) sellAmount = 1e18;
        if (sellAmount > balance) sellAmount = balance;

        vm.prank(actor);
        try curve.sell(sellAmount) {} catch {}
    }

    function adjustSlope(uint256 newSlope) external {
        newSlope = bound(newSlope, 0, curve.MAX_SLOPE());
        vm.prank(curve.curveAdjuster());
        try curve.adjustSlope(newSlope) {} catch {}
    }
}

contract AgentBondingCurveInvariantTest is Test {
    AgentBondingCurve public curve;
    BondingCurveHandler public handler;

    function setUp() public {
        curve = new AgentBondingCurve("InvariantBot", "INV", 1, 0.0001 ether, 0.00001 ether);
        curve.setCurveAdjuster(address(0xCCCC));

        handler = new BondingCurveHandler(curve);
        targetContract(address(handler));
    }

    /// @dev Reserve must always hold enough ETH to buy back all outstanding tokens.
    function invariant_reserveSolvency() public view {
        uint256 supply = curve.totalSupply();
        if (supply == 0) {
            // Reserve can be > 0 when supply is 0 if slope decreased between buy/sell.
            // Leftover ETH is protocol revenue — not a bug.
            return;
        }

        uint256 sellBackCost = curve.getSellRefund(supply);
        // Allow up to (supply / 1e18) wei tolerance for integer rounding across multiple buys.
        uint256 tolerance = supply / 1e18;
        if (tolerance == 0) tolerance = 1;
        assertGe(
            curve.reserveBalance() + tolerance,
            sellBackCost,
            "CRITICAL: Reserve cannot cover all token sellbacks"
        );
    }

    /// @dev Actual ETH in the contract >= tracked reserve.
    function invariant_ethBalanceCoversReserve() public view {
        assertGe(
            address(curve).balance,
            curve.reserveBalance(),
            "Contract ETH balance less than tracked reserve"
        );
    }

    /// @dev currentPrice() >= basePrice always.
    function invariant_priceFloor() public view {
        assertGe(curve.currentPrice(), curve.basePrice(), "Price fell below basePrice");
    }

    /// @dev slope <= MAX_SLOPE always.
    function invariant_slopeBounds() public view {
        assertLe(curve.slope(), curve.MAX_SLOPE(), "Slope exceeds MAX_SLOPE");
    }

    /// @dev totalSupply is always a multiple of 1e18.
    function invariant_wholeTokenSupply() public view {
        assertEq(curve.totalSupply() % 1e18, 0, "Supply is not a whole-token multiple");
    }
}
