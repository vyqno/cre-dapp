"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  useMarket,
  useUserStakes,
  METRIC_LABELS,
  COMPARISON_LABELS,
  STATUS_LABELS,
  prepareBetYes,
  prepareBetNo,
  prepareResolve,
  prepareClaim,
} from "@/lib/prediction-hooks";
import { useAgent } from "@/lib/hooks";
import { formatEth, shortenAddress, formatThreshold, formatTimeLeft } from "@/lib/utils";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";

export default function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const marketId = Number(id);

  if (isNaN(marketId) || marketId <= 0 || !Number.isInteger(marketId)) {
    notFound();
  }

  const { market, loading: marketLoading, error: marketError } = useMarket(marketId);
  const account = useActiveAccount();
  const { yesStake, noStake, hasClaimed } = useUserStakes(
    marketId,
    account?.address
  );
  const { mutate: sendTransaction, isPending: txPending } = useSendTransaction();

  // Fetch agent data for name
  const { agent } = useAgent(market?.agentId ?? 0);

  const [yesAmount, setYesAmount] = useState("");
  const [noAmount, setNoAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  if (marketLoading) {
    return (
      <div className="space-y-8">
        <Link
          href="/markets"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-white"
        >
          &larr; Back to markets
        </Link>
        <div className="h-12 w-96 animate-pulse rounded-lg bg-zinc-800" />
        <div className="h-6 w-64 animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="h-48 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50" />
      </div>
    );
  }

  if (marketError || !market) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold">
          {marketError ? "Error loading market" : "Market not found"}
        </h1>
        {marketError && (
          <p className="mt-2 text-sm text-red-400">{marketError}</p>
        )}
        <Link
          href="/markets"
          className="mt-4 inline-block text-blue-400 hover:underline"
        >
          Back to markets
        </Link>
      </div>
    );
  }

  const agentName = agent?.name || `Agent #${market.agentId}`;
  const total = market.totalYes + market.totalNo;
  const yesPercent = total > 0n ? Number((market.totalYes * 100n) / total) : 50;
  const noPercent = total > 0n ? 100 - yesPercent : 50;
  const deadlineDate = new Date(market.deadline * 1000);
  const now = Date.now();
  const isExpired = deadlineDate.getTime() < now;
  const isOpen = market.status === 0;
  const isResolved = market.status === 1 || market.status === 2;
  const isCancelled = market.status === 3;

  const statusColors: Record<number, string> = {
    0: "bg-emerald-500/10 text-emerald-400 border-emerald-900/30",
    1: "bg-blue-500/10 text-blue-400 border-blue-900/30",
    2: "bg-red-500/10 text-red-400 border-red-900/30",
    3: "bg-zinc-700/50 text-zinc-400 border-zinc-700",
  };

  // Potential payout calculations
  const userYesStakeNum = Number(yesStake) / 1e18;
  const userNoStakeNum = Number(noStake) / 1e18;
  const totalPool = Number(total) / 1e18;
  const totalYesNum = Number(market.totalYes) / 1e18;
  const totalNoNum = Number(market.totalNo) / 1e18;

  const yesPotentialPayout =
    totalYesNum > 0 ? (userYesStakeNum / totalYesNum) * totalPool : 0;
  const noPotentialPayout =
    totalNoNum > 0 ? (userNoStakeNum / totalNoNum) * totalPool : 0;

  // Bet payout preview
  const yesInputNum = Number(yesAmount) || 0;
  const noInputNum = Number(noAmount) || 0;
  const yesBetPayout =
    totalYesNum + yesInputNum > 0
      ? (yesInputNum / (totalYesNum + yesInputNum)) * (totalPool + yesInputNum)
      : 0;
  const noBetPayout =
    totalNoNum + noInputNum > 0
      ? (noInputNum / (totalNoNum + noInputNum)) * (totalPool + noInputNum)
      : 0;

  const handleBetYes = () => {
    if (!yesAmount || Number(yesAmount) <= 0) return;
    setTxError(null);
    const tx = prepareBetYes(marketId, yesAmount);
    sendTransaction(tx, {
      onSuccess: () => setYesAmount(""),
      onError: (err) => setTxError(err.message || "Transaction failed"),
    });
  };

  const handleBetNo = () => {
    if (!noAmount || Number(noAmount) <= 0) return;
    setTxError(null);
    const tx = prepareBetNo(marketId, noAmount);
    sendTransaction(tx, {
      onSuccess: () => setNoAmount(""),
      onError: (err) => setTxError(err.message || "Transaction failed"),
    });
  };

  const handleResolve = () => {
    setTxError(null);
    const tx = prepareResolve(marketId);
    sendTransaction(tx, {
      onError: (err) => setTxError(err.message || "Resolve failed"),
    });
  };

  const handleClaim = () => {
    setTxError(null);
    const tx = prepareClaim(marketId);
    sendTransaction(tx, {
      onError: (err) => setTxError(err.message || "Claim failed"),
    });
  };

  const canResolve = isOpen && isExpired;
  const canClaim =
    (isResolved || isCancelled) &&
    !hasClaimed &&
    (yesStake > 0n || noStake > 0n);

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/markets"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-white"
      >
        &larr; Back to markets
      </Link>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">
            Will {agentName}&apos;s {METRIC_LABELS[market.metric]} be{" "}
            {COMPARISON_LABELS[market.comparison]}{" "}
            {formatThreshold(market.metric, market.threshold)}?
          </h1>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusColors[market.status]}`}
          >
            {STATUS_LABELS[market.status]}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
          <span>
            {isExpired
              ? `Expired ${deadlineDate.toLocaleDateString()}`
              : formatTimeLeft(deadlineDate.getTime() - now)}
          </span>
          <span>|</span>
          <span>Created by {shortenAddress(market.creator)}</span>
          <span>|</span>
          <Link
            href={`/agent/${market.agentId}`}
            className="text-blue-400 hover:underline"
          >
            View {agentName}
          </Link>
        </div>
      </div>

      {/* Pool Visualization */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold">Market Pool</h2>
        <div className="flex justify-between text-sm">
          <span className="font-semibold text-emerald-400">
            YES {yesPercent}%
          </span>
          <span className="font-semibold text-red-400">NO {noPercent}%</span>
        </div>
        <div className="mt-2 flex h-4 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${yesPercent}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${noPercent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-sm text-zinc-400">
          <span>{formatEth(market.totalYes)} ETH</span>
          <span>{formatEth(market.totalNo)} ETH</span>
        </div>
        <p className="mt-3 text-center text-xs text-zinc-500">
          Total Volume: {formatEth(total)} ETH
        </p>
      </div>

      {/* Error display */}
      {txError && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {txError}
        </div>
      )}

      {/* Betting Panel (only when open and before deadline) */}
      {isOpen && !isExpired && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Bet YES */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-emerald-400">
              Bet YES
            </h3>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Amount (ETH)
              </label>
              <input
                type="number"
                step="0.001"
                placeholder="0.01"
                value={yesAmount}
                onChange={(e) => setYesAmount(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="mt-3 rounded-lg bg-zinc-800/50 p-3 text-xs text-zinc-400">
              <div className="flex justify-between">
                <span>Implied Odds</span>
                <span>{yesPercent}%</span>
              </div>
              {yesInputNum > 0 && (
                <div className="mt-1 flex justify-between">
                  <span>Potential Payout</span>
                  <span>{yesBetPayout.toFixed(4)} ETH</span>
                </div>
              )}
            </div>
            <button
              onClick={handleBetYes}
              disabled={
                !account || !yesAmount || Number(yesAmount) <= 0 || txPending
              }
              className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!account
                ? "Connect Wallet"
                : txPending
                  ? "Confirming..."
                  : "Bet YES"}
            </button>
          </div>

          {/* Bet NO */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-red-400">Bet NO</h3>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Amount (ETH)
              </label>
              <input
                type="number"
                step="0.001"
                placeholder="0.01"
                value={noAmount}
                onChange={(e) => setNoAmount(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none"
              />
            </div>
            <div className="mt-3 rounded-lg bg-zinc-800/50 p-3 text-xs text-zinc-400">
              <div className="flex justify-between">
                <span>Implied Odds</span>
                <span>{noPercent}%</span>
              </div>
              {noInputNum > 0 && (
                <div className="mt-1 flex justify-between">
                  <span>Potential Payout</span>
                  <span>{noBetPayout.toFixed(4)} ETH</span>
                </div>
              )}
            </div>
            <button
              onClick={handleBetNo}
              disabled={
                !account || !noAmount || Number(noAmount) <= 0 || txPending
              }
              className="mt-4 w-full rounded-lg bg-red-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!account
                ? "Connect Wallet"
                : txPending
                  ? "Confirming..."
                  : "Bet NO"}
            </button>
          </div>
        </div>
      )}

      {/* Your Position */}
      {(yesStake > 0n || noStake > 0n) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">Your Position</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {yesStake > 0n && (
              <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 p-4">
                <p className="text-xs text-emerald-400">YES Stake</p>
                <p className="mt-1 text-lg font-bold">
                  {userYesStakeNum.toFixed(4)} ETH
                </p>
                <p className="text-xs text-zinc-500">
                  Potential payout: {yesPotentialPayout.toFixed(4)} ETH
                </p>
              </div>
            )}
            {noStake > 0n && (
              <div className="rounded-lg border border-red-900/30 bg-red-950/10 p-4">
                <p className="text-xs text-red-400">NO Stake</p>
                <p className="mt-1 text-lg font-bold">
                  {userNoStakeNum.toFixed(4)} ETH
                </p>
                <p className="text-xs text-zinc-500">
                  Potential payout: {noPotentialPayout.toFixed(4)} ETH
                </p>
              </div>
            )}
          </div>
          {hasClaimed && (
            <p className="mt-3 text-sm text-zinc-500">
              You have already claimed your payout.
            </p>
          )}
        </div>
      )}

      {/* Resolve / Claim buttons */}
      <div className="flex gap-4">
        {canResolve && (
          <button
            onClick={handleResolve}
            disabled={txPending}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {txPending ? "Resolving..." : "Resolve Market"}
          </button>
        )}
        {canClaim && (
          <button
            onClick={handleClaim}
            disabled={txPending}
            className="flex-1 rounded-lg bg-yellow-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {txPending ? "Claiming..." : "Claim Payout"}
          </button>
        )}
      </div>

      {/* Market Details */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold">Market Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs text-zinc-500">Agent</p>
            <p className="mt-1 font-mono">{agentName}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Metric</p>
            <p className="mt-1 font-mono">{METRIC_LABELS[market.metric]}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Condition</p>
            <p className="mt-1 font-mono">
              {COMPARISON_LABELS[market.comparison]}{" "}
              {formatThreshold(market.metric, market.threshold)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Deadline</p>
            <p className="mt-1 font-mono">
              {deadlineDate.toLocaleDateString()}{" "}
              {deadlineDate.toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>

      {/* CRE Badge */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
            <span className="text-lg text-blue-400">&#x2713;</span>
          </div>
          <div>
            <p className="font-semibold">CRE-Verified Resolution</p>
            <p className="text-sm text-zinc-400">
              Market outcome is determined by on-chain AgentMetrics data,
              verified by Chainlink CRE DON consensus. No manual oracle needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
