// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {AgentMetrics} from "../src/AgentMetrics.sol";

/**
 * @title DeployPredictionMarket
 * @notice Deploys the PredictionMarket contract.
 *         Requires AGENT_METRICS address to be set in env or passed via command line.
 */
contract DeployPredictionMarket is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        
        // Try to get AgentMetrics address from env
        address agentMetricsAddr;
        try vm.envAddress("AGENT_METRICS") returns (address addr) {
            agentMetricsAddr = addr;
        } catch {
            console.log("Error: AGENT_METRICS env var not set");
            return;
        }

        console.log("===========================================");
        console.log("  Deploying PredictionMarket");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("AgentMetrics:", agentMetricsAddr);

        vm.startBroadcast(pk);

        PredictionMarket market = new PredictionMarket(agentMetricsAddr);

        vm.stopBroadcast();

        console.log("");
        console.log("PredictionMarket deployed:", address(market));
        console.log("");
    }
}
