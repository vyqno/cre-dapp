import { NextRequest, NextResponse } from "next/server";
import { fetchAgentServerData } from "@/lib/server-contracts";
import { withPaywall } from "@/lib/x402-server";

export const GET = withPaywall(
  async (req: NextRequest) => {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const id = segments[segments.length - 1];
    const agentId = Number(id);

    if (isNaN(agentId) || agentId <= 0) {
      return NextResponse.json({ error: "Invalid agent ID" } as Record<string, unknown>, { status: 400 });
    }

    const data = await fetchAgentServerData(agentId);
    if (!data) {
      return NextResponse.json({ error: "Agent not found" } as Record<string, unknown>, { status: 404 });
    }

    return NextResponse.json(data as Record<string, unknown>);
  },
  "$0.001",
  "Agent performance data including CRE-verified metrics and bonding curve state",
);
