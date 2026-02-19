// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AgentMetrics} from "./AgentMetrics.sol";

/**
 * @title PredictionMarket
 * @author Hitesh (vyqno)
 * @notice Binary prediction markets on AI agent performance.
 * @dev Users bet ETH on whether an agent's CRE-verified metric will meet a threshold
 *      by a deadline. Resolution reads directly from AgentMetrics (trustless oracle).
 *
 *      Market lifecycle: OPEN -> bet -> deadline passes -> resolve -> claim
 *      Cancelled if one side has zero liquidity at resolution time.
 */
contract PredictionMarket is ReentrancyGuard {
    // ── Enums ──

    enum MetricField { ROI, WIN_RATE, SHARPE, TVL, TRADES, DRAWDOWN }
    enum Comparison  { ABOVE, BELOW }
    enum Status      { OPEN, RESOLVED_YES, RESOLVED_NO, CANCELLED }

    // ── Structs ──

    struct Market {
        uint256 agentId;
        MetricField metric;
        Comparison  comparison;
        int256      threshold;   // same scale as AgentMetrics (bps x 100 for ROI, etc.)
        uint256     deadline;    // unix timestamp
        address     creator;
        Status      status;
        uint256     totalYes;    // ETH staked on YES
        uint256     totalNo;     // ETH staked on NO
    }

    // ── State ──

    AgentMetrics public immutable agentMetrics;
    uint256 public nextMarketId = 1;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => uint256)) public yesStakes;
    mapping(uint256 => mapping(address => uint256)) public noStakes;
    mapping(uint256 => mapping(address => bool))    public claimed;
    uint256[] public allMarketIds;

    // ── Errors ──

    error PM__MarketNotOpen();
    error PM__DeadlinePassed();
    error PM__DeadlineNotPassed();
    error PM__DeadlineTooSoon();
    error PM__ZeroBet();
    error PM__AlreadyClaimed();
    error PM__NothingToClaim();
    error PM__NoLiquidity();
    error PM__TransferFailed();

    // ── Events ──

    event MarketCreated(
        uint256 indexed marketId, uint256 agentId, uint8 metric, uint8 comparison, int256 threshold, uint256 deadline
    );
    event BetPlaced(uint256 indexed marketId, address indexed user, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed marketId, Status outcome);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 payout);

    constructor(address _agentMetrics) {
        agentMetrics = AgentMetrics(_agentMetrics);
    }

    // ── Create ──

    function createMarket(
        uint256 agentId,
        MetricField metric,
        Comparison comparison,
        int256 threshold,
        uint256 deadline
    ) external returns (uint256 marketId) {
        if (deadline < block.timestamp + 1 hours) revert PM__DeadlineTooSoon();

        marketId = nextMarketId++;
        markets[marketId] = Market({
            agentId: agentId,
            metric: metric,
            comparison: comparison,
            threshold: threshold,
            deadline: deadline,
            creator: msg.sender,
            status: Status.OPEN,
            totalYes: 0,
            totalNo: 0
        });
        allMarketIds.push(marketId);

        emit MarketCreated(marketId, agentId, uint8(metric), uint8(comparison), threshold, deadline);
    }

    // ── Bet ──

    function betYes(uint256 marketId) external payable nonReentrant {
        _placeBet(marketId, true);
    }

    function betNo(uint256 marketId) external payable nonReentrant {
        _placeBet(marketId, false);
    }

    function _placeBet(uint256 marketId, bool isYes) internal {
        Market storage m = markets[marketId];
        if (m.status != Status.OPEN) revert PM__MarketNotOpen();
        if (block.timestamp >= m.deadline) revert PM__DeadlinePassed();
        if (msg.value == 0) revert PM__ZeroBet();

        if (isYes) {
            m.totalYes += msg.value;
            yesStakes[marketId][msg.sender] += msg.value;
        } else {
            m.totalNo += msg.value;
            noStakes[marketId][msg.sender] += msg.value;
        }
        emit BetPlaced(marketId, msg.sender, isYes, msg.value);
    }

    // ── Resolve ──

    function resolve(uint256 marketId) external {
        Market storage m = markets[marketId];
        if (m.status != Status.OPEN) revert PM__MarketNotOpen();
        if (block.timestamp < m.deadline) revert PM__DeadlineNotPassed();

        int256 actual = _readMetric(m.agentId, m.metric);
        bool conditionMet;

        if (m.comparison == Comparison.ABOVE) {
            conditionMet = actual >= m.threshold;
        } else {
            conditionMet = actual <= m.threshold;
        }

        // Edge case: if one side has zero liquidity, cancel the market
        if (m.totalYes == 0 || m.totalNo == 0) {
            m.status = Status.CANCELLED;
            emit MarketResolved(marketId, Status.CANCELLED);
            return;
        }

        m.status = conditionMet ? Status.RESOLVED_YES : Status.RESOLVED_NO;
        emit MarketResolved(marketId, m.status);
    }

    // ── Claim ──

    function claim(uint256 marketId) external nonReentrant {
        Market storage m = markets[marketId];
        if (claimed[marketId][msg.sender]) revert PM__AlreadyClaimed();

        uint256 payout;

        if (m.status == Status.CANCELLED) {
            // Refund both sides
            payout = yesStakes[marketId][msg.sender] + noStakes[marketId][msg.sender];
        } else if (m.status == Status.RESOLVED_YES) {
            uint256 stake = yesStakes[marketId][msg.sender];
            if (stake == 0) revert PM__NothingToClaim();
            uint256 pool = m.totalYes + m.totalNo;
            payout = (stake * pool) / m.totalYes;
        } else if (m.status == Status.RESOLVED_NO) {
            uint256 stake = noStakes[marketId][msg.sender];
            if (stake == 0) revert PM__NothingToClaim();
            uint256 pool = m.totalYes + m.totalNo;
            payout = (stake * pool) / m.totalNo;
        } else {
            revert PM__MarketNotOpen(); // still open, can't claim
        }

        if (payout == 0) revert PM__NothingToClaim();
        claimed[marketId][msg.sender] = true;

        (bool ok,) = msg.sender.call{value: payout}("");
        if (!ok) revert PM__TransferFailed();

        emit Claimed(marketId, msg.sender, payout);
    }

    // ── Views ──

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    function getAllMarketIds() external view returns (uint256[] memory) {
        return allMarketIds;
    }

    function getMarketCount() external view returns (uint256) {
        return allMarketIds.length;
    }

    // ── Internal: read metric from AgentMetrics ──

    function _readMetric(uint256 agentId, MetricField field) internal view returns (int256) {
        AgentMetrics.Metrics memory m = agentMetrics.getMetrics(agentId);
        if (field == MetricField.ROI) return m.roiBps;
        if (field == MetricField.WIN_RATE) return int256(m.winRateBps);
        if (field == MetricField.SHARPE) return int256(m.sharpeRatioScaled);
        if (field == MetricField.TVL) return int256(m.tvlManaged);
        if (field == MetricField.TRADES) return int256(m.totalTrades);
        if (field == MetricField.DRAWDOWN) return int256(m.maxDrawdownBps);
        return 0;
    }
}
