// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

contract DeployPredictionMarket is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address metricsAddr = vm.envAddress("AGENT_METRICS");

        vm.startBroadcast(pk);

        PredictionMarket pm = new PredictionMarket(metricsAddr);
        console.log("PredictionMarket deployed:", address(pm));

        // Create demo markets

        // Agent 1: ROI above 15% (150000 bps) in 7 days
        pm.createMarket(1, PredictionMarket.MetricField.ROI, PredictionMarket.Comparison.ABOVE, 150000, block.timestamp + 7 days);
        console.log("Market 1 created: Agent 1 ROI > 15%");

        // Agent 2: Win rate above 70% (7000 bps) in 7 days
        pm.createMarket(2, PredictionMarket.MetricField.WIN_RATE, PredictionMarket.Comparison.ABOVE, 7000, block.timestamp + 7 days);
        console.log("Market 2 created: Agent 2 Win Rate > 70%");

        // Agent 3: TVL above $2M in 7 days
        pm.createMarket(
            3, PredictionMarket.MetricField.TVL, PredictionMarket.Comparison.ABOVE, int256(2000000e6), block.timestamp + 7 days
        );
        console.log("Market 3 created: Agent 3 TVL > $2M");

        vm.stopBroadcast();
    }
}
