"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { ConnectButton } from "thirdweb/react";
import { readContract } from "thirdweb";
import { client } from "@/lib/thirdweb";
import { agentRegistryContract } from "@/lib/contracts";
import { prepareRegisterAgent, prepareCreateCurve } from "@/lib/hooks";

const STRATEGY_TYPES = [
  "DeFi Yield",
  "DEX Trading",
  "Stablecoin Farming",
  "Delta Neutral",
  "Liquidity Provision",
  "Cross-Chain Arb",
];

export default function CreateAgentPage() {
  const account = useActiveAccount();
  const { mutate: sendTransaction, isPending } = useSendTransaction();

  const [step, setStep] = useState<"register" | "curve" | "done">("register");
  const [agentId, setAgentId] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [strategyType, setStrategyType] = useState(STRATEGY_TYPES[0]);
  const [description, setDescription] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");

  // Auto-fill wallet when account connects
  useEffect(() => {
    if (account && !wallet) {
      setWallet(account.address);
    }
  }, [account, wallet]);

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-32">
        <h1 className="text-2xl font-bold">Connect Wallet to Create Agent</h1>
        <p className="text-zinc-400">
          Register your AI agent on-chain and deploy a bonding curve token
        </p>
        <ConnectButton client={client} />
      </div>
    );
  }

  const isValidAddress = (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr);

  const handleRegister = async () => {
    if (!name || !wallet || !description) return;
    if (!isValidAddress(wallet)) {
      setError("Invalid Ethereum address. Must be 0x followed by 40 hex characters.");
      return;
    }
    setError(null);

    // Read totalAgents BEFORE registering so we can derive the new ID
    // (avoids stale reads after tx — new ID = previousTotal + 1)
    let previousTotal: bigint;
    try {
      previousTotal = BigInt(
        await readContract({
          contract: agentRegistryContract,
          method: "function totalAgents() view returns (uint256)",
          params: [],
        })
      );
    } catch {
      setError("Failed to read current agent count");
      return;
    }

    const tx = prepareRegisterAgent(wallet, name, strategyType, description);
    sendTransaction(tx, {
      onSuccess: () => {
        setAgentId(previousTotal + 1n);
        setStep("curve");
      },
      onError: (err) => {
        console.error("Register failed:", err);
        setError(err.message || "Registration transaction failed");
      },
    });
  };

  const handleCreateCurve = () => {
    if (!agentId || !tokenName || !tokenSymbol) return;
    setError(null);

    const tx = prepareCreateCurve(agentId, tokenName, tokenSymbol);
    sendTransaction(tx, {
      onSuccess: () => {
        setStep("done");
      },
      onError: (err) => {
        console.error("Create curve failed:", err);
        setError(err.message || "Bonding curve creation failed");
      },
    });
  };

  if (step === "done" && agentId) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-32">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <span className="text-3xl text-emerald-400">&#x2713;</span>
        </div>
        <h1 className="text-2xl font-bold">Agent Created Successfully!</h1>
        <p className="text-zinc-400">
          Agent #{agentId.toString()} &mdash; {name} ({tokenSymbol}) is now live on-chain
        </p>
        <div className="flex gap-4">
          <Link
            href={`/agent/${agentId.toString()}`}
            className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            View Agent
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Leaderboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-white"
        >
          &larr; Back to leaderboard
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Create Agent</h1>
        <p className="mt-2 text-zinc-400">
          Register your AI agent on-chain and deploy its bonding curve token
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
            step === "register"
              ? "bg-emerald-600 text-white"
              : "bg-emerald-500/20 text-emerald-400"
          }`}
        >
          {step === "register" ? "1" : "\u2713"}
        </div>
        <div className="h-px flex-1 bg-zinc-700" />
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
            step === "curve"
              ? "bg-emerald-600 text-white"
              : "bg-zinc-800 text-zinc-500"
          }`}
        >
          2
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {step === "register" && (
        <div className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold">Step 1: Register Agent</h2>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Agent Name *
            </label>
            <input
              type="text"
              placeholder="e.g. AlphaYield Bot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Agent Wallet Address *
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-mono text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-600">
              Defaults to your connected wallet. Must be unique per agent.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Strategy Type *
            </label>
            <select
              value={strategyType}
              onChange={(e) => setStrategyType(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
            >
              {STRATEGY_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Description *
            </label>
            <textarea
              placeholder="Describe what your agent does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            onClick={handleRegister}
            disabled={!name || !wallet || !description || isPending}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Confirming Transaction..." : "Register Agent"}
          </button>
        </div>
      )}

      {step === "curve" && (
        <div className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 p-4">
            <p className="text-sm text-emerald-400">
              Agent #{agentId?.toString()} registered successfully!
            </p>
          </div>

          <h2 className="text-lg font-semibold">
            Step 2: Deploy Bonding Curve
          </h2>
          <p className="text-sm text-zinc-400">
            Create an ERC-20 token with a linear bonding curve for your agent.
            Anyone can buy/sell tokens — price increases with demand.
          </p>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Token Name *
            </label>
            <input
              type="text"
              placeholder="e.g. AlphaYield Shares"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Token Symbol *
            </label>
            <input
              type="text"
              placeholder="e.g. AYS"
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
              maxLength={5}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-mono text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            onClick={handleCreateCurve}
            disabled={!tokenName || !tokenSymbol || isPending}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Deploying Curve..." : "Create Bonding Curve"}
          </button>
        </div>
      )}
    </div>
  );
}
