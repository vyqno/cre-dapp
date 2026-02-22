import { createThirdwebClient, getContract, readContract } from "thirdweb";
import { appChain } from "./thirdweb";

// Server-side thirdweb client (reuses same client ID as frontend)
const serverClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});

export const serverAgentRegistryContract = getContract({
  client: serverClient,
  chain: appChain,
  address: process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS!,
});

export const serverAgentMetricsContract = getContract({
  client: serverClient,
  chain: appChain,
  address: process.env.NEXT_PUBLIC_AGENT_METRICS_ADDRESS!,
});

export const serverBondingCurveFactoryContract = getContract({
  client: serverClient,
  chain: appChain,
  address: process.env.NEXT_PUBLIC_BONDING_CURVE_FACTORY_ADDRESS!,
});

export function getServerBondingCurveContract(address: string) {
  return getContract({
    client: serverClient,
    chain: appChain,
    address,
  });
}

// Method signatures (same as frontend hooks.ts)
const METHODS = {
  getActiveAgentIds: "function getActiveAgentIds() view returns (uint256[])",
  getAgent:
    "function getAgent(uint256 agentId) view returns ((uint256 id, address wallet, address creator, string name, string strategyType, string description, bool isActive, uint256 registeredAt))",
  getMetrics:
    "function getMetrics(uint256 agentId) view returns ((int256 roiBps, uint256 winRateBps, uint256 maxDrawdownBps, uint256 sharpeRatioScaled, uint256 tvlManaged, uint256 totalTrades, uint256 lastUpdated))",
  getCurve: "function getCurve(uint256 agentId) view returns (address)",
  currentPrice: "function currentPrice() view returns (uint256)",
  totalSupply: "function totalSupply() view returns (uint256)",
  reserveBalance: "function reserveBalance() view returns (uint256)",
} as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function fetchAgentServerData(agentId: number) {
  const [agentRaw, metricsRaw, curveAddress] = await Promise.all([
    readContract({
      contract: serverAgentRegistryContract,
      method: METHODS.getAgent,
      params: [BigInt(agentId)],
    }),
    readContract({
      contract: serverAgentMetricsContract,
      method: METHODS.getMetrics,
      params: [BigInt(agentId)],
    }),
    readContract({
      contract: serverBondingCurveFactoryContract,
      method: METHODS.getCurve,
      params: [BigInt(agentId)],
    }),
  ]);

  const agent = agentRaw as any;
  const metrics = metricsRaw as any;
  const id = Number(agent.id ?? agent[0] ?? 0);
  if (id === 0) return null;

  const hasCurve = curveAddress && curveAddress !== ZERO_ADDRESS;
  let tokenPrice = "0";
  let totalSupply = "0";
  let reserveBalance = "0";

  if (hasCurve) {
    const curveContract = getServerBondingCurveContract(curveAddress);
    const [price, supply, reserve] = await Promise.all([
      readContract({ contract: curveContract, method: METHODS.currentPrice, params: [] }),
      readContract({ contract: curveContract, method: METHODS.totalSupply, params: [] }),
      readContract({ contract: curveContract, method: METHODS.reserveBalance, params: [] }),
    ]);
    tokenPrice = price.toString();
    totalSupply = supply.toString();
    reserveBalance = reserve.toString();
  }

  return {
    agent: {
      id,
      name: String(agent.name ?? agent[3] ?? `Agent ${agentId}`),
      wallet: String(agent.wallet ?? agent[1] ?? "0x"),
      creator: String(agent.creator ?? agent[2] ?? "0x"),
      strategyType: String(agent.strategyType ?? agent[4] ?? "Unknown"),
      description: String(agent.description ?? agent[5] ?? ""),
      isActive: Boolean(agent.isActive ?? agent[6] ?? true),
      registeredAt: Number(agent.registeredAt ?? agent[7] ?? 0),
    },
    metrics: {
      roiBps: Number(metrics.roiBps ?? metrics[0] ?? 0),
      winRateBps: Number(metrics.winRateBps ?? metrics[1] ?? 0),
      maxDrawdownBps: Number(metrics.maxDrawdownBps ?? metrics[2] ?? 0),
      sharpeRatioScaled: Number(metrics.sharpeRatioScaled ?? metrics[3] ?? 0),
      tvlManaged: Number(metrics.tvlManaged ?? metrics[4] ?? 0),
      totalTrades: Number(metrics.totalTrades ?? metrics[5] ?? 0),
      lastUpdated: Number(metrics.lastUpdated ?? metrics[6] ?? 0),
    },
    curve: {
      address: curveAddress || ZERO_ADDRESS,
      tokenPrice,
      totalSupply,
      reserveBalance,
    },
  };
}

export async function fetchAllAgentIds(): Promise<bigint[]> {
  const ids = await readContract({
    contract: serverAgentRegistryContract,
    method: METHODS.getActiveAgentIds,
    params: [],
  });
  return ids as bigint[];
}

export { readContract };
