// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentBondingCurve} from "../src/AgentBondingCurve.sol";

/**
 * @title AgentBondingCurve Fuzz Tests
 * @dev Property-based testing with randomized inputs.
 *      Validates bonding curve math, reserve solvency, and edge cases
 *      across thousands of random scenarios.
 */
contract AgentBondingCurveFuzzTest is Test {
    AgentBondingCurve public curve;
    address public buyer = address(0xBEEF);
    address public curveAdjuster = address(0xCCCC);

    function setUp() public {
        curve = new AgentBondingCurve("FuzzBot", "FUZZ", 1, 0.0001 ether, 0.00001 ether);
        curve.setCurveAdjuster(curveAdjuster);
        vm.deal(buyer, 1_000_000 ether);
    }

    // ─── Fuzz: Buy with random ETH amounts ───────

    function testFuzz_BuyRandomAmount(uint256 ethAmount) public {
        ethAmount = bound(ethAmount, 0.001 ether, 100 ether);

        vm.prank(buyer);
        uint256 tokens = curve.buy{value: ethAmount}();

        assertEq(tokens % 1e18, 0, "Tokens not whole-token multiple");
        assertGt(tokens, 0, "Should receive at least 1 token");
        assertGt(curve.reserveBalance(), 0, "Reserve should be positive");
        assertEq(curve.balanceOf(buyer), tokens, "Balance mismatch");
        assertLe(curve.reserveBalance(), ethAmount, "Reserve exceeds deposit");
    }

    // ─── Fuzz: Buy then sell (reserve solvency) ──

    function testFuzz_BuyThenSellAll(uint256 ethAmount) public {
        ethAmount = bound(ethAmount, 0.001 ether, 50 ether);

        vm.startPrank(buyer);
        uint256 balanceBefore = buyer.balance;

        uint256 tokens = curve.buy{value: ethAmount}();
        curve.sell(tokens);

        vm.stopPrank();

        assertEq(curve.totalSupply(), 0, "Supply should be 0 after full sell");
        assertEq(curve.reserveBalance(), 0, "Reserve should be 0 after full sell");

        uint256 balanceAfter = buyer.balance;
        assertApproxEqAbs(balanceAfter, balanceBefore, 1, "Buyer should get ETH back");
    }

    // ─── Fuzz: Partial sell preserves solvency ───

    function testFuzz_PartialSellSolvency(uint256 ethAmount, uint256 sellPct) public {
        ethAmount = bound(ethAmount, 0.01 ether, 20 ether);
        sellPct = bound(sellPct, 1, 100);

        vm.startPrank(buyer);
        uint256 tokens = curve.buy{value: ethAmount}();

        uint256 sellTokens = (tokens * sellPct / 100 / 1e18) * 1e18;
        if (sellTokens == 0) sellTokens = 1e18;
        if (sellTokens > tokens) sellTokens = tokens;

        curve.sell(sellTokens);
        vm.stopPrank();

        assertGe(curve.reserveBalance(), 0, "Reserve went negative");

        uint256 remainingTokens = curve.totalSupply();
        if (remainingTokens > 0) {
            uint256 sellBackCost = curve.getSellRefund(remainingTokens);
            assertGe(
                curve.reserveBalance(),
                sellBackCost,
                "Reserve insufficient to back remaining tokens"
            );
        }
    }

    // ─── Fuzz: Multiple buyers then sellers ──────

    function testFuzz_MultipleBuyers(uint256 eth1, uint256 eth2) public {
        eth1 = bound(eth1, 0.01 ether, 10 ether);
        eth2 = bound(eth2, 0.1 ether, 10 ether);

        address buyer2 = address(0xCAFE);
        vm.deal(buyer2, 1000 ether);

        vm.prank(buyer);
        uint256 tokens1 = curve.buy{value: eth1}();

        vm.prank(buyer2);
        uint256 tokens2 = curve.buy{value: eth2}();

        if (eth1 == eth2) {
            assertLe(tokens2, tokens1, "Second buyer should get <= first buyer's tokens");
        }

        // LIFO sell order
        vm.prank(buyer2);
        curve.sell(tokens2);

        vm.prank(buyer);
        curve.sell(tokens1);

        assertEq(curve.totalSupply(), 0, "Supply should be 0");
        assertEq(curve.reserveBalance(), 0, "Reserve should be 0");
    }

    // ─── Fuzz: Price monotonically increases ─────

    function testFuzz_PriceMonotonicallyIncreases(uint256 ethAmount) public {
        ethAmount = bound(ethAmount, 0.001 ether, 10 ether);

        uint256 priceBefore = curve.currentPrice();

        vm.prank(buyer);
        curve.buy{value: ethAmount}();

        uint256 priceAfter = curve.currentPrice();
        assertGe(priceAfter, priceBefore, "Price should not decrease after buy");
    }

    // ─── Fuzz: Buy-sell symmetry at same supply ──

    function testFuzz_BuySellSymmetry(uint256 ethAmount) public {
        ethAmount = bound(ethAmount, 0.01 ether, 10 ether);

        vm.startPrank(buyer);
        uint256 balanceBefore = buyer.balance;

        uint256 tokens = curve.buy{value: ethAmount}();
        uint256 costPaid = balanceBefore - buyer.balance;

        uint256 balanceBeforeSell = buyer.balance;
        curve.sell(tokens);
        uint256 refundReceived = buyer.balance - balanceBeforeSell;

        vm.stopPrank();

        assertEq(refundReceived, costPaid, "Buy-sell should be symmetric");
    }

    // ─── Fuzz: Slope adjustment bounds ───────────

    function testFuzz_AdjustSlopeBounds(uint256 newSlope) public {
        if (newSlope > curve.MAX_SLOPE()) {
            vm.prank(curveAdjuster);
            vm.expectRevert(AgentBondingCurve.BondingCurve__SlopeExceedsMax.selector);
            curve.adjustSlope(newSlope);
        } else {
            vm.prank(curveAdjuster);
            curve.adjustSlope(newSlope);
            assertEq(curve.slope(), newSlope);
        }
    }

    // ─── Fuzz: Slope increase with supply (solvency check) ─

    function testFuzz_SlopeIncreasePreservesSolvency(uint256 ethAmount, uint256 newSlope) public {
        ethAmount = bound(ethAmount, 0.01 ether, 10 ether);
        newSlope = bound(newSlope, curve.slope(), curve.MAX_SLOPE());

        vm.prank(buyer);
        curve.buy{value: ethAmount}();

        vm.prank(curveAdjuster);
        try curve.adjustSlope(newSlope) {
            uint256 supply = curve.totalSupply();
            if (supply > 0) {
                uint256 sellBack = curve.getSellRefund(supply);
                assertGe(curve.reserveBalance(), sellBack, "Solvency violated after slope increase");
            }
        } catch {
            // Revert is acceptable — solvency check working correctly
        }
    }

    // ─── Fuzz: Tiny buy amounts ──────────────────

    function testFuzz_TinyBuyAmounts(uint256 ethAmount) public {
        ethAmount = bound(ethAmount, 1, 0.0001 ether);

        vm.prank(buyer);
        try curve.buy{value: ethAmount}() returns (uint256 tokens) {
            assertGe(tokens, 1e18, "Should buy at least 1 token");
        } catch {
            // Reverting on tiny amounts is acceptable
        }
    }
}
