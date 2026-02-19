import { NextRequest, NextResponse } from "next/server";
import { fetchAgentServerData } from "@/lib/server-contracts";
import { withPaywall } from "@/lib/x402-server";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const agentId = Number(id);

  if (isNaN(agentId) || agentId <= 0) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  const data = await fetchAgentServerData(agentId);
  if (!data) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export const GET = withPaywall(
  (req: NextRequest) => {
    // Extract id from URL path: /api/agent/[id]
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const id = segments[segments.length - 1];
    return handler(req, { params: Promise.resolve({ id: id! }) });
  },
  "$0.001",
  "Agent performance data including CRE-verified metrics and bonding curve state",
);
