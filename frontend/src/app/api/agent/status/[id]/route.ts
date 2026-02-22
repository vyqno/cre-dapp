import { type NextRequest, NextResponse } from "next/server";
import { getRunningAgent } from "@/lib/agent-runner";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const agentId = Number(id);

  if (isNaN(agentId)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  const agent = getRunningAgent(agentId);

  if (!agent) {
    return NextResponse.json({
      agentId,
      status: "not_running",
      message: "Agent is not running on this server",
    });
  }

  return NextResponse.json({
    agentId: agent.agentId,
    wallet: agent.wallet,
    status: agent.status,
    startedAt: agent.startedAt,
    cycleCount: agent.cycleCount,
    lastError: agent.lastError ?? null,
    uptimeMs: Date.now() - agent.startedAt,
  });
}
