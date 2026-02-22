// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentMetrics} from "../src/AgentMetrics.sol";
import {AgentBondingCurve} from "../src/AgentBondingCurve.sol";
import {BondingCurveFactory} from "../src/BondingCurveFactory.sol";

/**
 * @title SetupCRE
 * @author Hitesh (vyqno)
 * @notice Post-deploy script to authorize the CRE workflow to write metrics
 *         and adjust bonding curve slopes. Also seeds fresh metrics data.
 *
 * @dev Usage:
 *      forge script script/SetupCRE.s.sol \
 *        --rpc-url $TENDERLY_VNET_RPC \
 *        --broadcast \
 *        --slow
 *
 *      Required env:
 *        PRIVATE_KEY              — Deployer/owner wallet
 *        AGENT_METRICS            — AgentMetrics contract address
 *        BONDING_CURVE_FACTORY    — BondingCurveFactory contract address
 *        CRE_WRITER_ADDRESS       — Address that the CRE workflow sends txns from
 *                                   (defaults to deployer if not set)
 */
contract SetupCRE is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address metricsAddr = vm.envAddress("AGENT_METRICS");
        address factoryAddr = vm.envAddress("BONDING_CURVE_FACTORY");

        // CRE writer address — defaults to deployer for Tenderly testing
        address creWriter;
        try vm.envAddress("CRE_WRITER_ADDRESS") returns (address addr) {
            creWriter = addr;
        } catch {
            creWriter = deployer;
        }

        AgentMetrics metrics = AgentMetrics(metricsAddr);
        BondingCurveFactory factory = BondingCurveFactory(factoryAddr);

        console.log("===========================================");
        console.log("  AgentIndex - CRE Authorization Setup");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("CRE Writer:", creWriter);
        console.log("");

        vm.startBroadcast(pk);

        // ─── 1. Set AgentMetrics authorized writer ────
        console.log("[1/2] Setting AgentMetrics authorizedWriter...");
        metrics.setAuthorizedWriter(creWriter);
        console.log("  authorizedWriter set to:", creWriter);

        // ─── 2. Set curveAdjuster on all deployed curves ────
        console.log("[2/2] Setting curveAdjuster on bonding curves...");
        uint256[] memory agentIds = factory.getAllAgentIds();
        for (uint256 i = 0; i < agentIds.length; i++) {
            address curveAddr = factory.getCurve(agentIds[i]);
            if (curveAddr != address(0)) {
                AgentBondingCurve curve = AgentBondingCurve(curveAddr);
                curve.setCurveAdjuster(creWriter);
                console.log("  Agent", agentIds[i], "-> adjuster set on", curveAddr);
            }
        }

        // ─── 3. Seed fresh metrics ────
        console.log("");
        console.log("Seeding production metrics...");

        // Agent 1: AlphaYield Bot — strong performer
        metrics.updateMetrics(
            1,
            185000,     // roiBps: +18.5% ROI
            7800,       // winRateBps: 78% win rate
            2800,       // maxDrawdownBps: 28% max drawdown
            21000,      // sharpeRatioScaled: 2.10 Sharpe
            1200000e6,  // tvlManaged: $1.2M (6-decimal USD)
            1024        // totalTrades
        );
        console.log("  Agent 1 metrics seeded");

        // Agent 2: MomentumTrader — moderate performer
        metrics.updateMetrics(
            2,
            95000,      // roiBps: +9.5% ROI
            6500,       // winRateBps: 65% win rate
            5200,       // maxDrawdownBps: 52% max drawdown
            15500,      // sharpeRatioScaled: 1.55 Sharpe
            650000e6,   // tvlManaged: $650K
            2847        // totalTrades
        );
        console.log("  Agent 2 metrics seeded");

        // Agent 3: StableHarvester — conservative performer
        metrics.updateMetrics(
            3,
            28000,      // roiBps: +2.8% ROI
            9400,       // winRateBps: 94% win rate
            500,        // maxDrawdownBps: 5% max drawdown
            4200,       // sharpeRatioScaled: 0.42 Sharpe
            3200000e6,  // tvlManaged: $3.2M
            198         // totalTrades
        );
        console.log("  Agent 3 metrics seeded");

        vm.stopBroadcast();

        console.log("");
        console.log("===========================================");
        console.log("  CRE SETUP COMPLETE");
        console.log("===========================================");
        console.log("  - AgentMetrics writer: ", creWriter);
        console.log("  - All bonding curve adjusters: ", creWriter);
        console.log("  - Metrics seeded for agents 1-3");
        console.log("");
        console.log("The CRE workflow can now write metrics and adjust slopes.");
    }
}
