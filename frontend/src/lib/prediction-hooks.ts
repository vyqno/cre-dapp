"use client";

import { useState, useEffect, useCallback } from "react";
import { readContract, prepareContractCall, toWei } from "thirdweb";
import { predictionMarketContract } from "./contracts";

// --- Types ---

export interface MarketData {
  id: number;
  agentId: number;
  metric: number; // 0=ROI, 1=WIN_RATE, 2=SHARPE, 3=TVL, 4=TRADES, 5=DRAWDOWN
  comparison: number; // 0=ABOVE, 1=BELOW
  threshold: bigint;
  deadline: number;
  creator: string;
  status: number; // 0=OPEN, 1=RESOLVED_YES, 2=RESOLVED_NO, 3=CANCELLED
  totalYes: bigint;
  totalNo: bigint;
}

// --- Labels ---

export const METRIC_LABELS: Record<number, string> = {
  0: "ROI",
  1: "Win Rate",
  2: "Sharpe Ratio",
  3: "TVL",
  4: "Total Trades",
  5: "Max Drawdown",
};

export const COMPARISON_LABELS: Record<number, string> = {
  0: "above",
  1: "below",
};

export const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Resolved YES",
  2: "Resolved NO",
  3: "Cancelled",
};

// --- Method signatures for thirdweb readContract ---

const PREDICTION_METHODS = {
  getMarket:
    "function getMarket(uint256 marketId) view returns ((uint256 agentId, uint8 metric, uint8 comparison, int256 threshold, uint256 deadline, address creator, uint8 status, uint256 totalYes, uint256 totalNo))",
  getAllMarketIds:
    "function getAllMarketIds() view returns (uint256[])",
  getMarketCount:
    "function getMarketCount() view returns (uint256)",
  yesStakes:
    "function yesStakes(uint256 marketId, address user) view returns (uint256)",
  noStakes:
    "function noStakes(uint256 marketId, address user) view returns (uint256)",
  claimed:
    "function claimed(uint256 marketId, address user) view returns (bool)",
  betYes: "function betYes(uint256 marketId) payable",
  betNo: "function betNo(uint256 marketId) payable",
  resolve: "function resolve(uint256 marketId)",
  claim: "function claim(uint256 marketId)",
  createMarket:
    "function createMarket(uint256 agentId, uint8 metric, uint8 comparison, int256 threshold, uint256 deadline) returns (uint256)",
} as const;

// --- Fetch single market ---

async function fetchMarketData(marketId: bigint): Promise<MarketData | null> {
  try {
    const raw = await readContract({
      contract: predictionMarketContract,
      method: PREDICTION_METHODS.getMarket,
      params: [marketId],
    });

    const m = raw as any;
    return {
      id: Number(marketId),
      agentId: Number(m.agentId ?? m[0] ?? 0),
      metric: Number(m.metric ?? m[1] ?? 0),
      comparison: Number(m.comparison ?? m[2] ?? 0),
      threshold: BigInt(m.threshold ?? m[3] ?? 0),
      deadline: Number(m.deadline ?? m[4] ?? 0),
      creator: String(m.creator ?? m[5] ?? "0x"),
      status: Number(m.status ?? m[6] ?? 0),
      totalYes: BigInt(m.totalYes ?? m[7] ?? 0),
      totalNo: BigInt(m.totalNo ?? m[8] ?? 0),
    };
  } catch {
    return null;
  }
}

// --- Hook: Fetch all markets ---

export function useMarkets() {
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    try {
      setError(null);

      const marketIds = await readContract({
        contract: predictionMarketContract,
        method: PREDICTION_METHODS.getAllMarketIds,
        params: [],
      });

      if (!marketIds || marketIds.length === 0) {
        setMarkets([]);
        setLoading(false);
        return;
      }

      const results = await Promise.all(
        (marketIds as bigint[]).map((id) => fetchMarketData(id))
      );

      setMarkets(results.filter((m): m is MarketData => m !== null));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch markets";
      console.error("Failed to fetch markets:", err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 30_000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  return { markets, loading, error, refetch: fetchMarkets };
}

// --- Hook: Fetch single market ---

export function useMarket(id: number) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        setError(null);
        const data = await fetchMarketData(BigInt(id));
        if (!cancelled) setMarket(data);
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to fetch market";
          console.error(`Failed to fetch market ${id}:`, err);
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

  return { market, loading, error };
}

// --- Hook: User stakes for a market ---

export function useUserStakes(marketId: number, userAddress: string | undefined) {
  const [yesStake, setYesStake] = useState<bigint>(0n);
  const [noStake, setNoStake] = useState<bigint>(0n);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userAddress) {
      setYesStake(0n);
      setNoStake(0n);
      setHasClaimed(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetch() {
      try {
        const [yes, no, claimed] = await Promise.all([
          readContract({
            contract: predictionMarketContract,
            method: PREDICTION_METHODS.yesStakes,
            params: [BigInt(marketId), userAddress!],
          }),
          readContract({
            contract: predictionMarketContract,
            method: PREDICTION_METHODS.noStakes,
            params: [BigInt(marketId), userAddress!],
          }),
          readContract({
            contract: predictionMarketContract,
            method: PREDICTION_METHODS.claimed,
            params: [BigInt(marketId), userAddress!],
          }),
        ]);
        if (!cancelled) {
          setYesStake(BigInt(yes));
          setNoStake(BigInt(no));
          setHasClaimed(Boolean(claimed));
        }
      } catch {
        if (!cancelled) {
          setYesStake(0n);
          setNoStake(0n);
          setHasClaimed(false);
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
  }, [marketId, userAddress]);

  return { yesStake, noStake, hasClaimed, loading };
}

// --- Prepare transactions ---

export function prepareBetYes(marketId: number, ethAmount: string) {
  return prepareContractCall({
    contract: predictionMarketContract,
    method: PREDICTION_METHODS.betYes,
    params: [BigInt(marketId)],
    value: toWei(ethAmount),
  });
}

export function prepareBetNo(marketId: number, ethAmount: string) {
  return prepareContractCall({
    contract: predictionMarketContract,
    method: PREDICTION_METHODS.betNo,
    params: [BigInt(marketId)],
    value: toWei(ethAmount),
  });
}

export function prepareResolve(marketId: number) {
  return prepareContractCall({
    contract: predictionMarketContract,
    method: PREDICTION_METHODS.resolve,
    params: [BigInt(marketId)],
  });
}

export function prepareClaim(marketId: number) {
  return prepareContractCall({
    contract: predictionMarketContract,
    method: PREDICTION_METHODS.claim,
    params: [BigInt(marketId)],
  });
}

export function prepareCreateMarket(
  agentId: number,
  metric: number,
  comparison: number,
  threshold: bigint,
  deadline: number
) {
  return prepareContractCall({
    contract: predictionMarketContract,
    method: PREDICTION_METHODS.createMarket,
    params: [BigInt(agentId), metric, comparison, threshold, BigInt(deadline)],
  });
}
