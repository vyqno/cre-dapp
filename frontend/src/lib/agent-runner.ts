import { AgentKit } from "@coinbase/agentkit";
import { ViemWalletProvider } from "@coinbase/agentkit";
import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import {
  erc20ActionProvider,
  pythActionProvider,
  walletActionProvider,
} from "@coinbase/agentkit";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  createWalletClient,
  http,
  defineChain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// --- Types ---

export type LLMProvider = "anthropic" | "openai" | "google";
export type AgentSkill = "swap" | "prices" | "lend" | "bridge";

export interface AgentConfig {
  agentId: number;
  privateKey: Hex;
  llmProvider: LLMProvider;
  llmKey: string;
  strategyPrompt: string;
  skills: AgentSkill[];
  intervalMs?: number;
  running: { value: boolean }; // mutable ref so caller can stop it
}

export interface RunningAgent {
  agentId: number;
  wallet: string;
  status: "running" | "stopped" | "error";
  lastError?: string;
  startedAt: number;
  cycleCount: number;
  running: { value: boolean };
}

// --- In-memory store for running agents ---
const runningAgents = new Map<number, RunningAgent>();

export function getRunningAgent(agentId: number): RunningAgent | undefined {
  return runningAgents.get(agentId);
}

export function getAllRunningAgents(): RunningAgent[] {
  return Array.from(runningAgents.values());
}

export function stopAgent(agentId: number): boolean {
  const agent = runningAgents.get(agentId);
  if (!agent) return false;
  agent.running.value = false;
  agent.status = "stopped";
  return true;
}

// --- LLM model factory ---

function createModel(provider: LLMProvider, apiKey: string) {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })("claude-sonnet-4-5-20250929");
    case "openai":
      return createOpenAI({ apiKey })("gpt-4o");
    case "google":
      return createGoogleGenerativeAI({ apiKey })("gemini-2.0-flash");
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// --- Build action providers from skill selection ---

function buildActionProviders(skills: AgentSkill[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providers: any[] = [
    walletActionProvider(),
    erc20ActionProvider(),
  ];

  if (skills.includes("prices")) {
    providers.push(pythActionProvider());
  }

  return providers;
}

// --- Main agent loop ---

export async function createAndRunAgent(config: AgentConfig): Promise<RunningAgent> {
  const account = privateKeyToAccount(config.privateKey);

  const tenderlyChain = defineChain({
    id: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!),
    rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL!] } },
    name: "Tenderly TestNet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  });

  const walletClient = createWalletClient({
    account,
    chain: tenderlyChain,
    transport: http(),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletProvider = new ViemWalletProvider(walletClient as any);
  const actionProviders = buildActionProviders(config.skills);

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders,
  });

  const tools = getVercelAITools(agentkit);
  const model = createModel(config.llmProvider, config.llmKey);

  const agentState: RunningAgent = {
    agentId: config.agentId,
    wallet: account.address,
    status: "running",
    startedAt: Date.now(),
    cycleCount: 0,
    running: config.running,
  };

  runningAgents.set(config.agentId, agentState);

  // Run the autonomous loop in the background
  (async () => {
    const messages: Array<{ role: string; content: string }> = [];

    while (config.running.value) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { text } = await (generateText as any)({
          model,
          tools,
          messages,
          system: `${config.strategyPrompt}

You are agent ID ${config.agentId}. Your wallet: ${account.address}.
Always check your balances before trading. Never spend more than 10% of your balance on any single trade.`,
          maxSteps: 5,
        });

        if (text) messages.push({ role: "assistant", content: text });

        // Context window management — keep last 20 messages
        if (messages.length > 20) {
          messages.splice(0, 2);
        }

        agentState.cycleCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[Agent ${config.agentId}] Error:`, message);
        agentState.lastError = message;
      }

      if (config.running.value) {
        await new Promise((r) => setTimeout(r, config.intervalMs ?? 60_000));
      }
    }

    agentState.status = "stopped";
    console.log(`Agent ${config.agentId} stopped after ${agentState.cycleCount} cycles`);
  })();

  return agentState;
}
