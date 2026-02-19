"use client";

import Link from "next/link";
import { useAgents, type AgentWithMetrics } from "@/lib/hooks";
import { formatBps, formatUsd, formatEth, shortenAddress } from "@/lib/utils";

function RoiBadge({ roiBps }: { roiBps: number }) {
  const isPositive = roiBps >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isPositive
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      {isPositive ? "+" : ""}
      {formatBps(roiBps)}
    </span>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          AI Agent Performance Analytics
        </h1>
        <p className="mt-3 text-lg text-zinc-400">
          CRE-verified on-chain metrics. Performance-driven bonding curves.
          Invest in what works.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50"
          />
        ))}
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-zinc-800/50"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { agents, loading, error } = useAgents();

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            AI Agent Performance Analytics
          </h1>
          <p className="mt-3 text-lg text-zinc-400">
            CRE-verified on-chain metrics. Performance-driven bonding curves.
          </p>
        </div>
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
          <p className="text-red-400">Failed to load on-chain data</p>
          <p className="mt-1 text-sm text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }

  const sortedAgents = [...agents].sort(
    (a, b) => b.metrics.roiBps - a.metrics.roiBps
  );

  const totalTvl = agents.reduce(
    (sum, a) => sum + a.metrics.tvlManaged / 1e6,
    0
  );
  const avgRoi =
    agents.length > 0
      ? agents.reduce((sum, a) => sum + a.metrics.roiBps, 0) / agents.length
      : 0;
  const totalTrades = agents.reduce(
    (sum, a) => sum + a.metrics.totalTrades,
    0
  );
  const totalReserve = agents.reduce(
    (sum, a) => sum + a.reserveBalance,
    0n
  );

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          AI Agent Performance Analytics
        </h1>
        <p className="mt-3 text-lg text-zinc-400">
          CRE-verified on-chain metrics. Performance-driven bonding curves.
          Invest in what works.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active Agents" value={agents.length} />
        <StatCard label="Total TVL Managed" value={formatUsd(totalTvl)} />
        <StatCard label="Avg ROI" value={formatBps(Math.round(avgRoi))} />
        <StatCard label="Total Trades" value={totalTrades.toLocaleString()} />
      </div>

      {/* On-chain data badge */}
      <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-900/30 bg-emerald-950/10 px-4 py-2 text-xs text-emerald-400">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        Live on-chain data from Tenderly Sepolia &middot; {formatEth(totalReserve)} ETH total reserve
      </div>

      {/* Leaderboard */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold">Agent Leaderboard</h2>
          <p className="text-sm text-zinc-500">
            Ranked by CRE-verified ROI performance
          </p>
        </div>

        {/* Table Header */}
        <div className="hidden grid-cols-12 gap-4 border-b border-zinc-800/50 px-6 py-3 text-xs font-medium uppercase tracking-wider text-zinc-500 md:grid">
          <div className="col-span-1">#</div>
          <div className="col-span-3">Agent</div>
          <div className="col-span-2">Strategy</div>
          <div className="col-span-1 text-right">ROI</div>
          <div className="col-span-1 text-right">Win Rate</div>
          <div className="col-span-1 text-right">Sharpe</div>
          <div className="col-span-1 text-right">TVL</div>
          <div className="col-span-2 text-right">Token Price</div>
        </div>

        {/* Rows */}
        {sortedAgents.map((agent, index) => (
          <Link
            key={agent.id}
            href={`/agent/${agent.id}`}
            className="grid grid-cols-12 items-center gap-4 border-b border-zinc-800/30 px-6 py-4 transition-colors hover:bg-zinc-800/30"
          >
            <div className="col-span-1 text-sm font-semibold text-zinc-500">
              {index + 1}
            </div>
            <div className="col-span-3">
              <p className="font-medium">{agent.name}</p>
              <p className="text-xs text-zinc-500">
                {shortenAddress(agent.wallet)}
              </p>
            </div>
            <div className="col-span-2">
              <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                {agent.strategyType}
              </span>
            </div>
            <div className="col-span-1 text-right">
              <RoiBadge roiBps={agent.metrics.roiBps} />
            </div>
            <div className="col-span-1 text-right text-sm">
              {formatBps(agent.metrics.winRateBps)}
            </div>
            <div className="col-span-1 text-right text-sm">
              {(agent.metrics.sharpeRatioScaled / 10000).toFixed(2)}
            </div>
            <div className="col-span-1 text-right text-sm">
              {formatUsd(agent.metrics.tvlManaged / 1e6)}
            </div>
            <div className="col-span-2 text-right">
              <p className="text-sm font-medium">
                {(Number(agent.tokenPrice) / 1e18).toFixed(5)} ETH
              </p>
              <p className="text-xs text-zinc-500">
                {(Number(agent.totalSupply) / 1e18).toLocaleString()} supply
              </p>
            </div>
          </Link>
        ))}

        {agents.length === 0 && (
          <div className="px-6 py-12 text-center text-zinc-500">
            No agents registered yet
          </div>
        )}
      </div>

      {/* Footer badge */}
      <div className="flex items-center justify-center gap-2 text-xs text-zinc-600">
        <span>Powered by</span>
        <span className="font-semibold text-zinc-400">Chainlink CRE</span>
        <span>|</span>
        <span className="font-semibold text-zinc-400">thirdweb</span>
        <span>|</span>
        <span className="font-semibold text-zinc-400">Tenderly</span>
      </div>
    </div>
  );
}
