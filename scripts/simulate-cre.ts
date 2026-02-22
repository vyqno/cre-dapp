/**
 * CRE Continuous Simulation Script
 *
 * Simulates all 3 CRE workflows (Performance Tracker, Curve Adjuster, Market Resolver)
 * by evolving metrics every 30 seconds and writing on-chain.
 *
 * Usage: npx tsx scripts/simulate-cre.ts
 *
 * Required env vars (see .env.example):
 *   PRIVATE_KEY, RPC_URL, AGENT_METRICS, BONDING_CURVE_FACTORY, PREDICTION_MARKET
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { AgentMetricsABI } from "../workflows/contracts/abi/AgentMetrics";
import { AgentBondingCurveABI } from "../workflows/contracts/abi/AgentBondingCurve";
import { BondingCurveFactoryABI } from "../workflows/contracts/abi/BondingCurveFactory";
import { PredictionMarketABI } from "../workflows/contracts/abi/PredictionMarket";

// ── Config ──

const TICK_INTERVAL_MS = 30_000; // 30 seconds
const MAX_SLOPE = parseEther("0.01");

// ── Types ──

interface AgentState {
  agentId: number;
  roiBps: number;
  winRateBps: number;
  maxDrawdownBps: number;
  sharpeRatioScaled: number;
  tvlManaged: bigint;
  totalTrades: number;
}

// ── Initial agent states ──

const agents: AgentState[] = [
  {
    agentId: 1,
    roiBps: 185000,
    winRateBps: 7800,
    maxDrawdownBps: 2800,
    sharpeRatioScaled: 21000,
    tvlManaged: 1200000_000000n,
    totalTrades: 1024,
  },
  {
    agentId: 2,
    roiBps: 95000,
    winRateBps: 6500,
    maxDrawdownBps: 5200,
    sharpeRatioScaled: 15500,
    tvlManaged: 650000_000000n,
    totalTrades: 2847,
  },
  {
    agentId: 3,
    roiBps: 28000,
    winRateBps: 9400,
    maxDrawdownBps: 500,
    sharpeRatioScaled: 4200,
    tvlManaged: 3200000_000000n,
    totalTrades: 198,
  },
];

// ── Helpers ──

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Evolve an agent's metrics with random walk each tick */
function evolveMetrics(agent: AgentState): void {
  // ROI: ±500-2000 bps random walk
  agent.roiBps += randInt(-2000, 2000);

  // Win rate: ±50-200 bps, clamped to [0, 10000]
  agent.winRateBps = clamp(agent.winRateBps + randInt(-200, 200), 0, 10000);

  // Trades: +1-5 per tick
  agent.totalTrades += randInt(1, 5);

  // TVL: ±1-5%
  const tvlChange = Number(agent.tvlManaged) * randInt(-5, 5) / 100;
  agent.tvlManaged = BigInt(Math.max(0, Number(agent.tvlManaged) + Math.floor(tvlChange)));

  // Sharpe: loosely derived from ROI (roi / 10000 * some factor + noise)
  agent.sharpeRatioScaled = clamp(
    Math.floor(agent.roiBps / 10) + randInt(-500, 500),
    0,
    50000
  );

  // Drawdown: ±20-100 bps, clamped to [0, 10000]
  agent.maxDrawdownBps = clamp(agent.maxDrawdownBps + randInt(-100, 100), 0, 10000);
}

