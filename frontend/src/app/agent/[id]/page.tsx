import Link from "next/link";
import { MOCK_AGENTS } from "@/lib/mock-data";
import { formatBps, formatUsd, shortenAddress } from "@/lib/utils";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = MOCK_AGENTS.find((item) => item.id === Number(id));

  if (!agent) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-semibold">Agent not found</h1>
        <Link href="/" className="mt-4 inline-block text-blue-400 hover:underline">
          Back to leaderboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link href="/" className="text-sm text-zinc-400 hover:text-white">
        <- Back to leaderboard
      </Link>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h1 className="text-3xl font-bold">{agent.name}</h1>
        <p className="mt-2 text-zinc-400">{agent.description}</p>
        <p className="mt-3 text-sm text-zinc-500">Operator {shortenAddress(agent.wallet)}</p>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500">ROI</p>
          <p className="text-xl font-semibold">{formatBps(agent.metrics.roiBps)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500">Win Rate</p>
          <p className="text-xl font-semibold">{formatBps(agent.metrics.winRateBps)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500">TVL Managed</p>
          <p className="text-xl font-semibold">{formatUsd(agent.metrics.tvlManaged / 1e6)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs text-zinc-500">Trades</p>
          <p className="text-xl font-semibold">{agent.metrics.totalTrades}</p>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-lg font-semibold">Trade Panel (Mock)</h2>
        <p className="mt-1 text-sm text-zinc-500">Live buy and sell actions will be enabled after contract integration.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <button className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white">Buy Token</button>
          <button className="rounded-lg bg-zinc-700 px-4 py-2 font-medium text-white">Sell Token</button>
        </div>
      </section>
    </div>
  );
}
