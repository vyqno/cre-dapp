// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentMetrics} from "../src/AgentMetrics.sol";
import {AgentBondingCurve} from "../src/AgentBondingCurve.sol";
import {BondingCurveFactory} from "../src/BondingCurveFactory.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/**
 * @title SimulateCRE
 * @author Hitesh (vyqno)
 * @notice One-shot simulation of all CRE workflows for demo/testing purposes.
 *         Updates metrics, adjusts bonding curve slopes, and resolves expired markets.
 *
 * @dev Usage:
 *      forge script script/SimulateCRE.s.sol \
 *        --rpc-url $TENDERLY_VNET_RPC \
 *        --broadcast \
 *        --slow
 *
 *      Required env:
 *        PRIVATE_KEY              — Deployer/CRE writer wallet
 *        AGENT_METRICS            — AgentMetrics contract address
 *        BONDING_CURVE_FACTORY    — BondingCurveFactory contract address
 *        PREDICTION_MARKET        — PredictionMarket contract address
 */
contract SimulateCRE is Script {
    AgentMetrics public metrics;
    BondingCurveFactory public factory;
    PredictionMarket public pm;

    uint256 public constant MAX_SLOPE = 0.01 ether;
    uint256 public constant ONE_TOKEN = 1e18;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        metrics = AgentMetrics(vm.envAddress("AGENT_METRICS"));
        factory = BondingCurveFactory(vm.envAddress("BONDING_CURVE_FACTORY"));
        pm = PredictionMarket(vm.envAddress("PREDICTION_MARKET"));

        console.log("===========================================");
        console.log("  CRE Simulation - One-Shot");
        console.log("===========================================");

        vm.startBroadcast(pk);

        _updateMetrics();
        _adjustSlopes();
        _resolveMarkets();

        vm.stopBroadcast();

        console.log("");
        console.log("===========================================");
        console.log("  CRE SIMULATION COMPLETE");
        console.log("===========================================");
    }

    /// @dev Simulates the Performance Tracker CRE workflow — writes realistic metrics for agents 1-3.
    function _updateMetrics() internal {
        console.log("");
        console.log("[1/3] Updating agent metrics (Performance Tracker)...");

        // Agent 1: AlphaYield — strong performer, slight improvement
        metrics.updateMetrics(
            1,
            192000,     // roiBps: +19.2% ROI (was ~18.5%)
            7900,       // winRateBps: 79%
            2600,       // maxDrawdownBps: 26%
            22000,      // sharpeRatioScaled: 2.20
            1350000e6,  // tvlManaged: $1.35M
            1180        // totalTrades
        );
        console.log("  Agent 1 (AlphaYield): ROI=19.2%, WR=79%, Sharpe=2.20");

        // Agent 2: MomentumTrader — moderate, slight dip
        metrics.updateMetrics(
            2,
            87000,      // roiBps: +8.7% ROI (was ~9.5%)
            6300,       // winRateBps: 63%
            5500,       // maxDrawdownBps: 55%
            14800,      // sharpeRatioScaled: 1.48
            620000e6,   // tvlManaged: $620K
            3100        // totalTrades
        );
        console.log("  Agent 2 (MomentumTrader): ROI=8.7%, WR=63%, Sharpe=1.48");

        // Agent 3: StableHarvester — conservative, steady
        metrics.updateMetrics(
            3,
            30000,      // roiBps: +3.0% ROI (was ~2.8%)
            9500,       // winRateBps: 95%
            400,        // maxDrawdownBps: 4%
            4500,       // sharpeRatioScaled: 0.45
            3400000e6,  // tvlManaged: $3.4M
            215         // totalTrades
        );
        console.log("  Agent 3 (StableHarvester): ROI=3.0%, WR=95%, Sharpe=0.45");
    }

    /// @dev Simulates the Curve Adjuster CRE workflow — reads metrics, computes slope, adjusts curve.
    function _adjustSlopes() internal {
        console.log("");
        console.log("[2/3] Adjusting bonding curve slopes (Curve Adjuster)...");

        uint256[] memory agentIds = factory.getAllAgentIds();
        for (uint256 i = 0; i < agentIds.length; i++) {
            uint256 agentId = agentIds[i];
            address curveAddr = factory.getCurve(agentId);
            if (curveAddr == address(0)) continue;

            AgentBondingCurve curve = AgentBondingCurve(curveAddr);
            AgentMetrics.Metrics memory m = metrics.getMetrics(agentId);

            // Compute slope using same formula as CRE workflow:
            // newSlope = baseSlope * (1 + roiWeight * roi + sharpeWeight * sharpe)
            // Simplified: scale from performance score
            uint256 baseSlope = 0.00001 ether;
            uint256 roiAbs = m.roiBps > 0 ? uint256(m.roiBps) : 0;
            uint256 perfScore = (roiAbs * 40 + m.winRateBps * 30 + m.sharpeRatioScaled * 30) / 10000;

            uint256 newSlope = baseSlope + (baseSlope * perfScore / 100);
            if (newSlope > MAX_SLOPE) newSlope = MAX_SLOPE;

            // Check solvency before adjusting up
            uint256 supply = curve.totalSupply();
            if (supply > 0 && newSlope > curve.slope()) {
                uint256 supplyTokens = supply / ONE_TOKEN;
                uint256 sellCost = curve.basePrice() * supplyTokens
                    + (newSlope * supplyTokens * supplyTokens) / 2;
                if (sellCost > curve.reserveBalance()) {
                    console.log("  Agent", agentId, "-> slope increase blocked (solvency)");
                    continue;
                }
            }

            curve.adjustSlope(newSlope);
            console.log("  Agent", agentId, "-> new slope:", newSlope);
        }
    }

    /// @dev Simulates the Market Resolver CRE workflow — resolves any expired markets.
    function _resolveMarkets() internal {
        console.log("");
        console.log("[3/3] Resolving expired markets (Market Resolver)...");

        uint256[] memory marketIds = pm.getAllMarketIds();
        uint256 resolved;

        for (uint256 i = 0; i < marketIds.length; i++) {
            PredictionMarket.Market memory m = pm.getMarket(marketIds[i]);

            // Only resolve OPEN markets past their deadline
            if (uint8(m.status) != 0) continue; // 0 = OPEN
            if (block.timestamp < m.deadline) continue;

            pm.resolve(marketIds[i]);
            resolved++;
            console.log("  Market", marketIds[i], "resolved");
        }

        if (resolved == 0) {
            console.log("  No markets ready for resolution");
        } else {
            console.log("  Resolved", resolved, "market(s)");
        }
    }
}
