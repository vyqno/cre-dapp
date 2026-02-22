"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useMarkets,
  METRIC_LABELS,
  COMPARISON_LABELS,
  STATUS_LABELS,
  prepareCreateMarket,
  type MarketData,
} from "@/lib/prediction-hooks";
import { useAgents, type AgentWithMetrics } from "@/lib/hooks";
import { formatEth, formatThreshold, formatTimeLeft } from "@/lib/utils";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import toast from "react-hot-toast";

function StatusBadge({ status }: { status: number }) {
  const colors: Record<number, string> = {
    0: "bg-emerald-500/10 text-emerald-400",
    1: "bg-blue-500/10 text-blue-400",
    2: "bg-red-500/10 text-red-400",
    3: "bg-zinc-700 text-zinc-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors[status] || colors[3]}`}
    >
      {STATUS_LABELS[status] || "Unknown"}
    </span>
  );
}

function MarketCard({
  market,
  agents,
}: {
  market: MarketData;
  agents: AgentWithMetrics[];
}) {
  const agent = agents.find((a) => a.id === market.agentId);
  const agentName = agent?.name || `Agent #${market.agentId}`;
  const total = market.totalYes + market.totalNo;
  const yesPercent =
    total > 0n ? Number((market.totalYes * 100n) / total) : 50;
  const noPercent = total > 0n ? 100 - yesPercent : 50;
  const deadlineDate = new Date(market.deadline * 1000);
  const now = Date.now();
  const isExpired = deadlineDate.getTime() < now;
  const timeLeft = isExpired
    ? "Expired"
    : formatTimeLeft(deadlineDate.getTime() - now);

  return (
    <Link
      href={`/markets/${market.id}`}
      className="block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-zinc-500">{agentName}</p>
          <p className="mt-1 font-medium">
            Will {agentName}&apos;s {METRIC_LABELS[market.metric]} be{" "}
            {COMPARISON_LABELS[market.comparison]}{" "}
            {formatThreshold(market.metric, market.threshold)}?
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={market.status} />
          {market.status === 0 && isExpired && (
            <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-semibold text-yellow-400">
              Expired
            </span>
          )}
        </div>
      </div>

      {/* Pool bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-zinc-400">
          <span>YES {yesPercent}%</span>
          <span>NO {noPercent}%</span>
        </div>
        <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${yesPercent}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${noPercent}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-zinc-500">
          <span>{formatEth(market.totalYes)} ETH</span>
          <span>{formatEth(market.totalNo)} ETH</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span>{timeLeft}</span>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
            &#x2713; CRE-resolved
          </span>
        </div>
        <span>
          Volume: {formatEth(market.totalYes + market.totalNo)} ETH
        </span>
      </div>
    </Link>
  );
}

function CreateMarketForm({
  agents,
  onClose,
}: {
  agents: AgentWithMetrics[];
  onClose: () => void;
}) {
  const account = useActiveAccount();
  const { mutate: sendTransaction, isPending } = useSendTransaction();
  const [agentId, setAgentId] = useState("");
  const [metric, setMetric] = useState("0");
  const [comparison, setComparison] = useState("0");
  const [threshold, setThreshold] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("7");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = () => {
    if (!agentId || !threshold || !deadlineDays) return;
    setError(null);

    const metricNum = Number(metric);
    let thresholdBigInt: bigint;

    // Convert threshold based on metric type
    switch (metricNum) {
      case 0: // ROI — user enters percentage, convert to bps x 100
        thresholdBigInt = BigInt(Math.round(Number(threshold) * 10000));
        break;
      case 1: // WIN_RATE — user enters percentage, convert to bps
        thresholdBigInt = BigInt(Math.round(Number(threshold) * 100));
        break;
      case 2: // SHARPE — user enters decimal, convert to scaled x 10000
        thresholdBigInt = BigInt(Math.round(Number(threshold) * 10000));
        break;
      case 3: // TVL — user enters USD, convert to USDC decimals
        thresholdBigInt = BigInt(Math.round(Number(threshold) * 1e6));
        break;
      case 4: // TRADES — absolute count
        thresholdBigInt = BigInt(Math.round(Number(threshold)));
        break;
      case 5: // DRAWDOWN — user enters percentage, convert to bps
        thresholdBigInt = BigInt(Math.round(Number(threshold) * 100));
        break;
      default:
        thresholdBigInt = BigInt(threshold);
    }

    const deadlineTimestamp = Math.floor(
      Date.now() / 1000 + Number(deadlineDays) * 86400
    );

    const tx = prepareCreateMarket(
      Number(agentId),
      Number(metric),
      Number(comparison),
      thresholdBigInt,
      deadlineTimestamp
    );

    toast.loading("Creating prediction market...", { id: "create-market" });
    sendTransaction(tx, {
      onSuccess: () => {
        toast.success("Market created!", { id: "create-market" });
        onClose();
      },
      onError: (err) => {
        const msg = err.message || "Transaction failed";
        setError(msg);
        toast.error(`Market creation failed: ${msg.slice(0, 80)}`, { id: "create-market" });
      },
    });
  };

  const thresholdPlaceholders: Record<number, string> = {
    0: "e.g. 15 for 15%",
    1: "e.g. 70 for 70%",
    2: "e.g. 1.85",
    3: "e.g. 2000000 for $2M",
    4: "e.g. 200",
    5: "e.g. 30 for 30%",
  };

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Create Prediction Market</h3>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white"
        >
          &times;
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Agent</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Select agent...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} (#{a.id})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">Metric</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
          >
            {Object.entries(METRIC_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            Comparison
          </label>
          <select
            value={comparison}
            onChange={(e) => setComparison(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="0">Above or equal</option>
            <option value="1">Below or equal</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">Threshold</label>
          <input
            type="number"
            placeholder={thresholdPlaceholders[Number(metric)]}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            Deadline (days from now)
          </label>
          <input
            type="number"
            min="1"
            placeholder="7"
            value={deadlineDays}
            onChange={(e) => setDeadlineDays(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={!account || !agentId || !threshold || isPending}
        className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!account
          ? "Connect Wallet"
          : isPending
            ? "Creating..."
            : "Create Market"}
      </button>
    </div>
  );
}

export default function MarketsPage() {
  const { markets, loading: marketsLoading, error: marketsError } = useMarkets();
  const { agents, loading: agentsLoading } = useAgents();
  const [showCreate, setShowCreate] = useState(false);

  const loading = marketsLoading || agentsLoading;

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Prediction Markets
          </h1>
          <p className="mt-3 text-lg text-zinc-400">
            Bet on AI agent performance with CRE-verified resolution.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50"
            />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (marketsError) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Prediction Markets
          </h1>
          <p className="mt-3 text-lg text-zinc-400">
            Bet on AI agent performance with CRE-verified resolution.
          </p>
        </div>
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
          <p className="text-red-400">Failed to load markets</p>
          <p className="mt-1 text-sm text-zinc-500">{marketsError}</p>
        </div>
      </div>
    );
  }

  const openMarkets = markets.filter((m) => m.status === 0);
  const totalVolume = markets.reduce(
    (sum, m) => sum + m.totalYes + m.totalNo,
    0n
  );

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Prediction Markets
        </h1>
        <p className="mt-3 text-lg text-zinc-400">
          Bet on AI agent performance with CRE-verified resolution.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-xs text-zinc-500">Total Markets</p>
          <p className="mt-1 text-2xl font-bold">{markets.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-xs text-zinc-500">Total Volume</p>
          <p className="mt-1 text-2xl font-bold">
            {formatEth(totalVolume)} ETH
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-xs text-zinc-500">Open Markets</p>
          <p className="mt-1 text-2xl font-bold">{openMarkets.length}</p>
        </div>
      </div>

      {/* Create button */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-4 text-sm text-zinc-400 transition-colors hover:border-emerald-500 hover:text-emerald-400"
        >
          + Create Prediction Market
        </button>
      ) : (
        <CreateMarketForm
          agents={agents}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Market Cards */}
      {markets.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-12 text-center text-zinc-500">
          No prediction markets created yet. Be the first!
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} agents={agents} />
          ))}
        </div>
      )}
    </div>
  );
}
