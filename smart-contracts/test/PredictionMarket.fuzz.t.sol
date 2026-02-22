// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentMetrics} from "../src/AgentMetrics.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

contract PredictionMarketFuzzTest is Test {
    AgentMetrics public metrics;
    PredictionMarket public pm;

    address public creWorkflow = address(0xCCCC);
    uint256 public deadline;

    function setUp() public {
        metrics = new AgentMetrics();
        metrics.setAuthorizedWriter(creWorkflow);

        vm.prank(creWorkflow);
        metrics.updateMetrics(1, 185000, 7800, 3200, 18500, 1500000e6, 200);

        pm = new PredictionMarket(address(metrics));
        deadline = block.timestamp + 7 days;
    }

    // ── Fuzz: random bet amounts ──

    function testFuzz_betRandomAmount(uint256 amount) public {
        amount = bound(amount, 0.001 ether, 100 ether);

        address alice = address(0xA11CE);
        vm.deal(alice, amount);

        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, 150000, deadline);

        vm.prank(alice);
        pm.betYes{value: amount}(1);

        assertEq(pm.yesStakes(1, alice), amount);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(m.totalYes, amount);
    }

    // ── Fuzz: random thresholds resolve without revert ──

    function testFuzz_resolutionThreshold(int256 threshold) public {
        threshold = bound(threshold, -1e12, 1e12);

        address alice = address(0xA11CE);
        address bob = address(0xB0B);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, threshold, deadline);

        vm.prank(alice);
        pm.betYes{value: 1 ether}(1);
        vm.prank(bob);
        pm.betNo{value: 1 ether}(1);

        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertTrue(
            uint8(m.status) == uint8(PredictionMarket.Status.RESOLVED_YES)
                || uint8(m.status) == uint8(PredictionMarket.Status.RESOLVED_NO)
        );
    }

    // ── Fuzz: multiple users betting, balance invariant ──

    function testFuzz_multipleUsersBetting(uint8 numUsers) public {
        numUsers = uint8(bound(uint256(numUsers), 2, 20));

        address alice = address(0xA11CE);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, 150000, deadline);

        uint256 expectedTotal;
        for (uint256 i = 0; i < numUsers; i++) {
            address user = address(uint160(0xF000 + i));
            uint256 betAmount = 0.1 ether + (i * 0.01 ether);
            vm.deal(user, betAmount);

            vm.prank(user);
            if (i % 2 == 0) {
                pm.betYes{value: betAmount}(1);
            } else {
                pm.betNo{value: betAmount}(1);
            }
            expectedTotal += betAmount;
        }

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(m.totalYes + m.totalNo, expectedTotal);
        assertEq(address(pm).balance, expectedTotal);
    }
}
