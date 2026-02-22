/**
 * Status — viem on-chain reads for the `status` command.
 *
 * All reads are fire-and-forget via Promise.allSettled so a missing
 * contract address never crashes the whole status check.
 */

import {
  createPublicClient,
  http,
  formatEther,
  type Address,
  type PublicClient,
} from "viem";
import { sepolia } from "viem/chains";
import { loadEnvConfig, ETHERSCAN_BASE } from "./config.js";
import { AgentRegistryABI }       from "../../workflows/contracts/abi/AgentRegistry.ts";
import { AgentMetricsABI }        from "../../workflows/contracts/abi/AgentMetrics.ts";
import { AgentBondingCurveABI }   from "../../workflows/contracts/abi/AgentBondingCurve.ts";
import { BondingCurveFactoryABI } from "../../workflows/contracts/abi/BondingCurveFactory.ts";
import { PredictionMarketABI }    from "../../workflows/contracts/abi/PredictionMarket.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface ContractStatus {
  address: string;
  deployed: boolean;
  etherscanUrl: string;
}

export interface AgentStatus {
  id:      number;
  name:    string;
  curve:   string;
  price:   string;
  supply:  string;
  reserve: string;
  slope:   string;
  roiBps?: string;
}

export interface MarketStatus {
  id:         number;
  agentId:    number;
  metric:     string;
  comparison: string;
  threshold:  string;
  status:     string;
  totalYes:   string;
  totalNo:    string;
}

export interface FullStatus {
  deployer:         string;
  deployerBalance:  string;
  contracts:        Record<string, ContractStatus>;
  totalAgents:      number;
  agents:           AgentStatus[];
  authorizedWriter: string;
  marketCount:      number;
  markets:          MarketStatus[];
}

// ── Enum labels ───────────────────────────────────────────────────────

const METRIC_LABELS  = ["ROI", "WinRate", "Drawdown", "Sharpe", "TVL", "Trades"];
const COMPARE_LABELS = ["ABOVE", "BELOW"];
const STATUS_LABELS  = ["OPEN", "RESOLVED_YES", "RESOLVED_NO", "CANCELLED"];

// ── Helpers ───────────────────────────────────────────────────────────

function ok<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === "fulfilled" ? result.value : undefined;
}

function makeClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}

function addrStatus(addr: string | undefined): ContractStatus {
  if (!addr) return { address: "not deployed", deployed: false, etherscanUrl: "" };
  return {
    address:     addr,
    deployed:    true,
    etherscanUrl: `${ETHERSCAN_BASE}/address/${addr}`,
  };
}

// ── Main export ───────────────────────────────────────────────────────

