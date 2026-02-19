import { NextRequest, NextResponse } from "next/server";
import { fetchAllAgentIds, fetchAgentServerData } from "@/lib/server-contracts";
import { withPaywall } from "@/lib/x402-server";

export const GET = withPaywall(
  async (_req: NextRequest) => {
    const agentIds = await fetchAllAgentIds();

    if (!agentIds || agentIds.length === 0) {
      return NextResponse.json({ agents: [], count: 0 } as Record<string, unknown>);
    }

    const results = await Promise.all(
      agentIds.map((id) => fetchAgentServerData(Number(id))),
    );

    const agents = results
      .filter((a) => a !== null)
      .sort((a, b) => b.metrics.roiBps - a.metrics.roiBps);

    return NextResponse.json({ agents, count: agents.length } as Record<string, unknown>);
  },
  "$0.005",
  "Full agent leaderboard with CRE-verified metrics, ranked by ROI",
);
