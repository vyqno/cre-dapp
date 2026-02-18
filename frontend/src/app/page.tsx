import Link from "next/link";
import { MOCK_AGENTS } from "@/lib/mock-data";
import { formatBps, formatUsd, shortenAddress } from "@/lib/utils";

export default function HomePage() {
  const top = [...MOCK_AGENTS].sort((a, b) => b.metrics.roiBps - a.metrics.roiBps);
  const totalTvl = top.reduce((sum, a) => sum + a.metrics.tvlManaged / 1e6, 0);

  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Agent Leaderboard</h1>
        <p className="mt-2 text-zinc-400">Mock analytics until on-chain hooks are wired.</p>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500">Active Agents</p>
          <p className="text-2xl font-semibold">{top.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500">Combined TVL</p>
          <p className="text-2xl font-semibold">{formatUsd(totalTvl)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500">Top ROI</p>
          <p className="text-2xl font-semibold">{formatBps(top[0]?.metrics.roiBps ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500">Total Trades</p>
          <p className="text-2xl font-semibold">{top.reduce((sum, a) => sum + a.metrics.totalTrades, 0)}</p>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="grid grid-cols-12 border-b border-zinc-800 px-4 py-3 text-xs text-zinc-500">
          <p className="col-span-4">Agent</p>
          <p className="col-span-2 text-right">ROI</p>
          <p className="col-span-2 text-right">Win Rate</p>
          <p className="col-span-2 text-right">TVL</p>
          <p className="col-span-2 text-right">Wallet</p>
        </div>
        {top.map((agent) => (
          <Link key={agent.id} href={`/agent/${agent.id}`} className="grid grid-cols-12 px-4 py-3 text-sm hover:bg-zinc-800/40">
            <p className="col-span-4 font-medium">{agent.name}</p>
            <p className="col-span-2 text-right">{formatBps(agent.metrics.roiBps)}</p>
            <p className="col-span-2 text-right">{formatBps(agent.metrics.winRateBps)}</p>
            <p className="col-span-2 text-right">{formatUsd(agent.metrics.tvlManaged / 1e6)}</p>
            <p className="col-span-2 text-right text-zinc-400">{shortenAddress(agent.wallet)}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
