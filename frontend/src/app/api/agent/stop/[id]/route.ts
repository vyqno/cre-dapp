import { type NextRequest, NextResponse } from "next/server";
import { stopAgent, getRunningAgent } from "@/lib/agent-runner";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const agentId = Number(id);

  if (isNaN(agentId)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  const stopped = stopAgent(agentId);

  if (!stopped) {
    return NextResponse.json(
      { error: "Agent not found or not running" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    agentId,
    message: `Agent ${agentId} stop signal sent`,
  });
}
