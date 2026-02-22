import { AgentKit, erc20ActionProvider, pythActionProvider, walletActionProvider } from "@coinbase/agentkit";
import { ViemWalletProvider } from "@coinbase/agentkit";
import { getVercelAiTools } from "@coinbase/agentkit-vercel-ai-sdk";
import { generateText, type CoreMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as dotenv from "dotenv";

dotenv.config();

const STRATEGY_PROMPT = process.env.STRATEGY_PROMPT ??
  "You are a momentum DeFi trader. Use Pyth price feeds to monitor ETH/USDC. When ETH price increases more than 1% in the last 5 minutes, buy $10 USDC worth of ETH. When it drops 2%, sell back to USDC. Never hold more than 50% of your portfolio in a single asset.";

async function initializeAgent() {
  const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY required");

  const account = privateKeyToAccount(privateKey);

  const tenderlyChain = defineChain({
    id: parseInt(process.env.CHAIN_ID ?? "11155111"),
    rpcUrls: { default: { http: [process.env.RPC_URL ?? ""] } },
    name: "Tenderly TestNet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  });

  const walletClient = createWalletClient({
    account,
    chain: tenderlyChain,
    transport: http(),
  });

  const walletProvider = new ViemWalletProvider(walletClient);

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      walletActionProvider(),
      erc20ActionProvider(),
      pythActionProvider(),
    ],
  });

  const tools = getVercelAiTools(agentkit);

  const llmProvider = process.env.LLM_PROVIDER ?? "anthropic";
  const llmKey = process.env.LLM_API_KEY;
  if (!llmKey) throw new Error("LLM_API_KEY required");

  const model = llmProvider === "openai"
    ? createOpenAI({ apiKey: llmKey })("gpt-4o")
    : createAnthropic({ apiKey: llmKey })("claude-sonnet-4-5-20250929");

  console.log(`Agent initialized: wallet=${account.address}, LLM=${llmProvider}`);

  return { model, tools, wallet: account.address };
}

async function runLoop() {
  const { model, tools, wallet } = await initializeAgent();

  const messages: CoreMessage[] = [];
  const running = { value: true };

  process.on("SIGINT", () => {
    console.log("Stopping agent...");
    running.value = false;
  });

  console.log(`Starting autonomous trading loop (wallet: ${wallet})...`);

  while (running.value) {
    try {
      const { text } = await generateText({
        model,
        tools,
        messages,
        system: `${STRATEGY_PROMPT}\n\nYour wallet: ${wallet}. Always check your balances before trading. Never spend more than 10% of your balance on any single trade.`,
        maxSteps: 5,
      });

      if (text) {
        console.log(`[Cycle] ${text.slice(0, 200)}`);
        messages.push({ role: "assistant", content: text });
      }

      if (messages.length > 20) messages.splice(0, 2);
    } catch (err) {
      console.error("[Error]", err instanceof Error ? err.message : err);
    }

    if (running.value) {
      await new Promise((r) => setTimeout(r, parseInt(process.env.INTERVAL_MS ?? "60000")));
    }
  }

  console.log("Agent stopped.");
}

if (require.main === module) {
  runLoop();
}

export { initializeAgent, runLoop };
