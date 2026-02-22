"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { ConnectButton } from "thirdweb/react";
import { readContract } from "thirdweb";
import { client } from "@/lib/thirdweb";
import { agentRegistryContract } from "@/lib/contracts";
import toast from "react-hot-toast";
import { prepareRegisterAgent, prepareCreateCurve } from "@/lib/hooks";

const STRATEGY_TYPES = [
  { value: "Momentum", label: "Momentum Trading" },
  { value: "Mean Reversion", label: "Mean Reversion" },
  { value: "Arbitrage", label: "Arbitrage" },
  { value: "DeFi Yield", label: "DeFi Yield Farming" },
  { value: "Delta Neutral", label: "Delta Neutral" },
  { value: "Custom", label: "Custom Strategy" },
];

const SKILLS = [
  { id: "prices", label: "Price Feeds", description: "Read Pyth oracle prices", defaultOn: true },
  { id: "swap", label: "Token Swaps", description: "Swap via SushiSwap / Enso", defaultOn: true },
  { id: "lend", label: "Lending", description: "Compound / Moonwell (experimental)" },
  { id: "bridge", label: "Bridging", description: "Cross-chain via Across (experimental)" },
];

const LLM_PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT-4o)" },
  { value: "google", label: "Google (Gemini)" },
];

const DEFAULT_PROMPT =
  "You are a momentum DeFi trader. Use Pyth price feeds to monitor ETH/USDC. When ETH price increases more than 1% in the last 5 minutes, buy $10 USDC worth of ETH. When it drops 2%, sell back to USDC. Never hold more than 50% of your portfolio in a single asset.";

type Step = "identity" | "ai-config" | "economics" | "deploying" | "done";

