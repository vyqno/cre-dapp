"use client";

import { useState, useEffect, useCallback } from "react";
import { readContract, prepareContractCall, toWei } from "thirdweb";
import {
  agentRegistryContract,
  agentMetricsContract,
  bondingCurveFactoryContract,
  getBondingCurveContract,
} from "./contracts";

// --- Helpers ---

/** Debounce a string value by delay ms */
function useDebouncedValue(value: string, delay: number = 400): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// --- Types ---

export interface AgentData {
  id: number;
  name: string;
  wallet: string;
  creator: string;
  strategyType: string;
  description: string;
  isActive: boolean;
  registeredAt: number;
}

export interface MetricsData {
  roiBps: number;
  winRateBps: number;
  maxDrawdownBps: number;
  sharpeRatioScaled: number;
  tvlManaged: number;
  totalTrades: number;
  lastUpdated: number;
}

export interface AgentWithMetrics extends AgentData {
  metrics: MetricsData;
  curveAddress: string;
  tokenPrice: bigint;
  totalSupply: bigint;
  reserveBalance: bigint;
  slope: bigint;
}

// --- Method signatures for thirdweb readContract ---

const METHODS = {
  // AgentRegistry
  getActiveAgentIds:
    "function getActiveAgentIds() view returns (uint256[])",
  totalAgents:
    "function totalAgents() view returns (uint256)",
  getAgent:
    "function getAgent(uint256 agentId) view returns ((uint256 id, address wallet, address creator, string name, string strategyType, string description, bool isActive, uint256 registeredAt))",
  // AgentMetrics
  getMetrics:
    "function getMetrics(uint256 agentId) view returns ((int256 roiBps, uint256 winRateBps, uint256 maxDrawdownBps, uint256 sharpeRatioScaled, uint256 tvlManaged, uint256 totalTrades, uint256 lastUpdated))",
  // BondingCurveFactory
  getCurve:
    "function getCurve(uint256 agentId) view returns (address)",
  // AgentBondingCurve
  currentPrice: "function currentPrice() view returns (uint256)",
  totalSupply: "function totalSupply() view returns (uint256)",
  reserveBalance: "function reserveBalance() view returns (uint256)",
  slope: "function slope() view returns (uint256)",
  balanceOf: "function balanceOf(address account) view returns (uint256)",
  getBuyPrice:
    "function getBuyPrice(uint256 tokenAmount) view returns (uint256)",
  getSellRefund:
    "function getSellRefund(uint256 tokenAmount) view returns (uint256)",
  buy: "function buy() payable returns (uint256)",
  sell: "function sell(uint256 tokenAmount)",
  // AgentRegistry (write)
  registerAgent:
    "function registerAgent(address wallet, string name, string strategyType, string description, string[] capabilities) returns (uint256)",
  // BondingCurveFactory (write)
  createCurve:
    "function createCurve(uint256 agentId, string name, string symbol) returns (address)",
} as const;

// --- Read a single agent's full data ---

async function fetchAgentData(agentId: bigint): Promise<AgentWithMetrics | null> {
  const [agentRaw, metricsRaw, curveAddress] = await Promise.all([
    readContract({
      contract: agentRegistryContract,
      method: METHODS.getAgent,
      params: [agentId],
    }),
    readContract({
      contract: agentMetricsContract,
      method: METHODS.getMetrics,
      params: [agentId],
    }),
    readContract({
      contract: bondingCurveFactoryContract,
      method: METHODS.getCurve,
      params: [agentId],
    }),
  ]);

  // Check if agent exists (id=0 means non-existent)
  const agent = agentRaw as any;
  const agentIdNum = Number(agent.id ?? agent[0] ?? 0);
  if (agentIdNum === 0) return null;

  // Read bonding curve state (skip if no curve deployed)
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const hasCurve =
    curveAddress && curveAddress !== ZERO_ADDRESS;

  let price = 0n;
  let supply = 0n;
  let reserve = 0n;
  let curveSlope = 0n;

  if (hasCurve) {
    const curveContract = getBondingCurveContract(curveAddress);
    [price, supply, reserve, curveSlope] = await Promise.all([
      readContract({
        contract: curveContract,
        method: METHODS.currentPrice,
        params: [],
      }).then((v) => BigInt(v)),
      readContract({
        contract: curveContract,
        method: METHODS.totalSupply,
        params: [],
      }).then((v) => BigInt(v)),
      readContract({
        contract: curveContract,
        method: METHODS.reserveBalance,
        params: [],
      }).then((v) => BigInt(v)),
      readContract({
        contract: curveContract,
        method: METHODS.slope,
        params: [],
      }).then((v) => BigInt(v)),
    ]);
  }

  // Decode agent struct - thirdweb returns as array-like with field access
  const metrics = metricsRaw as any;

  return {
    id: Number(agent.id ?? agent[0] ?? agentId),
    name: String(agent.name ?? agent[3] ?? `Agent ${agentId}`),
    wallet: String(agent.wallet ?? agent[1] ?? "0x"),
    creator: String(agent.creator ?? agent[2] ?? "0x"),
    strategyType: String(agent.strategyType ?? agent[4] ?? "Unknown"),
    description: String(agent.description ?? agent[5] ?? ""),
    isActive: Boolean(agent.isActive ?? agent[6] ?? true),
    registeredAt: Number(agent.registeredAt ?? agent[7] ?? 0),
    metrics: {
      roiBps: Number(metrics.roiBps ?? metrics[0] ?? 0),
      winRateBps: Number(metrics.winRateBps ?? metrics[1] ?? 0),
      maxDrawdownBps: Number(metrics.maxDrawdownBps ?? metrics[2] ?? 0),
      sharpeRatioScaled: Number(metrics.sharpeRatioScaled ?? metrics[3] ?? 0),
      tvlManaged: Number(metrics.tvlManaged ?? metrics[4] ?? 0),
      totalTrades: Number(metrics.totalTrades ?? metrics[5] ?? 0),
      lastUpdated: Number(metrics.lastUpdated ?? metrics[6] ?? 0),
    },
    curveAddress: curveAddress || ZERO_ADDRESS,
    tokenPrice: price,
    totalSupply: supply,
    reserveBalance: reserve,
    slope: curveSlope,
  };
}

