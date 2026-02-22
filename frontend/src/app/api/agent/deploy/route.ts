import { NextRequest, NextResponse } from "next/server";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, parseEther, defineChain } from "viem";
import { createAndRunAgent, type LLMProvider, type AgentSkill } from "@/lib/agent-runner";

// In-process map for tracking running refs
const runningRefs = new Map<number, { value: boolean }>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, llmProvider, llmKey, strategyPrompt, skills } = body;

    if (!agentId || !llmKey || !strategyPrompt) {
      return NextResponse.json(
        { error: "Missing required fields: agentId, llmKey, strategyPrompt" },
        { status: 400 },
      );
    }

    // Generate fresh agent wallet
    const privateKey = generatePrivateKey();
    const agentWallet = privateKeyToAccount(privateKey).address;

    // Fund agent wallet from deployer (0.01 ETH for gas + swaps)
    if (process.env.DEPLOYER_PRIVATE_KEY) {
      const tenderlyChain = defineChain({
        id: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!),
        rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL!] } },
        name: "Tenderly TestNet",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      });

      const deployerClient = createWalletClient({
        account: privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`),
        chain: tenderlyChain,
        transport: http(process.env.NEXT_PUBLIC_RPC_URL),
      });

      await deployerClient.sendTransaction({
        to: agentWallet,
        value: parseEther("0.01"),
      });
    }

    // Start autonomous loop (non-blocking)
    const running = { value: true };
    runningRefs.set(Number(agentId), running);

    createAndRunAgent({
      agentId: Number(agentId),
      privateKey,
      llmProvider: (llmProvider ?? "anthropic") as LLMProvider,
      llmKey,
      strategyPrompt,
      skills: (skills ?? ["prices", "swap"]) as AgentSkill[],
      running,
    });

    return NextResponse.json({ success: true, agentWallet });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/agent/deploy] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId } = body;

    const running = runningRefs.get(Number(agentId));
    if (running) {
      running.value = false;
      runningRefs.delete(Number(agentId));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
