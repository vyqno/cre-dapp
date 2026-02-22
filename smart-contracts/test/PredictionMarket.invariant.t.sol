// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentMetrics} from "../src/AgentMetrics.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

contract PredictionMarketHandler is Test {
    PredictionMarket public pm;
    uint256 public marketId;

    uint256 public ghost_totalYes;
    uint256 public ghost_totalNo;

    address[] public users;

    constructor(PredictionMarket _pm, uint256 _marketId) {
        pm = _pm;
        marketId = _marketId;

        // Create 5 users with funds
        for (uint256 i = 0; i < 5; i++) {
            address user = address(uint160(0xBEE0 + i));
            vm.deal(user, 1000 ether);
            users.push(user);
        }
    }

    function betYes(uint256 userIdx, uint256 amount) external {
        userIdx = bound(userIdx, 0, users.length - 1);
        amount = bound(amount, 0.001 ether, 10 ether);

        address user = users[userIdx];
        PredictionMarket.Market memory m = pm.getMarket(marketId);
        if (uint8(m.status) != uint8(PredictionMarket.Status.OPEN)) return;
        if (block.timestamp >= m.deadline) return;

        vm.prank(user);
        pm.betYes{value: amount}(marketId);
        ghost_totalYes += amount;
    }

    function betNo(uint256 userIdx, uint256 amount) external {
        userIdx = bound(userIdx, 0, users.length - 1);
        amount = bound(amount, 0.001 ether, 10 ether);

        address user = users[userIdx];
        PredictionMarket.Market memory m = pm.getMarket(marketId);
        if (uint8(m.status) != uint8(PredictionMarket.Status.OPEN)) return;
        if (block.timestamp >= m.deadline) return;

        vm.prank(user);
        pm.betNo{value: amount}(marketId);
        ghost_totalNo += amount;
    }
}

contract PredictionMarketInvariantTest is Test {
    AgentMetrics public metrics;
    PredictionMarket public pm;
    PredictionMarketHandler public handler;

    address public creWorkflow = address(0xCCCC);
    uint256 public deadline;

    function setUp() public {
        metrics = new AgentMetrics();
        metrics.setAuthorizedWriter(creWorkflow);

        vm.prank(creWorkflow);
        metrics.updateMetrics(1, 185000, 7800, 3200, 18500, 1500000e6, 200);

        pm = new PredictionMarket(address(metrics));
        deadline = block.timestamp + 7 days;

        // Create a market
        pm.createMarket(1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, 150000, deadline);

        handler = new PredictionMarketHandler(pm, 1);

        targetContract(address(handler));
    }

    // ── Invariant: contract balance matches stakes while OPEN ──

    function invariant_contractBalanceMatchesStakes() public view {
        PredictionMarket.Market memory m = pm.getMarket(1);
        if (uint8(m.status) == uint8(PredictionMarket.Status.OPEN)) {
            assertEq(address(pm).balance, m.totalYes + m.totalNo);
        }
    }

    // ── Invariant: ghost tracking matches on-chain state ──

    function invariant_ghostMatchesOnChain() public view {
        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(m.totalYes, handler.ghost_totalYes());
        assertEq(m.totalNo, handler.ghost_totalNo());
    }
}
