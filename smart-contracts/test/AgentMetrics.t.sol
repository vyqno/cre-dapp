// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentMetrics} from "../src/AgentMetrics.sol";

contract AgentMetricsTest is Test {
    AgentMetrics public metrics;
    address public creWorkflow = address(0xCCCC);

    function setUp() public {
        metrics = new AgentMetrics();
        metrics.setAuthorizedWriter(creWorkflow);
    }

    function test_UpdateMetrics() public {
        vm.prank(creWorkflow);
        metrics.updateMetrics(1, 152500, 7500, 3200, 18500, 1000000e6, 150);

        AgentMetrics.Metrics memory m = metrics.getMetrics(1);
        assertEq(m.roiBps, 152500);
        assertEq(m.winRateBps, 7500);
        assertEq(m.maxDrawdownBps, 3200);
        assertEq(m.totalTrades, 150);
        assertGt(m.lastUpdated, 0);
    }

    function test_OnlyAuthorizedWriter() public {
        vm.prank(address(0x9999));
        vm.expectRevert(AgentMetrics.Metrics__NotAuthorized.selector);
        metrics.updateMetrics(1, 100, 100, 100, 100, 100, 100);
    }

    function test_MetricsHistory() public {
        vm.startPrank(creWorkflow);
        metrics.updateMetrics(1, 100, 5000, 1000, 10000, 500e6, 10);

        vm.warp(block.timestamp + 60);
        metrics.updateMetrics(1, 200, 6000, 900, 12000, 600e6, 20);
        vm.stopPrank();

        assertEq(metrics.getUpdateCount(1), 2);

        AgentMetrics.Metrics memory latest = metrics.getMetrics(1);
        assertEq(latest.roiBps, 200);
        assertEq(latest.totalTrades, 20);
    }

    function test_BatchMetrics() public {
        vm.startPrank(creWorkflow);
        metrics.updateMetrics(1, 100, 5000, 1000, 10000, 500e6, 10);
        metrics.updateMetrics(2, 200, 6000, 800, 15000, 700e6, 25);
        metrics.updateMetrics(3, 50, 4000, 2000, 8000, 300e6, 5);
        vm.stopPrank();

        uint256[] memory agentIds = new uint256[](3);
        agentIds[0] = 1;
        agentIds[1] = 2;
        agentIds[2] = 3;

        AgentMetrics.Metrics[] memory batch = metrics.getBatchMetrics(agentIds);
        assertEq(batch.length, 3);
        assertEq(batch[1].roiBps, 200);
    }

    function test_TrackedAgentIds() public {
        vm.startPrank(creWorkflow);
        metrics.updateMetrics(1, 100, 5000, 1000, 10000, 500e6, 10);
        metrics.updateMetrics(5, 200, 6000, 800, 15000, 700e6, 25);
        vm.stopPrank();

        uint256[] memory tracked = metrics.getTrackedAgentIds();
        assertEq(tracked.length, 2);
        assertEq(tracked[0], 1);
        assertEq(tracked[1], 5);
    }

    function test_NegativeRoi() public {
        vm.prank(creWorkflow);
        metrics.updateMetrics(1, -50000, 3000, 5000, 0, 800e6, 30);

        AgentMetrics.Metrics memory m = metrics.getMetrics(1);
        assertEq(m.roiBps, -50000);
    }

    function test_SetWriterRejectsZeroAddress() public {
        vm.expectRevert(AgentMetrics.Metrics__InvalidWriterAddress.selector);
        metrics.setAuthorizedWriter(address(0));
    }

    function test_InvalidWinRateReverts() public {
        vm.prank(creWorkflow);
        vm.expectRevert(AgentMetrics.Metrics__InvalidWinRate.selector);
        metrics.updateMetrics(1, 100, 10001, 1000, 10000, 500e6, 10);
    }

    function test_InvalidDrawdownReverts() public {
        vm.prank(creWorkflow);
        vm.expectRevert(AgentMetrics.Metrics__InvalidDrawdown.selector);
        metrics.updateMetrics(1, 100, 5000, 10001, 10000, 500e6, 10);
    }
}