// ── Main ──

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;
  const metricsAddr = process.env.AGENT_METRICS as Address;
  const factoryAddr = process.env.BONDING_CURVE_FACTORY as Address;
  const pmAddr = process.env.PREDICTION_MARKET as Address;

  if (!privateKey || !rpcUrl || !metricsAddr || !factoryAddr || !pmAddr) {
    console.error("Missing env vars. See scripts/.env.example");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  // Use sepolia chain config but override the RPC to whatever is provided (e.g. Tenderly)
  const transport = http(rpcUrl);
  const publicClient: PublicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient: WalletClient = createWalletClient({ chain: sepolia, account, transport });

  console.log("===========================================");
  console.log("  CRE Continuous Simulation");
  console.log("===========================================");
  console.log(`  Account: ${account.address}`);
  console.log(`  Tick interval: ${TICK_INTERVAL_MS / 1000}s`);
  console.log(`  Agents: ${agents.map((a) => a.agentId).join(", ")}`);
  console.log("");

  let tick = 0;

  async function runTick() {
    tick++;
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`\n── Tick ${tick} [${ts}] ──`);

    // 1. Evolve and write metrics
    for (const agent of agents) {
      evolveMetrics(agent);

      try {
        const hash = await walletClient.writeContract({
          address: metricsAddr,
          abi: AgentMetricsABI,
          functionName: "updateMetrics",
          args: [
            BigInt(agent.agentId),
            BigInt(agent.roiBps),
            BigInt(agent.winRateBps),
            BigInt(agent.maxDrawdownBps),
            BigInt(agent.sharpeRatioScaled),
            agent.tvlManaged,
            BigInt(agent.totalTrades),
          ],
        });
        console.log(
          `  Agent ${agent.agentId}: ROI=${(agent.roiBps / 10000).toFixed(1)}%, ` +
            `WR=${(agent.winRateBps / 100).toFixed(0)}%, ` +
            `Sharpe=${(agent.sharpeRatioScaled / 10000).toFixed(2)} ` +
            `(tx: ${hash.slice(0, 10)}...)`
        );
      } catch (err: any) {
        console.error(`  Agent ${agent.agentId} metrics update failed:`, err.message?.slice(0, 80));
      }
    }

    // 2. Adjust slopes
    try {
      const agentIds = (await publicClient.readContract({
        address: factoryAddr,
        abi: BondingCurveFactoryABI,
        functionName: "getAllAgentIds",
      })) as bigint[];

      for (const agentId of agentIds) {
        const curveAddr = (await publicClient.readContract({
          address: factoryAddr,
          abi: BondingCurveFactoryABI,
          functionName: "getCurve",
          args: [agentId],
        })) as Address;

        if (curveAddr === "0x0000000000000000000000000000000000000000") continue;

        const agent = agents.find((a) => BigInt(a.agentId) === agentId);
        if (!agent) continue;

        // Compute slope using performance-weighted formula
        const baseSlope = parseEther("0.00001");
        const roiAbs = agent.roiBps > 0 ? BigInt(agent.roiBps) : 0n;
        const perfScore =
          (roiAbs * 40n + BigInt(agent.winRateBps) * 30n + BigInt(agent.sharpeRatioScaled) * 30n) /
          10000n;
        let newSlope = baseSlope + (baseSlope * perfScore) / 100n;
        if (newSlope > MAX_SLOPE) newSlope = MAX_SLOPE;

        try {
          const hash = await walletClient.writeContract({
            address: curveAddr,
            abi: AgentBondingCurveABI,
            functionName: "adjustSlope",
            args: [newSlope],
          });
          console.log(`  Curve ${Number(agentId)}: slope=${newSlope} (tx: ${hash.slice(0, 10)}...)`);
        } catch (err: any) {
          console.log(`  Curve ${Number(agentId)}: slope adjust skipped (${err.message?.slice(0, 60)})`);
        }
      }
    } catch (err: any) {
      console.error("  Slope adjustment failed:", err.message?.slice(0, 80));
    }

    // 3. Resolve expired markets
    try {
      const marketIds = (await publicClient.readContract({
        address: pmAddr,
        abi: PredictionMarketABI,
        functionName: "getAllMarketIds",
      })) as bigint[];

      for (const marketId of marketIds) {
        const market = (await publicClient.readContract({
          address: pmAddr,
          abi: PredictionMarketABI,
          functionName: "getMarket",
          args: [marketId],
        })) as any;

        // status 0 = OPEN, deadline is market[4]
        if (market.status !== 0) continue;
        const now = BigInt(Math.floor(Date.now() / 1000));
        if (now < market.deadline) continue;

        try {
          const hash = await walletClient.writeContract({
            address: pmAddr,
            abi: PredictionMarketABI,
            functionName: "resolve",
            args: [marketId],
          });
          console.log(`  Market ${Number(marketId)} resolved (tx: ${hash.slice(0, 10)}...)`);
        } catch (err: any) {
          console.log(`  Market ${Number(marketId)} resolve failed: ${err.message?.slice(0, 60)}`);
        }
      }
    } catch (err: any) {
      console.error("  Market resolution failed:", err.message?.slice(0, 80));
    }
  }

  // Run first tick immediately, then every TICK_INTERVAL_MS
  await runTick();
  setInterval(runTick, TICK_INTERVAL_MS);

  console.log(`\nSimulation running (Ctrl+C to stop)...`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
