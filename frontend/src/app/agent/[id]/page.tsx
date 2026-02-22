"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  useAgent,
  useTokenBalance,
  useBuyPrice,
  useSellRefund,
  prepareBuyTransaction,
  prepareSellTransaction,
} from "@/lib/hooks";
import { formatBps, formatUsd, shortenAddress } from "@/lib/utils";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import toast from "react-hot-toast";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface AgentStatus {
  status: "running" | "not_running" | "error";
  cycleCount?: number;
  uptimeMs?: number;
  lastError?: string;
}

function useAgentStatus(agentId: number) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);

  const refresh = useCallback(() => {
    fetch(`/api/agent/status/${agentId}`)
      .then((r) => r.json())
      .then((data) => setAgentStatus(data))
      .catch(() => setAgentStatus({ status: "not_running" }));
  }, [agentId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { agentStatus, refresh };
}

function formatUptime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const LLM_PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT-4o)" },
  { value: "google", label: "Google (Gemini)" },
];

function StartAgentModal({
  agentId,
  onClose,
  onStarted,
}: {
  agentId: number;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [llmProvider, setLlmProvider] = useState("anthropic");
  const [llmKey, setLlmKey] = useState("");
  const [strategyPrompt, setStrategyPrompt] = useState(
    "You are an autonomous DeFi trading agent. Monitor prices and execute profitable trades."
  );
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    if (!llmKey) {
      setError("API key is required");
      return;
    }
    setDeploying(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          llmProvider,
          llmKey,
          strategyPrompt,
          skills: ["prices", "swap"],
        }),
      });
      const data = await res.json();
      if (data.success) {
        onStarted();
        onClose();
      } else {
        setError(data.error || "Deploy failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Start Agent</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            &times;
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">LLM Provider</label>
            <select
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-500">API Key</label>
            <input
              type="password"
              placeholder="sk-..."
              value={llmKey}
              onChange={(e) => setLlmKey(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-mono text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-500">Strategy Prompt</label>
            <textarea
              value={strategyPrompt}
              onChange={(e) => setStrategyPrompt(e.target.value.slice(0, 500))}
              rows={4}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-600">{strategyPrompt.length}/500</p>
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={!llmKey || deploying}
          className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deploying ? "Starting Agent..." : "Start Agent"}
        </button>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "green" | "red" | "blue" | "yellow";
}) {
  const colorMap = {
    green: "text-emerald-400",
    red: "text-red-400",
    blue: "text-blue-400",
    yellow: "text-yellow-400",
  };
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-xl font-bold ${color ? colorMap[color] : "text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const agentId = Number(id);

  // Bug #1: Guard against non-numeric route params
  if (isNaN(agentId) || agentId <= 0 || !Number.isInteger(agentId)) {
    notFound();
  }

  const { agent, loading, error } = useAgent(agentId);
  const account = useActiveAccount();
  const { balance } = useTokenBalance(agent?.curveAddress, account?.address);
  const { mutate: sendTransaction, isPending: txPending } =
    useSendTransaction();

  const [buyAmount, setBuyAmount] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [txError, setTxError] = useState<string | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);

  const estimatedTokens = useBuyPrice(agent?.curveAddress, buyAmount);
  const sellRefund = useSellRefund(agent?.curveAddress, sellAmount);
  const { agentStatus, refresh: refreshStatus } = useAgentStatus(agentId);
  const [stopping, setStopping] = useState(false);

  const handleStopAgent = async () => {
    setStopping(true);
    try {
      await fetch(`/api/agent/stop/${agentId}`, { method: "POST" });
      refreshStatus();
    } catch {
      // ignore
    } finally {
      setStopping(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-white"
        >
          &larr; Back to leaderboard
        </Link>
        <div className="h-12 w-64 animate-pulse rounded-lg bg-zinc-800" />
        <div className="h-6 w-96 animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold">
          {error ? "Error loading agent" : "Agent not found"}
        </h1>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <Link
          href="/"
          className="mt-4 inline-block text-blue-400 hover:underline"
        >
          Back to leaderboard
        </Link>
      </div>
    );
  }

  const roiPositive = agent.metrics.roiBps >= 0;
  const tokenPrice = Number(agent.tokenPrice) / 1e18;
  const supply = Number(agent.totalSupply) / 1e18;
  const reserve = Number(agent.reserveBalance) / 1e18;
  const userBalance = Number(balance) / 1e18;

  const hasCurve = agent.curveAddress && agent.curveAddress !== ZERO_ADDRESS;

  const handleBuy = () => {
    if (!buyAmount || Number(buyAmount) <= 0 || !hasCurve) return;
    setTxError(null);
    toast.loading("Submitting buy transaction...", { id: "buy-tx" });
    const tx = prepareBuyTransaction(agent.curveAddress, buyAmount);
    sendTransaction(tx, {
      onSuccess: () => {
        setBuyAmount("");
        toast.success("Buy confirmed!", { id: "buy-tx" });
      },
      onError: (err) => {
        console.error("Buy failed:", err);
        const msg = err.message || "Buy transaction failed";
        setTxError(msg);
        toast.error(`Buy failed: ${msg.slice(0, 80)}`, { id: "buy-tx" });
      },
    });
  };

  const handleSell = () => {
    if (!sellAmount || Number(sellAmount) <= 0 || !hasCurve) return;
    if (Number(sellAmount) > userBalance) {
      setTxError(`Insufficient balance. You have ${userBalance.toLocaleString()} tokens.`);
      return;
    }
    setTxError(null);
    toast.loading("Submitting sell transaction...", { id: "sell-tx" });
    const tx = prepareSellTransaction(agent.curveAddress, sellAmount);
    sendTransaction(tx, {
      onSuccess: () => {
        setSellAmount("");
        toast.success("Sell confirmed!", { id: "sell-tx" });
      },
      onError: (err) => {
        console.error("Sell failed:", err);
        const msg = err.message || "Sell transaction failed";
        setTxError(msg);
        toast.error(`Sell failed: ${msg.slice(0, 80)}`, { id: "sell-tx" });
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-white"
      >
        &larr; Back to leaderboard
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{agent.name}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                agent.isActive
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-zinc-700 text-zinc-400"
              }`}
            >
              {agent.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{agent.description}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
            <span>Wallet: {shortenAddress(agent.wallet)}</span>
            <span>|</span>
            <span className="rounded bg-zinc-800 px-2 py-0.5">
              {agent.strategyType}
            </span>
            <span>|</span>
            <span>Curve: {shortenAddress(agent.curveAddress)}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">
            {tokenPrice.toFixed(5)}{" "}
            <span className="text-lg text-zinc-400">ETH</span>
          </p>
          <p className="text-sm text-zinc-500">
            {supply.toLocaleString()} tokens in circulation
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <MetricCard
          label="ROI"
          value={`${roiPositive ? "+" : ""}${formatBps(agent.metrics.roiBps)}`}
          color={roiPositive ? "green" : "red"}
        />
        <MetricCard
          label="Win Rate"
          value={formatBps(agent.metrics.winRateBps)}
          color="blue"
        />
        <MetricCard
          label="Max Drawdown"
          value={formatBps(agent.metrics.maxDrawdownBps)}
          color="red"
        />
        <MetricCard
          label="Sharpe Ratio"
          value={(agent.metrics.sharpeRatioScaled / 10000).toFixed(2)}
          color="yellow"
        />
        <MetricCard
          label="TVL Managed"
          value={formatUsd(agent.metrics.tvlManaged / 1e6)}
        />
        <MetricCard
          label="Total Trades"
          value={agent.metrics.totalTrades.toLocaleString()}
        />
        <MetricCard
          label="Reserve Balance"
          value={`${reserve.toFixed(4)} ETH`}
        />
      </div>

      {/* Agent Status */}
      {agentStatus && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  agentStatus.status === "running"
                    ? "bg-emerald-400 animate-pulse"
                    : agentStatus.status === "error"
                      ? "bg-red-400"
                      : "bg-zinc-500"
                }`}
              />
              <div>
                <p className="text-sm font-semibold">
                  Agent Status:{" "}
                  <span
                    className={
                      agentStatus.status === "running"
                        ? "text-emerald-400"
                        : agentStatus.status === "error"
                          ? "text-red-400"
                          : "text-zinc-400"
                    }
                  >
                    {agentStatus.status === "running"
                      ? "Running"
                      : agentStatus.status === "error"
                        ? "Error"
                        : "Not Running"}
                  </span>
                </p>
                <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                  {agentStatus.cycleCount !== undefined && (
                    <span>Cycle #{agentStatus.cycleCount}</span>
                  )}
                  {agentStatus.uptimeMs !== undefined && agentStatus.uptimeMs > 0 && (
                    <span>Up {formatUptime(agentStatus.uptimeMs)}</span>
                  )}
                  {agentStatus.lastError && (
                    <span className="text-red-400">
                      Last error: {agentStatus.lastError}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {agentStatus.status === "running" ? (
                <button
                  onClick={handleStopAgent}
                  disabled={stopping}
                  className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/30 disabled:opacity-50"
                >
                  {stopping ? "Stopping..." : "Stop Agent"}
                </button>
              ) : (
                <button
                  onClick={() => setShowStartModal(true)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                >
                  Start Agent
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Curve state + Trade panel */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* On-chain Details */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">
            Bonding Curve State (On-Chain)
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-zinc-500">Current Price</p>
              <p className="mt-1 font-mono text-sm">
                {tokenPrice.toFixed(6)} ETH
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Total Supply</p>
              <p className="mt-1 font-mono text-sm">
                {supply.toFixed(2)} tokens
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Reserve</p>
              <p className="mt-1 font-mono text-sm">
                {reserve.toFixed(6)} ETH
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Slope</p>
              <p className="mt-1 font-mono text-sm">
                {(Number(agent.slope) / 1e18).toFixed(8)} ETH
              </p>
            </div>
          </div>

          {userBalance > 0 && (
            <div className="mt-6 rounded-lg border border-blue-900/30 bg-blue-950/10 p-4">
              <p className="text-xs text-blue-400">Your Holdings</p>
              <p className="mt-1 text-lg font-bold">
                {userBalance.toLocaleString()} tokens
              </p>
              <p className="text-xs text-zinc-500">
                Value: {(userBalance * tokenPrice).toFixed(6)} ETH
              </p>
            </div>
          )}
        </div>

        {/* Trade Panel */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">Trade</h2>

          {!hasCurve ? (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-6 text-center">
              <p className="text-sm text-zinc-400">No bonding curve deployed for this agent yet.</p>
              <p className="mt-1 text-xs text-zinc-600">The agent creator needs to deploy a bonding curve before trading is available.</p>
            </div>
          ) : (<>

          {txError && (
            <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
              {txError}
            </div>
          )}

          {/* Tabs */}
          <div className="mb-4 flex rounded-lg bg-zinc-800 p-1">
            <button
              onClick={() => setActiveTab("buy")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "buy"
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setActiveTab("sell")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "sell"
                  ? "bg-red-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Sell
            </button>
          </div>

          {activeTab === "buy" ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Amount (ETH)
                </label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.01"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="rounded-lg bg-zinc-800/50 p-3 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>Current Price</span>
                  <span>{tokenPrice.toFixed(6)} ETH</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Est. Tokens</span>
                  <span>
                    {estimatedTokens > 0n
                      ? (Number(estimatedTokens) / 1e18).toFixed(2)
                      : "0"}
                  </span>
                </div>
              </div>
              <button
                onClick={handleBuy}
                disabled={
                  !account || !buyAmount || Number(buyAmount) <= 0 || txPending
                }
                className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {!account
                  ? "Connect Wallet"
                  : txPending
                    ? "Confirming..."
                    : "Buy Tokens"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Amount (Tokens)
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="100"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none"
                />
                {userBalance > 0 && (
                  <button
                    onClick={() => setSellAmount(userBalance.toString())}
                    className="mt-1 text-xs text-blue-400 hover:underline"
                  >
                    Max: {userBalance.toLocaleString()}
                  </button>
                )}
              </div>
              <div className="rounded-lg bg-zinc-800/50 p-3 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>Current Price</span>
                  <span>{tokenPrice.toFixed(6)} ETH</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Est. Refund</span>
                  <span>
                    {sellRefund > 0n
                      ? `${(Number(sellRefund) / 1e18).toFixed(6)} ETH`
                      : "0 ETH"}
                  </span>
                </div>
              </div>
              <button
                onClick={handleSell}
                disabled={
                  !account ||
                  !sellAmount ||
                  Number(sellAmount) <= 0 ||
                  txPending
                }
                className="w-full rounded-lg bg-red-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {!account
                  ? "Connect Wallet"
                  : txPending
                    ? "Confirming..."
                    : "Sell Tokens"}
              </button>
            </div>
          )}

          <p className="mt-3 text-center text-xs text-zinc-600">
            Powered by bonding curve | CRE-adjusted slope
          </p>

          </>)}
        </div>
      </div>

      {/* CRE Verification Section */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
            <span className="text-lg text-blue-400">&#x2713;</span>
          </div>
          <div>
            <p className="font-semibold">CRE-Verified Metrics</p>
            <p className="text-sm text-zinc-400">
              All performance data is fetched, validated, and published on-chain
              by Chainlink CRE DON consensus.
            </p>
          </div>
        </div>

        {/* Verification status */}
        {agent.metrics.lastUpdated > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <p className="text-xs text-zinc-500">Last Verified</p>
                <p className="mt-0.5 font-medium text-zinc-200">
                  {new Date(agent.metrics.lastUpdated * 1000).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Data Freshness</p>
                {(() => {
                  const ageMin = Math.max(0, Math.round((Date.now() / 1000 - agent.metrics.lastUpdated) / 60));
                  const isStale = ageMin > 60;
                  return (
                    <p className={`mt-0.5 font-medium ${isStale ? "text-yellow-400" : "text-emerald-400"}`}>
                      {isStale
                        ? `Stale — last update ${ageMin >= 120 ? `${Math.round(ageMin / 60)}h` : `${ageMin}m`} ago`
                        : `Updated ${ageMin}m ago`}
                    </p>
                  );
                })()}
              </div>
            </div>

            {/* Verified metrics list */}
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-2">Verified by CRE DON</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
                {[
                  "ROI (bps)",
                  "Win Rate",
                  "Max Drawdown",
                  "Sharpe Ratio",
                  "TVL Managed",
                  "Total Trades",
                ].map((metric) => (
                  <div key={metric} className="flex items-center gap-1.5 text-zinc-300">
                    <span className="text-emerald-400 text-xs">&#x2713;</span>
                    {metric}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            No CRE verification data yet. Metrics will be verified once the Chainlink DON publishes its first update.
          </p>
        )}
      </div>

      {/* Start Agent Modal */}
      {showStartModal && (
        <StartAgentModal
          agentId={agentId}
          onClose={() => setShowStartModal(false)}
          onStarted={refreshStatus}
        />
      )}
    </div>
  );
}
