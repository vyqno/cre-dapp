// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentMetrics} from "../src/AgentMetrics.sol";
import {BondingCurveFactory} from "../src/BondingCurveFactory.sol";
import {AgentBondingCurve} from "../src/AgentBondingCurve.sol";

/**
 * @title Deploy
 * @author Hitesh (vyqno)
 * @notice Deploys the full AgentIndex protocol to Tenderly Virtual TestNet.
 *         Deploys all contracts, seeds 3 demo agents with metrics, and creates
 *         bonding curves — ready for frontend + CRE integration.
 *
 * @dev Usage:
 *      forge script script/Deploy.s.sol \
 *        --rpc-url $TENDERLY_VNET_RPC \
 *        --broadcast \
 *        --slow
 *
 *      Required env:
 *        PRIVATE_KEY — Deployer wallet (fund from Tenderly faucet)
 */
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console.log("===========================================");
        console.log("  AgentIndex Protocol - Deploy");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Balance:", deployer.balance / 1e18, "ETH");
        console.log("");

        vm.startBroadcast(pk);

        // ─── 1. Core Contracts ──────────────────────
        console.log("[1/6] Deploying AgentRegistry...");
        AgentRegistry registry = new AgentRegistry();
        console.log("  AgentRegistry:", address(registry));

        console.log("[2/6] Deploying AgentMetrics...");
        AgentMetrics metrics = new AgentMetrics();
        metrics.setAuthorizedWriter(deployer); // deployer as writer for seeding
        console.log("  AgentMetrics:", address(metrics));

        console.log("[3/6] Deploying BondingCurveFactory...");
        BondingCurveFactory factory = new BondingCurveFactory(0.0001 ether, 0.00001 ether);
        console.log("  BondingCurveFactory:", address(factory));

        // ─── 2. Seed Demo Agents ────────────────────
        console.log("");
        console.log("[4/6] Registering demo agents...");

        uint256 id1 = registry.registerAgent(
            address(0x1001), "AlphaYield Bot", "DeFi Yield",
            "Multi-protocol yield optimization across Aave, Compound, and Uniswap v4"
        );

        uint256 id2 = registry.registerAgent(
            address(0x1002), "MomentumTrader", "DEX Trading",
            "Cross-DEX momentum trading with MEV protection via Flashbots"
        );

        uint256 id3 = registry.registerAgent(
            address(0x1003), "StableHarvester", "Stablecoin Farming",
            "Conservative stablecoin farming across blue-chip protocols"
        );

        // ─── 3. Create Bonding Curves ───────────────
        console.log("[5/6] Creating bonding curves...");

        address curve1 = factory.createCurve(id1, "AlphaYield Shares", "AYS");
        AgentBondingCurve(curve1).setCurveAdjuster(deployer);

        address curve2 = factory.createCurve(id2, "MomentumTrader Shares", "MTS");
        AgentBondingCurve(curve2).setCurveAdjuster(deployer);

        address curve3 = factory.createCurve(id3, "StableHarvester Shares", "SHS");
        AgentBondingCurve(curve3).setCurveAdjuster(deployer);

        // ─── 4. Seed Metrics ────────────────────────
        console.log("[6/6] Seeding performance metrics...");

        metrics.updateMetrics(id1, 152500, 7500, 3200, 18500, 1000000e6, 847);
        metrics.updateMetrics(id2, 89200, 6200, 5800, 14200, 500000e6, 2341);
        metrics.updateMetrics(id3, 24500, 9200, 800, 3200, 2500000e6, 156);

        vm.stopBroadcast();

        // ─── Output ─────────────────────────────────
        console.log("");
        console.log("===========================================");
        console.log("  DEPLOYED");
        console.log("===========================================");
        console.log("");
        console.log("Add to your .env:");
        console.log("  AGENT_REGISTRY=", address(registry));
        console.log("  AGENT_METRICS=", address(metrics));
        console.log("  BONDING_CURVE_FACTORY=", address(factory));
        console.log("");
        console.log("Bonding Curves:");
        console.log("  Agent 1 (AYS):", curve1);
        console.log("  Agent 2 (MTS):", curve2);
        console.log("  Agent 3 (SHS):", curve3);
        console.log("");
        console.log("Next: forge script script/SimulateTrades.s.sol --rpc-url $TENDERLY_VNET_RPC --broadcast --slow");
    }
}
