// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentMetrics} from "../src/AgentMetrics.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

contract PredictionMarketTest is Test {
    AgentMetrics public metrics;
    PredictionMarket public pm;

    address public creWorkflow = address(0xCCCC);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public charlie = address(0xC4A2);

    uint256 public deadline;

    function setUp() public {
        // Deploy AgentMetrics and set authorized writer
        metrics = new AgentMetrics();
        metrics.setAuthorizedWriter(creWorkflow);

        // Seed metrics for agent 1
        vm.prank(creWorkflow);
        metrics.updateMetrics(1, 185000, 7800, 3200, 18500, 1500000e6, 200);

        // Seed metrics for agent 2
        vm.prank(creWorkflow);
        metrics.updateMetrics(2, 50000, 5500, 4500, 12000, 800000e6, 80);

        // Deploy PredictionMarket
        pm = new PredictionMarket(address(metrics));

        // Default deadline: 7 days from now
        deadline = block.timestamp + 7 days;

        // Fund test accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    // ── Test 1: Create Market ──

    function test_createMarket() public {
        vm.prank(alice);
        uint256 marketId = pm.createMarket(
            1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, 150000, deadline
        );

        assertEq(marketId, 1);
        assertEq(pm.nextMarketId(), 2);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(m.agentId, 1);
        assertEq(uint8(m.metric), uint8(PredictionMarket.MetricField.ROI));
        assertEq(uint8(m.comparison), uint8(PredictionMarket.Comparison.ABOVE));
        assertEq(m.threshold, 150000);
        assertEq(m.deadline, deadline);
        assertEq(m.creator, alice);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.OPEN));
        assertEq(m.totalYes, 0);
        assertEq(m.totalNo, 0);

        assertEq(pm.getMarketCount(), 1);

        uint256[] memory ids = pm.getAllMarketIds();
        assertEq(ids.length, 1);
        assertEq(ids[0], 1);
    }

    // ── Test 2: Create Market Deadline Too Soon ──

    function test_createMarket_deadlineTooSoon() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.PM__DeadlineTooSoon.selector);
        pm.createMarket(1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, 150000, block.timestamp + 30 minutes);
    }

    // ── Test 3: Bet YES ──

    function test_betYes() public {
        _createDefaultMarket();

        vm.prank(alice);
        pm.betYes{value: 1 ether}(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(m.totalYes, 1 ether);
        assertEq(m.totalNo, 0);
        assertEq(pm.yesStakes(1, alice), 1 ether);
    }

    // ── Test 4: Bet NO ──

    function test_betNo() public {
        _createDefaultMarket();

        vm.prank(bob);
        pm.betNo{value: 2 ether}(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(m.totalYes, 0);
        assertEq(m.totalNo, 2 ether);
        assertEq(pm.noStakes(1, bob), 2 ether);
    }

    // ── Test 5: Bet Zero Reverts ──

    function test_betZeroReverts() public {
        _createDefaultMarket();

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.PM__ZeroBet.selector);
        pm.betYes{value: 0}(1);
    }

    // ── Test 6: Bet After Deadline Reverts ──

    function test_betAfterDeadlineReverts() public {
        _createDefaultMarket();

        vm.warp(deadline + 1);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.PM__DeadlinePassed.selector);
        pm.betYes{value: 1 ether}(1);
    }

    // ── Test 7: Resolve ABOVE -> YES (metric above threshold) ──

    function test_resolveAboveYes() public {
        // Agent 1 ROI = 185000, threshold = 150000, comparison = ABOVE
        _createDefaultMarket();
        _placeBets();

        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.RESOLVED_YES));
    }

    // ── Test 8: Resolve ABOVE -> NO (metric below threshold) ──

    function test_resolveAboveNo() public {
        // Agent 1 ROI = 185000, threshold = 200000, comparison = ABOVE
        // 185000 < 200000, so condition NOT met -> RESOLVED_NO
        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, 200000, deadline);

        _placeBets();

        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.RESOLVED_NO));
    }

    // ── Test 9: Resolve BELOW -> YES (metric below threshold with BELOW comparison) ──

    function test_resolveBelowYes() public {
        // Agent 2 ROI = 50000, threshold = 100000, comparison = BELOW
        // 50000 <= 100000, condition met -> RESOLVED_YES
        vm.prank(alice);
        pm.createMarket(2, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.BELOW, 100000, deadline);

        _placeBets();

        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.RESOLVED_YES));
    }

    // ── Test 10: Resolve Before Deadline Reverts ──

    function test_resolveBeforeDeadlineReverts() public {
        _createDefaultMarket();
        _placeBets();

        vm.expectRevert(PredictionMarket.PM__DeadlineNotPassed.selector);
        pm.resolve(1);
    }

    // ── Test 11: Claim Winner Payout ──

    function test_claimWinnerPayout() public {
        // Agent 1 ROI = 185000, threshold = 150000 -> RESOLVED_YES
        _createDefaultMarket();

        // Alice bets 3 ETH YES, Bob bets 2 ETH NO
        vm.prank(alice);
        pm.betYes{value: 3 ether}(1);
        vm.prank(bob);
        pm.betNo{value: 2 ether}(1);

        // Resolve -> YES wins
        vm.warp(deadline + 1);
        pm.resolve(1);

        // Alice claims: pool = 5 ETH, her share = (3 * 5) / 3 = 5 ETH
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        pm.claim(1);
        uint256 balAfter = alice.balance;

        assertEq(balAfter - balBefore, 5 ether);

        // Bob (loser) can't claim
        vm.prank(bob);
        vm.expectRevert(PredictionMarket.PM__NothingToClaim.selector);
        pm.claim(1);
    }

    // ── Test 12: Claim Cancelled Refund ──

    function test_claimCancelledRefund() public {
        _createDefaultMarket();

        // Only Alice bets YES, nobody on NO -> will be cancelled
        vm.prank(alice);
        pm.betYes{value: 1 ether}(1);

        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.CANCELLED));

        // Alice gets refund
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        pm.claim(1);
        assertEq(alice.balance - balBefore, 1 ether);
    }

    // ── Test 13: Claim Double Reverts ──

    function test_claimDoubleReverts() public {
        _createDefaultMarket();
        _placeBets();

        vm.warp(deadline + 1);
        pm.resolve(1);

        // Alice claims once
        vm.prank(alice);
        pm.claim(1);

        // Alice tries to claim again
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.PM__AlreadyClaimed.selector);
        pm.claim(1);
    }

    // ── Test 14: Expire after deadline ──

    function test_expire() public {
        _createDefaultMarket();

        vm.warp(deadline + 1);

        vm.expectEmit(true, false, false, false);
        emit PredictionMarket.MarketExpired(1);
        pm.expire(1);

        // Status should still be OPEN (expire just emits event for CRE trigger)
        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.OPEN));
    }

    // ── Test 15: Expire before deadline reverts ──

    function test_expireBeforeDeadlineReverts() public {
        _createDefaultMarket();

        vm.expectRevert(PredictionMarket.PM__DeadlineNotPassed.selector);
        pm.expire(1);
    }

    // ── Test 16: Expire resolved market reverts ──

    function test_expireResolvedMarketReverts() public {
        _createDefaultMarket();
        _placeBets();

        vm.warp(deadline + 1);
        pm.resolve(1);

        vm.expectRevert(PredictionMarket.PM__MarketNotOpen.selector);
        pm.expire(1);
    }

    // ── Test 17: Resolve WIN_RATE metric ──

    function test_resolveWinRate() public {
        // Agent 1 winRate=7800, threshold=7000, ABOVE -> 7800 >= 7000 -> YES
        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.WIN_RATE, PredictionMarket.Comparison.ABOVE, 7000, deadline);
        _placeBets();
        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.RESOLVED_YES));
    }

    // ── Test 18: Resolve SHARPE metric ──

    function test_resolveSharpe() public {
        // Agent 1 sharpe=18500, threshold=20000, ABOVE -> 18500 < 20000 -> NO
        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.SHARPE, PredictionMarket.Comparison.ABOVE, 20000, deadline);
        _placeBets();
        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.RESOLVED_NO));
    }

    // ── Test 19: Resolve TVL metric ──

    function test_resolveTVL() public {
        // Agent 1 TVL=1500000e6, threshold=1000000e6, ABOVE -> YES
        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.TVL, PredictionMarket.Comparison.ABOVE, int256(1000000e6), deadline);
        _placeBets();
        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.RESOLVED_YES));
    }

    // ── Test 20: Resolve TRADES metric ──

    function test_resolveTrades() public {
        // Agent 1 trades=200, threshold=300, ABOVE -> 200 < 300 -> NO
        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.TRADES, PredictionMarket.Comparison.ABOVE, 300, deadline);
        _placeBets();
        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.RESOLVED_NO));
    }

    // ── Test 21: Resolve DRAWDOWN metric ──

    function test_resolveDrawdown() public {
        // Agent 1 drawdown=3200, threshold=5000, BELOW -> 3200 <= 5000 -> YES
        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.DRAWDOWN, PredictionMarket.Comparison.BELOW, 5000, deadline);
        _placeBets();
        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.RESOLVED_YES));
    }

    // ── Test 22: Claim NO winner payout ──

    function test_claimNoWinnerPayout() public {
        // Agent 1 ROI = 185000, threshold = 200000, ABOVE -> NO wins
        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, 200000, deadline);

        // Alice bets NO, Bob bets YES
        vm.prank(alice);
        pm.betNo{value: 2 ether}(1);
        vm.prank(bob);
        pm.betYes{value: 3 ether}(1);

        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.RESOLVED_NO));

        // Alice (NO winner) claims full pool: (2 * 5) / 2 = 5 ETH
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        pm.claim(1);
        assertEq(alice.balance - balBefore, 5 ether);

        // Bob (YES loser) can't claim
        vm.prank(bob);
        vm.expectRevert(PredictionMarket.PM__NothingToClaim.selector);
        pm.claim(1);
    }

    // ── Test 23: Create market emits MarketCreated ──

    function test_createMarketEmitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit PredictionMarket.MarketCreated(1, 1, uint8(PredictionMarket.MetricField.ROI), uint8(PredictionMarket.Comparison.ABOVE), 150000, deadline);
        pm.createMarket(1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, 150000, deadline);
    }

    // ── Test 24: Bet emits BetPlaced ──

    function test_betYesEmitsEvent() public {
        _createDefaultMarket();

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit PredictionMarket.BetPlaced(1, alice, true, 1 ether);
        pm.betYes{value: 1 ether}(1);
    }

    // ── Test 25: Resolve emits MarketResolved ──

    function test_resolveEmitsMarketResolvedEvent() public {
        _createDefaultMarket();
        _placeBets();
        vm.warp(deadline + 1);

        vm.expectEmit(true, false, false, true);
        emit PredictionMarket.MarketResolved(1, PredictionMarket.Status.RESOLVED_YES);
        pm.resolve(1);
    }

    // ── Test 26: Claim emits Claimed ──

    function test_claimEmitsEvent() public {
        _createDefaultMarket();
        _placeBets();
        vm.warp(deadline + 1);
        pm.resolve(1);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit PredictionMarket.Claimed(1, alice, 2 ether);
        pm.claim(1);
    }

    // ── Test 27: Multiple bets accumulate ──

    function test_multipleBetsAccumulate() public {
        _createDefaultMarket();

        vm.startPrank(alice);
        pm.betYes{value: 1 ether}(1);
        pm.betYes{value: 2 ether}(1);
        pm.betYes{value: 0.5 ether}(1);
        vm.stopPrank();

        assertEq(pm.yesStakes(1, alice), 3.5 ether);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(m.totalYes, 3.5 ether);
    }

    // ── Test 28: Bet on resolved market reverts ──

    function test_betOnResolvedMarketReverts() public {
        _createDefaultMarket();
        _placeBets();
        vm.warp(deadline + 1);
        pm.resolve(1);

        vm.prank(charlie);
        vm.expectRevert(PredictionMarket.PM__MarketNotOpen.selector);
        pm.betYes{value: 1 ether}(1);
    }

    // ── Test 29: Bet on cancelled market reverts ──

    function test_betOnCancelledMarketReverts() public {
        _createDefaultMarket();

        // Only YES side -> will cancel
        vm.prank(alice);
        pm.betYes{value: 1 ether}(1);

        vm.warp(deadline + 1);
        pm.resolve(1);

        PredictionMarket.Market memory m = pm.getMarket(1);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.CANCELLED));

        vm.prank(charlie);
        vm.expectRevert(PredictionMarket.PM__MarketNotOpen.selector);
        pm.betYes{value: 1 ether}(1);
    }

    // ── Test 30: Reentrancy attack blocked ──

    function test_reentrancyAttackBlocked() public {
        _createDefaultMarket();

        // Deploy attacker and fund it
        ReentrantAttacker attacker = new ReentrantAttacker(pm);
        vm.deal(address(attacker), 10 ether);

        // Attacker bets YES
        attacker.bet(1, 2 ether);
        // Bob bets NO
        vm.prank(bob);
        pm.betNo{value: 2 ether}(1);

        // Resolve -> YES wins
        vm.warp(deadline + 1);
        pm.resolve(1);

        // Attacker tries to claim with reentrancy — should revert
        vm.expectRevert();
        attacker.attack(1);
    }

    // ── Helpers ──

    function _createDefaultMarket() internal {
        // Agent 1, ROI above 150000 (15%), deadline in 7 days
        vm.prank(alice);
        pm.createMarket(1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, 150000, deadline);
    }

    function _placeBets() internal {
        vm.prank(alice);
        pm.betYes{value: 1 ether}(1);
        vm.prank(bob);
        pm.betNo{value: 1 ether}(1);
    }
}

/// @dev Attacker contract that tries reentrancy on claim()
contract ReentrantAttacker {
    PredictionMarket public pm;
    uint256 public targetMarket;
    bool public attacking;

    constructor(PredictionMarket _pm) {
        pm = _pm;
    }

    function bet(uint256 marketId, uint256 amount) external {
        pm.betYes{value: amount}(marketId);
    }

    function attack(uint256 marketId) external {
        targetMarket = marketId;
        attacking = true;
        pm.claim(marketId);
    }

    receive() external payable {
        if (attacking) {
            attacking = false;
            pm.claim(targetMarket); // reentrant call
        }
    }
}
