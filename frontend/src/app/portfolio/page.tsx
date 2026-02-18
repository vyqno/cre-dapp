import Link from "next/link";
import { MOCK_AGENTS } from "@/lib/mock-data";
import { formatUsd } from "@/lib/utils";

const mockConnected = false;

export default function PortfolioPage() {
  if (!mockConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-28 text-center">
        <h1 className="text-3xl font-bold">Portfolio</h1>
        <p className="max-w-lg text-zinc-400">Connect your wallet to unlock holdings and PnL across agent bonding curves.</p>
        <button className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">Connect Wallet</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Portfolio</h1>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
        {MOCK_AGENTS.slice(0, 3).map((agent) => (
          <Link key={agent.id} href={`/agent/${agent.id}`} className="grid grid-cols-4 border-b border-zinc-800/40 px-4 py-3 text-sm hover:bg-zinc-800/40">
            <p className="font-medium">{agent.name}</p>
            <p className="text-right">{(agent.totalSupply / 1e18 / 100).toFixed(2)} AGT</p>
            <p className="text-right">{(agent.tokenPrice / 1e18).toFixed(6)} ETH</p>
            <p className="text-right">{formatUsd(agent.metrics.tvlManaged / 1e6)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