export default function CreateAgentPage() {
  const router = useRouter();
  const account = useActiveAccount();
  const { mutate: sendTransaction, isPending } = useSendTransaction();

  const [step, setStep] = useState<Step>("identity");
  const [agentId, setAgentId] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Identity
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [strategyType, setStrategyType] = useState("Momentum");
  const [description, setDescription] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(["swap", "prices"]);

  // Step 2: AI Config
  const [llmProvider, setLlmProvider] = useState("anthropic");
  const [llmKey, setLlmKey] = useState("");
  const [strategyPrompt, setStrategyPrompt] = useState(DEFAULT_PROMPT);
  const [selectedSkills, setSelectedSkills] = useState<string[]>(["prices", "swap"]);

  // Step 3: Economics
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");

  // Deploy result
  const [agentWallet, setAgentWallet] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<string>("");

  useEffect(() => {
    if (account && !wallet) {
      setWallet(account.address);
    }
  }, [account, wallet]);

  // Auto-redirect to agent page after successful creation
  useEffect(() => {
    if (step === "done" && agentId) {
      const timer = setTimeout(() => {
        router.push(`/agent/${agentId.toString()}`);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [step, agentId, router]);

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-32">
        <h1 className="text-2xl font-bold">Connect Wallet to Create Agent</h1>
        <p className="text-zinc-400">
          Register your AI agent on-chain, configure its AI brain, and deploy a bonding curve token
        </p>
        <ConnectButton client={client} />
      </div>
    );
  }

  const isValidAddress = (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr);

  const handleCapabilityToggle = (id: string) => {
    setSelectedCapabilities((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const handleSkillToggle = (id: string) => {
    setSelectedSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const handleRegister = async () => {
    if (!name || !wallet || !description) return;
    if (!isValidAddress(wallet)) {
      setError("Invalid Ethereum address.");
      return;
    }
    setError(null);

    const tx = prepareRegisterAgent(wallet, name, strategyType, description, selectedCapabilities);
    toast.loading("Registering agent on-chain...", { id: "register" });
    sendTransaction(tx, {
      onSuccess: async () => {
        toast.success("Agent registered!", { id: "register" });
        // Read totalAgents after the tx confirms to get the new agent ID
        try {
          const total = await readContract({
            contract: agentRegistryContract,
            method: "function totalAgents() view returns (uint256)",
            params: [],
          });
          setAgentId(BigInt(total));
        } catch {
          setError("Failed to read agent ID after registration");
          return;
        }
        setStep("ai-config");
      },
      onError: (err) => {
        console.error("Register failed:", err);
        const msg = err.message || "Registration transaction failed";
        setError(msg);
        toast.error(`Registration failed: ${msg.slice(0, 80)}`, { id: "register" });
      },
    });
  };

  const handleCreateCurve = () => {
    if (!agentId || !tokenName || !tokenSymbol) return;
    setError(null);

    const tx = prepareCreateCurve(agentId, tokenName, tokenSymbol);
    toast.loading("Deploying bonding curve...", { id: "curve" });
    sendTransaction(tx, {
      onSuccess: async () => {
        toast.success("Bonding curve deployed!", { id: "curve" });
        // Deploy the AI agent after curve is created
        setStep("deploying");
        setDeployStatus("Starting AI agent...");

        try {
          const res = await fetch("/api/agent/deploy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: Number(agentId),
              llmProvider,
              llmKey,
              strategyPrompt,
              skills: selectedSkills,
            }),
          });
          const data = await res.json();

          if (data.success) {
            setAgentWallet(data.agentWallet);
            setDeployStatus("Agent deployed and running!");
            setStep("done");
          } else {
            setDeployStatus(`Deploy failed: ${data.error}`);
            setStep("done");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          setDeployStatus(`Deploy error: ${msg}`);
          setStep("done");
        }
      },
      onError: (err) => {
        console.error("Create curve failed:", err);
        const msg = err.message || "Bonding curve creation failed";
        setError(msg);
        toast.error(`Curve creation failed: ${msg.slice(0, 80)}`, { id: "curve" });
      },
    });
  };

  const stepNumber = step === "identity" ? 1 : step === "ai-config" ? 2 : step === "economics" ? 3 : 3;

  // --- DONE screen ---
  if ((step === "done" || step === "deploying") && agentId) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-32">
        {step === "deploying" ? (
          <>
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <h1 className="text-2xl font-bold">Deploying Agent...</h1>
            <p className="text-zinc-400">{deployStatus}</p>
          </>
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <span className="text-3xl text-emerald-400">&#x2713;</span>
            </div>
            <h1 className="text-2xl font-bold">Agent Created Successfully!</h1>
            <p className="text-zinc-400">
              Agent #{agentId.toString()} &mdash; {name} ({tokenSymbol}) is now live
            </p>
            {agentWallet && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
                <p className="text-xs text-zinc-500">Agent Trading Wallet</p>
                <p className="mt-1 font-mono text-sm text-emerald-400">{agentWallet}</p>
              </div>
            )}
            {deployStatus && !agentWallet && (
              <p className="text-sm text-yellow-400">{deployStatus}</p>
            )}
            <div className="flex gap-4">
              <button
                onClick={() => router.push(`/agent/${agentId.toString()}`)}
                className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                View Agent
              </button>
              <Link
                href="/"
                className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Leaderboard
              </Link>
            </div>
            <p className="text-xs text-zinc-600">
              Redirecting to agent page in 5 seconds...
            </p>
          </>
        )}
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
          Register on-chain, configure AI brain, deploy bonding curve
        </p>
      </div>

      {/* Progress indicator — 3 steps */}
      <div className="flex items-center gap-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex flex-1 items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                n < stepNumber
                  ? "bg-emerald-500/20 text-emerald-400"
                  : n === stepNumber
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {n < stepNumber ? "\u2713" : n}
            </div>
            {n < 3 && <div className="h-px flex-1 bg-zinc-700" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Step 1: Agent Identity */}
      {step === "identity" && (
        <div className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold">Step 1: Agent Identity (ERC-8004)</h2>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Agent Name *</label>
            <input
              type="text"
              placeholder="e.g. Momentum Bot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Agent Wallet Address *</label>
            <input
              type="text"
              placeholder="0x..."
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-mono text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-600">
              A trading wallet will be auto-generated when you deploy.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Strategy Type *</label>
            <select
              value={strategyType}
              onChange={(e) => setStrategyType(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
            >
              {STRATEGY_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Description *</label>
            <textarea
              placeholder="Describe what your agent does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-3 block text-sm text-zinc-400">Capabilities</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "swap", label: "Token Swaps" },
                { id: "lend", label: "Lending" },
                { id: "transfer", label: "Transfers" },
                { id: "stake", label: "Staking" },
              ].map((cap) => (
                <button
                  key={cap.id}
                  onClick={() => handleCapabilityToggle(cap.id)}
                  className={`rounded-lg border p-3 text-left text-sm font-medium transition-colors ${
                    selectedCapabilities.includes(cap.id)
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-zinc-700 bg-zinc-800 text-white hover:border-zinc-600"
                  }`}
                >
                  {cap.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleRegister}
            disabled={!name || !wallet || !description || isPending}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Confirming Transaction..." : "Register Agent On-Chain"}
          </button>
        </div>
      )}

      {/* Step 2: AI Configuration */}
      {step === "ai-config" && (
        <div className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 p-4">
            <p className="text-sm text-emerald-400">
              Agent #{agentId?.toString()} registered on-chain!
            </p>
          </div>

          <h2 className="text-lg font-semibold">Step 2: AI Configuration</h2>
          <p className="text-sm text-zinc-400">
            Configure the LLM brain that powers your agent&apos;s trading decisions.
          </p>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">LLM Provider *</label>
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
            <label className="mb-1 block text-sm text-zinc-400">API Key *</label>
            <input
              type="password"
              placeholder="sk-..."
              value={llmKey}
              onChange={(e) => setLlmKey(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 font-mono text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-600">
              Your key is sent directly to the agent runner. Never stored on-chain or in a database.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Strategy Prompt *</label>
            <textarea
              placeholder="Describe the trading strategy..."
              value={strategyPrompt}
              onChange={(e) => setStrategyPrompt(e.target.value.slice(0, 500))}
              rows={5}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-600">
              {strategyPrompt.length}/500 characters
            </p>
          </div>

          <div>
            <label className="mb-3 block text-sm text-zinc-400">Agent Skills</label>
            <div className="grid grid-cols-2 gap-3">
              {SKILLS.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => handleSkillToggle(skill.id)}
                  className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                    selectedSkills.includes(skill.id)
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${
                      selectedSkills.includes(skill.id) ? "text-emerald-400" : "text-white"
                    }`}
                  >
                    {skill.label}
                  </span>
                  <span className="mt-1 text-xs text-zinc-500">{skill.description}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              if (!llmKey) {
                setError("API key is required");
                return;
              }
              setError(null);
              setStep("economics");
            }}
            disabled={!llmKey || !strategyPrompt}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue to Token Setup
          </button>
        </div>
      )}

      {/* Step 3: Economics (Bonding Curve) */}
      {step === "economics" && (
        <div className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 p-4">
            <p className="text-sm text-emerald-400">
              AI configured: {LLM_PROVIDERS.find((p) => p.value === llmProvider)?.label}
            </p>
          </div>

          <h2 className="text-lg font-semibold">Step 3: Deploy Bonding Curve</h2>
          <p className="text-sm text-zinc-400">
            Create an ERC-20 token with a linear bonding curve. Price increases with
            demand, and CRE adjusts the slope based on verified performance.
          </p>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Token Name *</label>
            <input
              type="text"
              placeholder="e.g. Momentum Bot Shares"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Token Symbol *</label>
            <input
              type="text"
              placeholder="e.g. MBS"
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
            {isPending ? "Deploying..." : "Create Token & Deploy Agent"}
          </button>

          <button
            onClick={() => setStep("ai-config")}
            className="w-full rounded-lg border border-zinc-700 px-4 py-3 text-sm text-zinc-400 transition-colors hover:bg-zinc-800"
          >
            &larr; Back to AI Config
          </button>
        </div>
      )}
    </div>
  );
}
