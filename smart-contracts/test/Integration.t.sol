// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentMetrics} from "../src/AgentMetrics.sol";
import {AgentBondingCurve} from "../src/AgentBondingCurve.sol";
import {BondingCurveFactory} from "../src/BondingCurveFactory.sol";

/**
 * @title Integration Tests
 * @dev End-to-end tests that exercise the full protocol flow:
 *      Register agent -> Create curve -> Buy tokens -> CRE updates metrics ->
 *      CRE adjusts slope -> Price changes -> Sell tokens
 */
contract IntegrationTest is Test {
    AgentRegistry public registry;
    AgentMetrics public metrics;
    BondingCurveFactory public factory;

    address public deployer = address(this);
    address public creWorkflow = address(0xC8E0);
    address public agentWallet = address(0xA1);
    address public investor1 = address(0xBEEF);
    address public investor2 = address(0xCAFE);
    string[] public defaultCaps;

    function setUp() public {
        registry = new AgentRegistry();
        metrics = new AgentMetrics();
        metrics.setAuthorizedWriter(creWorkflow);
        factory = new BondingCurveFactory(0.0001 ether, 0.00001 ether);

        vm.deal(investor1, 100 ether);
        vm.deal(investor2, 100 ether);

        defaultCaps = new string[](2);
        defaultCaps[0] = "swap";
        defaultCaps[1] = "transfer";
    }

    // ─── E2E: Full Agent Lifecycle ───────────────

    function test_FullAgentLifecycle() public {
        // 1. Register agent
        uint256 agentId = registry.registerAgent(
            agentWallet, "AlphaYield", "yield_farming", "Multi-protocol yield optimizer", defaultCaps
        );
        assertEq(agentId, 1);

        // 2. Create bonding curve
        address curveAddr = factory.createCurve(agentId, "AlphaYield Shares", "AYS");
        AgentBondingCurve curve = AgentBondingCurve(curveAddr);
        curve.setCurveAdjuster(creWorkflow);

        // 3. CRE sets slope BEFORE major buying (safe to increase when supply is low)
        vm.prank(creWorkflow);
        curve.adjustSlope(0.00005 ether);

        // 4. Investor buys tokens at the higher slope
        vm.prank(investor1);
        uint256 tokens = curve.buy{value: 1 ether}();
        assertGt(tokens, 0);

        // 5. CRE workflow updates metrics (agent performing well)
        vm.prank(creWorkflow);
        metrics.updateMetrics(agentId, 150000, 7500, 3200, 18500, 1000000e6, 150);
        assertEq(metrics.getMetrics(agentId).roiBps, 150000);

        // 6. Second investor buys — pays more per token (supply increased)
        vm.prank(investor2);
        uint256 tokens2 = curve.buy{value: 1 ether}();
        assertLt(tokens2, tokens, "Second buyer should get fewer tokens");

        // 7. First investor sells for profit (price went up from second buyer)
        vm.prank(investor1);
        uint256 balanceBefore = investor1.balance;
        curve.sell(tokens);
        assertGt(investor1.balance - balanceBefore, 0, "Should profit");

        // 8. Second investor can still sell (reserve solvency)
        vm.prank(investor2);
        curve.sell(tokens2);
        assertEq(curve.totalSupply(), 0);
    }

    // ─── E2E: CRE Slope Decrease for Poor Performer ─

    function test_SlopeDecreaseForPoorPerformer() public {
        uint256 agentId = registry.registerAgent(agentWallet, "BadBot", "trading", "desc", defaultCaps);
        address curveAddr = factory.createCurve(agentId, "BadBot Shares", "BAD");
        AgentBondingCurve curve = AgentBondingCurve(curveAddr);
        curve.setCurveAdjuster(creWorkflow);

        // Investor buys at default slope
        vm.prank(investor1);
        uint256 tokens = curve.buy{value: 2 ether}();

        uint256 priceBefore = curve.currentPrice();

        // CRE updates: agent performing poorly -> decrease slope
        vm.prank(creWorkflow);
        metrics.updateMetrics(agentId, -30000, 3000, 8000, 5000, 100000e6, 50);

        // CRE decreases slope (always safe)
        vm.prank(creWorkflow);
        curve.adjustSlope(0.000002 ether);

        uint256 priceAfter = curve.currentPrice();
        assertLt(priceAfter, priceBefore, "Price should decrease with lower slope");

        // Investor sells at lower price — gets less back
        vm.prank(investor1);
        uint256 balanceBefore = investor1.balance;
        curve.sell(tokens);
        uint256 refund = investor1.balance - balanceBefore;

        assertLt(refund, 2 ether, "Should get less back after slope decrease");
        assertGt(refund, 0, "Should still get something back");
    }

    // ─── E2E: Solvency check blocks dangerous slope increases ─

    function test_SolvencyCheckBlocksDangerousIncrease() public {
        uint256 agentId = registry.registerAgent(agentWallet, "Bot1", "trading", "desc", defaultCaps);
        address curveAddr = factory.createCurve(agentId, "Bot1 Shares", "B1S");
        AgentBondingCurve curve = AgentBondingCurve(curveAddr);
        curve.setCurveAdjuster(creWorkflow);

        // Buy tokens at default slope
        vm.prank(investor1);
        curve.buy{value: 5 ether}();

        // Attempt to increase slope significantly — should be blocked by solvency check
        vm.prank(creWorkflow);
        vm.expectRevert(AgentBondingCurve.BondingCurve__SlopeWouldCauseInsolvency.selector);
        curve.adjustSlope(0.00005 ether);

        // Decrease is always safe
        vm.prank(creWorkflow);
        curve.adjustSlope(0.000005 ether);
        assertEq(curve.slope(), 0.000005 ether);
    }

    // ─── E2E: Multi-Agent Ecosystem ──────────────

    function test_MultiAgentEcosystem() public {
        // Register 3 agents
        uint256 id1 = registry.registerAgent(address(0xA1), "Bot1", "trading", "desc", defaultCaps);
        uint256 id2 = registry.registerAgent(address(0xA2), "Bot2", "yield", "desc", defaultCaps);
        uint256 id3 = registry.registerAgent(address(0xA3), "Bot3", "arb", "desc", defaultCaps);

        // Create curves for all
        address curve1 = factory.createCurve(id1, "Bot1 Shares", "B1S");
        address curve2 = factory.createCurve(id2, "Bot2 Shares", "B2S");
        address curve3 = factory.createCurve(id3, "Bot3 Shares", "B3S");

        AgentBondingCurve(curve1).setCurveAdjuster(creWorkflow);
        AgentBondingCurve(curve2).setCurveAdjuster(creWorkflow);
        AgentBondingCurve(curve3).setCurveAdjuster(creWorkflow);

        // CRE pre-adjusts slopes based on initial analysis (before trading)
        vm.startPrank(creWorkflow);
        AgentBondingCurve(curve1).adjustSlope(0.00003 ether);
        AgentBondingCurve(curve2).adjustSlope(0.00001 ether);
        AgentBondingCurve(curve3).adjustSlope(0.000003 ether);
        vm.stopPrank();

        // Investors buy
        vm.startPrank(investor1);
        AgentBondingCurve(curve1).buy{value: 2 ether}();
        AgentBondingCurve(curve2).buy{value: 1 ether}();
        AgentBondingCurve(curve3).buy{value: 0.5 ether}();
        vm.stopPrank();

        // CRE updates metrics for all
        vm.startPrank(creWorkflow);
        metrics.updateMetrics(id1, 200000, 8000, 2000, 20000, 2000000e6, 500);
        metrics.updateMetrics(id2, 50000, 6000, 4000, 12000, 500000e6, 100);
        metrics.updateMetrics(id3, -30000, 3000, 8000, 5000, 100000e6, 50);
        vm.stopPrank();

        // Verify batch metrics
        uint256[] memory ids = new uint256[](3);
        ids[0] = id1; ids[1] = id2; ids[2] = id3;
        AgentMetrics.Metrics[] memory batch = metrics.getBatchMetrics(ids);
        assertEq(batch[0].roiBps, 200000);
        assertEq(batch[2].roiBps, -30000);

        // CRE decreases slope for poor performer (always safe)
        vm.prank(creWorkflow);
        AgentBondingCurve(curve3).adjustSlope(0.000001 ether);

        // Factory & Registry track everything
        assertEq(factory.getAllAgentIds().length, 3);
        assertEq(registry.getActiveAgentIds().length, 3);
    }

    // ─── Edge: Deactivated agent tokens still tradable ─

    function test_DeactivatedAgentTokensStillTradable() public {
        uint256 agentId = registry.registerAgent(agentWallet, "Bot1", "trading", "desc", defaultCaps);
        address curveAddr = factory.createCurve(agentId, "Bot1 Shares", "B1S");
        AgentBondingCurve curve = AgentBondingCurve(curveAddr);

        vm.prank(investor1);
        uint256 tokens = curve.buy{value: 1 ether}();

        // Deactivate — funds should NOT be locked
        registry.deactivateAgent(agentId);
        assertFalse(registry.getAgent(agentId).isActive);

        vm.prank(investor1);
        curve.sell(tokens);
        assertEq(curve.totalSupply(), 0);
    }

    // ─── Edge: Zero slope flat pricing ───────────

    function test_ZeroSlopeFlatPricing() public {
        uint256 agentId = registry.registerAgent(agentWallet, "FlatBot", "stable", "desc", defaultCaps);
        address curveAddr = factory.createCurve(agentId, "FlatBot Shares", "FLAT");
        AgentBondingCurve curve = AgentBondingCurve(curveAddr);
        curve.setCurveAdjuster(creWorkflow);

        vm.prank(creWorkflow);
        curve.adjustSlope(0);

        uint256 priceBefore = curve.currentPrice();
        assertEq(priceBefore, 0.0001 ether);

        vm.prank(investor1);
        uint256 tokens = curve.buy{value: 1 ether}();

        uint256 priceAfter = curve.currentPrice();
        assertEq(priceAfter, priceBefore, "Price should stay flat with zero slope");

        vm.prank(investor1);
        uint256 balBefore = investor1.balance;
        curve.sell(tokens);
        assertGt(investor1.balance - balBefore, 0);
    }

    // ─── Edge: Metrics for non-existent agent ────

    function test_MetricsForNonExistentAgent() public view {
        AgentMetrics.Metrics memory m = metrics.getMetrics(999);
        assertEq(m.roiBps, 0);
        assertEq(m.lastUpdated, 0);
    }

    // ─── Edge: Batch metrics with empty array ────

    function test_BatchMetricsEmptyArray() public view {
        uint256[] memory ids = new uint256[](0);
        AgentMetrics.Metrics[] memory batch = metrics.getBatchMetrics(ids);
        assertEq(batch.length, 0);
    }

    // ─── Edge: Long strings ─────────────────────

    function test_LongStringRegistration() public {
        bytes memory longStr = new bytes(500);
        for (uint256 i = 0; i < 500; i++) {
            longStr[i] = "A";
        }

        uint256 agentId = registry.registerAgent(
            address(0xDEAD), string(longStr), "strategy", string(longStr), defaultCaps
        );
        assertEq(bytes(registry.getAgent(agentId).name).length, 500);
    }
}
