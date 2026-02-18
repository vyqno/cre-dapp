"use client";

import Link from "next/link";
import { useActiveAccount } from "thirdweb/react";
import { useAgents, useTokenBalance } from "@/lib/hooks";
import { formatBps, formatUsd } from "@/lib/utils";
import { ConnectButton } from "thirdweb/react";
import { client } from "@/lib/thirdweb";
import type { AgentWithMetrics } from "@/lib/hooks";

function HoldingRow({
  agent,
  userAddress,
}: {
  agent: AgentWithMetrics;
  userAddress: string;
}) {
  const { balance, loading } = useTokenBalance(agent.curveAddress, userAddress);
  const tokenBalance = Number(balance) / 1e18;
  const tokenPrice = Number(agent.tokenPrice) / 1e18;
  const value = tokenBalance * tokenPrice;

  if (loading) {
    return (
      <div className="grid grid-cols-8 items-center gap-4 border-b border-zinc-800/30 px-6 py-4">
        <div className="col-span-8 h-6 animate-pulse rounded bg-zinc-800/50" />
      </div>
    );
  }

  // Don't show agents where user has no balance
  if (tokenBalance <= 0) return null;

  return (
    <Link
      href={`/agent/${agent.id}`}
      className="grid grid-cols-8 items-center gap-4 border-b border-zinc-800/30 px-6 py-4 transition-colors hover:bg-zinc-800/30"
    >
      <div className="col-span-2">
        <p className="font-medium">{agent.name}</p>
        <span className="text-xs text-zinc-500">{agent.strategyType}</span>
      </div>
      <div className="col-span-1 text-right text-sm">
        {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      <div className="col-span-1 text-right text-sm">
        {tokenPrice.toFixed(5)} ETH
      </div>
      <div className="col-span-1 text-right text-sm font-medium">
        {value.toFixed(4)} ETH
      </div>
      <div className="col-span-1 text-right text-sm">
        {formatUsd(agent.metrics.tvlManaged / 1e6)}
      </div>
      <div className="col-span-1 text-right text-sm">
        {agent.metrics.totalTrades.toLocaleString()}
      </div>
      <div className="col-span-1 text-right">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
            agent.metrics.roiBps >= 0
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {formatBps(agent.metrics.roiBps)}
        </span>
      </div>
    </Link>
  );
}

export default function PortfolioPage() {
  const account = useActiveAccount();
  const { agents, loading: agentsLoading } = useAgents();

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-32">
        <h1 className="text-2xl font-bold">Connect Wallet to View Portfolio</h1>
        <p className="text-zinc-400">
          Track your agent token holdings, PnL, and performance
        </p>
        <ConnectButton client={client} />
      </div>
    );
  }

  if (agentsLoading) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Portfolio</h1>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Portfolio</h1>
        <p className="text-sm text-zinc-500">
          Wallet: {account.address.slice(0, 6)}...{account.address.slice(-4)}
        </p>
      </div>

      {/* Holdings table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold">Holdings</h2>
          <p className="text-sm text-zinc-500">
            Your token balances across all agent bonding curves
          </p>
        </div>

        <div className="hidden grid-cols-8 gap-4 border-b border-zinc-800/50 px-6 py-3 text-xs font-medium uppercase tracking-wider text-zinc-500 md:grid">
          <div className="col-span-2">Agent</div>
          <div className="col-span-1 text-right">Balance</div>
          <div className="col-span-1 text-right">Price</div>
          <div className="col-span-1 text-right">Value</div>
          <div className="col-span-1 text-right">TVL</div>
          <div className="col-span-1 text-right">Trades</div>
          <div className="col-span-1 text-right">Agent ROI</div>
        </div>

        {agents.map((agent) => (
          <HoldingRow
            key={agent.id}
            agent={agent}
            userAddress={account.address}
          />
        ))}

        {agents.length === 0 && (
          <div className="px-6 py-12 text-center text-zinc-500">
            No agents found on-chain
          </div>
        )}
      </div>

      <p className="text-center text-xs text-zinc-600">
        Balances are read directly from on-chain bonding curve contracts
      </p>
    </div>
  );
}
