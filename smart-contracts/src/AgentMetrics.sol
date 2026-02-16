// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentMetrics
 * @author Hitesh (vyqno)
 * @notice Stores CRE-verified performance metrics for registered AI agents.
 * @dev Only the `authorizedWriter` (set by the contract owner) may write metrics.
 *      In production this is the Chainlink CRE workflow address that has reached
 *      DON consensus on the data before writing.
 *
 *      Metric scaling conventions:
 *        - `roiBps`:             Basis points x 100  (15.25% = 152_500)
 *        - `winRateBps`:         Basis points        (75% = 7_500)
 *        - `maxDrawdownBps`:     Basis points        (32% = 3_200)
 *        - `sharpeRatioScaled`:  Sharpe x 10_000     (1.85 = 18_500)
 *        - `tvlManaged`:         Raw token decimals   (1M USDC = 1_000_000e6)
 *        - `totalTrades`:        Absolute count
 */
contract AgentMetrics is Ownable {
    // ──────────────────────────────────────────────
    //  Custom Errors
    // ──────────────────────────────────────────────

    /// @dev Thrown when writer address is set to zero.
    error Metrics__InvalidWriterAddress();

    /// @dev Thrown when caller is not the authorized writer.
    error Metrics__NotAuthorized();

    /// @dev Thrown when win rate exceeds 100% (10_000 bps).
    error Metrics__InvalidWinRate();

    /// @dev Thrown when max drawdown exceeds 100% (10_000 bps).
    error Metrics__InvalidDrawdown();

    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    /**
     * @notice Performance snapshot for a single AI agent.
     * @dev All percentage values are stored as integers with the scaling noted above
     *      to avoid floating-point ambiguity on-chain.
     */
    struct Metrics {
        int256 roiBps;
        uint256 winRateBps;
        uint256 maxDrawdownBps;
        uint256 sharpeRatioScaled;
        uint256 tvlManaged;
        uint256 totalTrades;
        uint256 lastUpdated;
    }

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Address authorized to call `updateMetrics` (CRE workflow).
    address public authorizedWriter;

    /// @notice Latest metrics snapshot for each agent ID.
    mapping(uint256 => Metrics) public latestMetrics;

    /// @notice Number of times metrics have been updated for each agent.
    mapping(uint256 => uint256) public updateCounts;

    /// @notice Array of all agent IDs that have ever received metrics.
    uint256[] public trackedAgentIds;

    /// @notice Quick lookup for whether an agent ID is already tracked.
    mapping(uint256 => bool) public isTracked;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /**
     * @notice Emitted every time an agent's metrics are updated.
     * @param agentId     The agent whose metrics changed.
     * @param roiBps      Updated ROI in basis points x 100.
     * @param winRateBps  Updated win rate in basis points.
     * @param totalTrades Updated total trade count.
     */
    event MetricsUpdated(
        uint256 indexed agentId,
        int256 roiBps,
        uint256 winRateBps,
        uint256 totalTrades
    );

    /// @notice Emitted when the authorized writer address is updated.
    event AuthorizedWriterUpdated(address indexed oldWriter, address indexed newWriter);

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /// @notice Deploys the contract with msg.sender as the owner.
    constructor() Ownable(msg.sender) {}

    // ──────────────────────────────────────────────
    //  Owner Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Set or update the authorized writer address.
     * @dev Only callable by the contract owner. Typically set to the CRE workflow
     *      address after deployment.
     * @param writer The address that will be allowed to call `updateMetrics`.
     */
    function setAuthorizedWriter(address writer) external onlyOwner {
        if (writer == address(0)) revert Metrics__InvalidWriterAddress();

        address oldWriter = authorizedWriter;
        authorizedWriter = writer;

        emit AuthorizedWriterUpdated(oldWriter, writer);
    }

    // ──────────────────────────────────────────────
    //  Writer Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Write a new metrics snapshot for an agent.
     * @dev Callable only by `authorizedWriter`. Overwrites the previous snapshot
     *      and increments the update counter. Automatically tracks new agent IDs.
     * @param agentId           The agent to update.
     * @param roiBps            ROI in basis points x 100.
     * @param winRateBps        Win rate in basis points (0-10000).
     * @param maxDrawdownBps    Maximum drawdown in basis points (0-10000).
     * @param sharpeRatioScaled Sharpe ratio x 10 000.
     * @param tvlManaged        Total value locked (token-native decimals).
     * @param totalTrades       Cumulative trade count.
     */
    function updateMetrics(
        uint256 agentId,
        int256 roiBps,
        uint256 winRateBps,
        uint256 maxDrawdownBps,
        uint256 sharpeRatioScaled,
        uint256 tvlManaged,
        uint256 totalTrades
    ) external {
        if (msg.sender != authorizedWriter) revert Metrics__NotAuthorized();
        if (winRateBps > 10_000) revert Metrics__InvalidWinRate();
        if (maxDrawdownBps > 10_000) revert Metrics__InvalidDrawdown();

        latestMetrics[agentId] = Metrics({
            roiBps: roiBps,
            winRateBps: winRateBps,
            maxDrawdownBps: maxDrawdownBps,
            sharpeRatioScaled: sharpeRatioScaled,
            tvlManaged: tvlManaged,
            totalTrades: totalTrades,
            lastUpdated: block.timestamp
        });

        updateCounts[agentId]++;

        if (!isTracked[agentId]) {
            trackedAgentIds.push(agentId);
            isTracked[agentId] = true;
        }

        emit MetricsUpdated(agentId, roiBps, winRateBps, totalTrades);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Get the latest metrics snapshot for an agent.
     * @param agentId The agent to query.
     * @return metrics The most recent Metrics struct.
     */
    function getMetrics(uint256 agentId) external view returns (Metrics memory) {
        return latestMetrics[agentId];
    }

    /**
     * @notice Get the number of times metrics have been updated for an agent.
     * @param agentId The agent to query.
     * @return count  Number of updates received.
     */
    function getUpdateCount(uint256 agentId) external view returns (uint256) {
        return updateCounts[agentId];
    }

    /**
     * @notice Batch-fetch latest metrics for multiple agents in a single call.
     * @dev Useful for CRE workflows and frontend reads to minimize RPC calls.
     * @param agentIds Array of agent IDs to query.
     * @return batch   Array of Metrics structs in the same order as `agentIds`.
     */
    function getBatchMetrics(
        uint256[] calldata agentIds
    ) external view returns (Metrics[] memory) {
        Metrics[] memory batch = new Metrics[](agentIds.length);
        for (uint256 i = 0; i < agentIds.length; i++) {
            batch[i] = latestMetrics[agentIds[i]];
        }
        return batch;
    }

    /**
     * @notice Return all agent IDs that have ever received a metrics update.
     * @return ids Array of tracked agent IDs.
     */
    function getTrackedAgentIds() external view returns (uint256[] memory) {
        return trackedAgentIds;
    }
}