export async function fetchStatus(): Promise<FullStatus> {
  const cfg    = loadEnvConfig();
  const client = makeClient(cfg.sepoliaRpcUrl);

  // ── Deployer balance ────────────────────────────────────────────────
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(cfg.privateKey);

  const balanceWei = await client.getBalance({ address: account.address }).catch(() => 0n);

  // ── Contract statuses ───────────────────────────────────────────────
  const contracts: Record<string, ContractStatus> = {
    AgentRegistry:       addrStatus(cfg.agentRegistry),
    AgentMetrics:        addrStatus(cfg.agentMetrics),
    BondingCurveFactory: addrStatus(cfg.bondingCurveFactory),
    PredictionMarket:    addrStatus(cfg.predictionMarket),
  };

  // ── Parallel on-chain reads ─────────────────────────────────────────
  const [totalAgentsRes, authorizedWriterRes, marketCountRes, agentIdsRes] =
    await Promise.allSettled([
      cfg.agentRegistry
        ? client.readContract({
            address: cfg.agentRegistry as Address,
            abi:     AgentRegistryABI,
            functionName: "totalAgents",
          })
        : Promise.reject("no registry"),

      cfg.agentMetrics
        ? client.readContract({
            address: cfg.agentMetrics as Address,
            abi:     AgentMetricsABI,
            functionName: "authorizedWriter",
          })
        : Promise.reject("no metrics"),

      cfg.predictionMarket
        ? client.readContract({
            address: cfg.predictionMarket as Address,
            abi:     PredictionMarketABI,
            functionName: "getMarketCount",
          })
        : Promise.reject("no pm"),

      cfg.bondingCurveFactory
        ? client.readContract({
            address: cfg.bondingCurveFactory as Address,
            abi:     BondingCurveFactoryABI,
            functionName: "getAllAgentIds",
          })
        : Promise.reject("no factory"),
    ]);

  const totalAgents      = Number(ok(totalAgentsRes) ?? 0n);
  const authorizedWriter = (ok(authorizedWriterRes) as string | undefined) ?? "unknown";
  const marketCount      = Number(ok(marketCountRes) ?? 0n);
  const curveAgentIds    = (ok(agentIdsRes) as bigint[] | undefined) ?? [];

  // ── Agent details ───────────────────────────────────────────────────
  const agents: AgentStatus[] = [];

  for (const agentId of curveAgentIds) {
    const id = Number(agentId);

    const [agentRes, curveAddrRes, metricsRes] = await Promise.allSettled([
      cfg.agentRegistry
        ? client.readContract({
            address: cfg.agentRegistry as Address,
            abi:     AgentRegistryABI,
            functionName: "getAgent",
            args:    [agentId],
          })
        : Promise.reject("no registry"),

      client.readContract({
        address: cfg.bondingCurveFactory as Address,
        abi:     BondingCurveFactoryABI,
        functionName: "getCurve",
        args:    [agentId],
      }),

      cfg.agentMetrics
        ? client.readContract({
            address: cfg.agentMetrics as Address,
            abi:     AgentMetricsABI,
            functionName: "getMetrics",
            args:    [agentId],
          })
        : Promise.reject("no metrics"),
    ]);

    const agentData   = ok(agentRes)   as any;
    const curveAddr   = ok(curveAddrRes) as Address | undefined;
    const metricsData = ok(metricsRes) as any;

    // Read curve data if address exists
    let price = "–", supply = "–", reserve = "–", slope = "–";
    if (curveAddr && curveAddr !== "0x0000000000000000000000000000000000000000") {
      const [priceRes, supplyRes, reserveRes, slopeRes] = await Promise.allSettled([
        client.readContract({ address: curveAddr, abi: AgentBondingCurveABI, functionName: "currentPrice" }),
        client.readContract({ address: curveAddr, abi: AgentBondingCurveABI, functionName: "totalSupply" }),
        client.readContract({ address: curveAddr, abi: AgentBondingCurveABI, functionName: "reserveBalance" }),
        client.readContract({ address: curveAddr, abi: AgentBondingCurveABI, functionName: "slope" }),
      ]);
      price   = ok(priceRes)   ? formatEther(ok(priceRes)   as bigint) : "–";
      supply  = ok(supplyRes)  ? formatEther(ok(supplyRes)  as bigint) : "–";
      reserve = ok(reserveRes) ? formatEther(ok(reserveRes) as bigint) : "–";
      slope   = ok(slopeRes)   ? formatEther(ok(slopeRes)   as bigint) : "–";
    }

    agents.push({
      id,
      name:    agentData?.name   ?? `Agent #${id}`,
      curve:   curveAddr         ?? "none",
      price,
      supply,
      reserve,
      slope,
      roiBps:  metricsData?.roiBps !== undefined ? String(metricsData.roiBps) : undefined,
    });
  }

  // ── Markets ─────────────────────────────────────────────────────────
  const markets: MarketStatus[] = [];

  if (cfg.predictionMarket && marketCount > 0) {
    const allIdsRes = await client
      .readContract({
        address:      cfg.predictionMarket as Address,
        abi:          PredictionMarketABI,
        functionName: "getAllMarketIds",
      })
      .catch(() => [] as bigint[]);

    for (const marketId of (allIdsRes as bigint[])) {
      const mRes = await client
        .readContract({
          address:      cfg.predictionMarket as Address,
          abi:          PredictionMarketABI,
          functionName: "getMarket",
          args:         [marketId],
        })
        .catch(() => null);

      if (!mRes) continue;
      const m = mRes as any;

      markets.push({
        id:         Number(marketId),
        agentId:    Number(m.agentId),
        metric:     METRIC_LABELS[m.metric]  ?? String(m.metric),
        comparison: COMPARE_LABELS[m.comparison] ?? String(m.comparison),
        threshold:  String(m.threshold),
        status:     STATUS_LABELS[m.status]  ?? String(m.status),
        totalYes:   formatEther(m.totalYes as bigint),
        totalNo:    formatEther(m.totalNo  as bigint),
      });
    }
  }

  return {
    deployer:        account.address,
    deployerBalance: formatEther(balanceWei),
    contracts,
    totalAgents,
    agents,
    authorizedWriter,
    marketCount,
    markets,
  };
}