// --- Hook: Fetch all agents ---

export function useAgents() {
  const [agents, setAgents] = useState<AgentWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      setError(null);

      const agentIds = await readContract({
        contract: agentRegistryContract,
        method: METHODS.getActiveAgentIds,
        params: [],
      });

      if (!agentIds || agentIds.length === 0) {
        setAgents([]);
        setLoading(false);
        return;
      }

      const results = await Promise.all(
        (agentIds as bigint[]).map((id) => fetchAgentData(id))
      );

      setAgents(results.filter((a): a is AgentWithMetrics => a !== null));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch agents";
      console.error("Failed to fetch agents:", err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 30_000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  return { agents, loading, error, refetch: fetchAgents };
}

// --- Hook: Fetch single agent ---

export function useAgent(id: number) {
  const [agent, setAgent] = useState<AgentWithMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        setError(null);
        const data = await fetchAgentData(BigInt(id));
        if (!cancelled) setAgent(data);
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to fetch agent";
          console.error(`Failed to fetch agent ${id}:`, err);
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    const interval = setInterval(fetch, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  return { agent, loading, error };
}

// --- Hook: User's token balance for a specific curve ---

export function useTokenBalance(
  curveAddress: string | undefined,
  userAddress: string | undefined
) {
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!curveAddress || !userAddress) {
      setBalance(0n);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const curveContract = getBondingCurveContract(curveAddress);

    async function fetch() {
      try {
        const bal = await readContract({
          contract: curveContract,
          method: METHODS.balanceOf,
          params: [userAddress!],
        });
        if (!cancelled) setBalance(BigInt(bal));
      } catch {
        if (!cancelled) setBalance(0n);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetch();
    const interval = setInterval(fetch, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [curveAddress, userAddress]);

  return { balance, loading };
}

// --- Hook: Buy price estimate ---

export function useBuyPrice(curveAddress: string | undefined, ethAmount: string) {
  const [estimatedTokens, setEstimatedTokens] = useState<bigint>(0n);
  const debouncedAmount = useDebouncedValue(ethAmount);

  useEffect(() => {
    if (!curveAddress || !debouncedAmount || Number(debouncedAmount) <= 0) {
      setEstimatedTokens(0n);
      return;
    }

    let cancelled = false;
    const curveContract = getBondingCurveContract(curveAddress);

    async function fetch() {
      try {
        const price = await readContract({
          contract: curveContract,
          method: METHODS.currentPrice,
          params: [],
        });
        const ethWei = toWei(debouncedAmount);
        const priceVal = BigInt(price);
        if (priceVal > 0n) {
          const tokens = (ethWei * BigInt(1e18)) / priceVal;
          if (!cancelled) setEstimatedTokens(tokens);
        }
      } catch {
        if (!cancelled) setEstimatedTokens(0n);
      }
    }

    fetch();
    return () => {
      cancelled = true;
    };
  }, [curveAddress, debouncedAmount]);

  return estimatedTokens;
}

// --- Hook: Sell refund estimate ---

export function useSellRefund(
  curveAddress: string | undefined,
  tokenAmount: string
) {
  const [refund, setRefund] = useState<bigint>(0n);
  const debouncedAmount = useDebouncedValue(tokenAmount);

  useEffect(() => {
    if (!curveAddress || !debouncedAmount || Number(debouncedAmount) <= 0) {
      setRefund(0n);
      return;
    }

    let cancelled = false;
    const curveContract = getBondingCurveContract(curveAddress);

    async function fetch() {
      try {
        const tokensWei = toWei(debouncedAmount);
        const result = await readContract({
          contract: curveContract,
          method: METHODS.getSellRefund,
          params: [tokensWei],
        });
        if (!cancelled) setRefund(BigInt(result));
      } catch {
        if (!cancelled) setRefund(0n);
      }
    }

    fetch();
    return () => {
      cancelled = true;
    };
  }, [curveAddress, debouncedAmount]);

  return refund;
}

// --- Prepare buy/sell transactions ---

export function prepareBuyTransaction(curveAddress: string, ethAmount: string) {
  const curveContract = getBondingCurveContract(curveAddress);
  return prepareContractCall({
    contract: curveContract,
    method: METHODS.buy,
    params: [],
    value: toWei(ethAmount),
  });
}

export function prepareSellTransaction(
  curveAddress: string,
  tokenAmount: string
) {
  const curveContract = getBondingCurveContract(curveAddress);
  const tokensWei = toWei(tokenAmount);
  return prepareContractCall({
    contract: curveContract,
    method: METHODS.sell,
    params: [tokensWei],
  });
}

// --- Prepare registration transactions ---

export function prepareRegisterAgent(
  wallet: string,
  name: string,
  strategyType: string,
  description: string,
  capabilities: string[],
) {
  return prepareContractCall({
    contract: agentRegistryContract,
    method: METHODS.registerAgent,
    params: [wallet, name, strategyType, description, capabilities],
  });
}

export function prepareCreateCurve(
  agentId: bigint,
  tokenName: string,
  tokenSymbol: string,
) {
  return prepareContractCall({
    contract: bondingCurveFactoryContract,
    method: METHODS.createCurve,
    params: [agentId, tokenName, tokenSymbol],
  });
}
