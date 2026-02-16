// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentRegistry
 * @author Hitesh (vyqno)
 * @notice On-chain identity registry for AI agents, inspired by the ERC-8004 pattern.
 * @dev Each agent receives an auto-incrementing uint256 ID. Wallet addresses are
 *      unique — a wallet can only be mapped to one agent. The creator (msg.sender
 *      at registration time) is the only address authorized to deactivate the agent.
 */
contract AgentRegistry {
    // ──────────────────────────────────────────────
    //  Custom Errors
    // ──────────────────────────────────────────────

    /// @dev Thrown when wallet address is zero.
    error Registry__InvalidWalletAddress();

    /// @dev Thrown when agent name is empty.
    error Registry__EmptyName();

    /// @dev Thrown when wallet is already registered to another agent.
    error Registry__WalletAlreadyRegistered();

    /// @dev Thrown when caller is not the agent's creator.
    error Registry__NotAgentCreator();

    /// @dev Thrown when trying to deactivate an already inactive agent.
    error Registry__AgentAlreadyInactive();

    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    /// @notice Represents a registered AI agent's on-chain identity.
    struct Agent {
        uint256 id;
        address wallet;
        address creator;
        string name;
        string strategyType;
        string description;
        bool isActive;
        uint256 registeredAt;
    }

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Total number of agents ever registered (also serves as ID counter).
    uint256 public totalAgents;

    /// @notice Mapping from agent ID -> Agent struct.
    mapping(uint256 => Agent) public agents;

    /// @notice Reverse lookup: wallet address -> agent ID. Zero means unregistered.
    mapping(address => uint256) public walletToAgentId;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a new agent is registered.
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed wallet,
        string name,
        string strategyType
    );

    /// @notice Emitted when an agent is deactivated by its creator.
    event AgentDeactivated(uint256 indexed agentId);

    // ──────────────────────────────────────────────
    //  External / Public Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Register a new AI agent on-chain.
     * @dev Increments `totalAgents` and assigns the next sequential ID.
     * @param wallet       The agent's wallet address (must be unique, non-zero).
     * @param name         Human-readable name for the agent.
     * @param strategyType Short label describing the agent's strategy.
     * @param description  Longer description of the agent's behavior.
     * @return agentId     The newly assigned agent ID.
     */
    function registerAgent(
        address wallet,
        string calldata name,
        string calldata strategyType,
        string calldata description
    ) external returns (uint256) {
        if (wallet == address(0)) revert Registry__InvalidWalletAddress();
        if (bytes(name).length == 0) revert Registry__EmptyName();
        if (walletToAgentId[wallet] != 0) revert Registry__WalletAlreadyRegistered();

        totalAgents++;
        uint256 agentId = totalAgents;

        agents[agentId] = Agent({
            id: agentId,
            wallet: wallet,
            creator: msg.sender,
            name: name,
            strategyType: strategyType,
            description: description,
            isActive: true,
            registeredAt: block.timestamp
        });

        walletToAgentId[wallet] = agentId;

        emit AgentRegistered(agentId, wallet, name, strategyType);
        return agentId;
    }

    /**
     * @notice Deactivate a registered agent. Only the original creator may call this.
     * @dev Sets `isActive` to false. Does not delete the agent record.
     * @param agentId The ID of the agent to deactivate.
     */
    function deactivateAgent(uint256 agentId) external {
        if (agents[agentId].creator != msg.sender) revert Registry__NotAgentCreator();
        if (!agents[agentId].isActive) revert Registry__AgentAlreadyInactive();

        agents[agentId].isActive = false;
        emit AgentDeactivated(agentId);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Retrieve full agent data by ID.
     * @param agentId The agent's unique identifier.
     * @return agent  The Agent struct for the given ID.
     */
    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    /**
     * @notice Look up an agent ID by wallet address.
     * @param wallet The wallet address to query.
     * @return agentId The corresponding agent ID (0 if not registered).
     */
    function getAgentIdByWallet(address wallet) external view returns (uint256) {
        return walletToAgentId[wallet];
    }

    /**
     * @notice Return an array of all currently active agent IDs.
     * @dev Iterates over all agents — O(n). Not suitable for very large registries
     *      in on-chain calls; intended for off-chain reads and CRE workflows.
     * @return ids Array of active agent IDs.
     */
    function getActiveAgentIds() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= totalAgents; i++) {
            if (agents[i].isActive) count++;
        }

        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= totalAgents; i++) {
            if (agents[i].isActive) {
                ids[idx] = i;
                idx++;
            }
        }
        return ids;
    }
}
