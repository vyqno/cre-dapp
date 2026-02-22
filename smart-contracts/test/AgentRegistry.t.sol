// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;
    address public owner = address(this);
    address public agentWallet = address(0x1234);
    string[] public defaultCaps;

    function setUp() public {
        registry = new AgentRegistry();
        defaultCaps = new string[](2);
        defaultCaps[0] = "swap";
        defaultCaps[1] = "transfer";
    }

    function test_RegisterAgent() public {
        uint256 agentId = registry.registerAgent(
            agentWallet, "YieldBot Alpha", "yield_farming", "Automated yield farming across Aave and Compound", defaultCaps
        );

        assertEq(agentId, 1);

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.wallet, agentWallet);
        assertEq(agent.name, "YieldBot Alpha");
        assertEq(agent.strategyType, "yield_farming");
        assertEq(agent.creator, owner);
        assertEq(agent.capabilities.length, 2);
        assertEq(agent.capabilities[0], "swap");
        assertTrue(agent.isActive);
        assertGt(agent.registeredAt, 0);
    }

    function test_RegisterMultipleAgents() public {
        uint256 id1 = registry.registerAgent(agentWallet, "Bot1", "trading", "desc1", defaultCaps);
        uint256 id2 = registry.registerAgent(address(0x5678), "Bot2", "arbitrage", "desc2", defaultCaps);

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(registry.totalAgents(), 2);
    }

    function test_DeactivateAgent() public {
        uint256 agentId = registry.registerAgent(agentWallet, "Bot1", "trading", "desc1", defaultCaps);
        registry.deactivateAgent(agentId);

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertFalse(agent.isActive);
    }

    function test_OnlyCreatorCanDeactivate() public {
        uint256 agentId = registry.registerAgent(agentWallet, "Bot1", "trading", "desc1", defaultCaps);

        vm.prank(address(0x9999));
        vm.expectRevert(AgentRegistry.Registry__NotAgentCreator.selector);
        registry.deactivateAgent(agentId);
    }

    function test_GetActiveAgents() public {
        registry.registerAgent(agentWallet, "Bot1", "trading", "desc1", defaultCaps);
        registry.registerAgent(address(0x5678), "Bot2", "yield_farming", "desc2", defaultCaps);
        registry.registerAgent(address(0x9abc), "Bot3", "arbitrage", "desc3", defaultCaps);

        uint256[] memory activeIds = registry.getActiveAgentIds();
        assertEq(activeIds.length, 3);
    }

    function test_GetAgentByWallet() public {
        registry.registerAgent(agentWallet, "Bot1", "trading", "desc1", defaultCaps);

        uint256 agentId = registry.getAgentIdByWallet(agentWallet);
        assertEq(agentId, 1);
    }

    function test_CannotRegisterSameWalletTwice() public {
        registry.registerAgent(agentWallet, "Bot1", "trading", "desc1", defaultCaps);

        vm.expectRevert(AgentRegistry.Registry__WalletAlreadyRegistered.selector);
        registry.registerAgent(agentWallet, "Bot2", "yield", "desc2", defaultCaps);
    }

    function test_CannotRegisterZeroAddress() public {
        vm.expectRevert(AgentRegistry.Registry__InvalidWalletAddress.selector);
        registry.registerAgent(address(0), "Bot1", "trading", "desc1", defaultCaps);
    }

    function test_CannotRegisterEmptyName() public {
        vm.expectRevert(AgentRegistry.Registry__EmptyName.selector);
        registry.registerAgent(agentWallet, "", "trading", "desc1", defaultCaps);
    }

    function test_CannotDeactivateAlreadyInactive() public {
        uint256 agentId = registry.registerAgent(agentWallet, "Bot1", "trading", "desc1", defaultCaps);
        registry.deactivateAgent(agentId);

        vm.expectRevert(AgentRegistry.Registry__AgentAlreadyInactive.selector);
        registry.deactivateAgent(agentId);
    }
}
