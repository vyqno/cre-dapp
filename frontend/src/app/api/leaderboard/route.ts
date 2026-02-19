import { NextRequest, NextResponse } from "next/server";
import { fetchAllAgentIds, fetchAgentServerData } from "@/lib/server-contracts";
import { withPaywall } from "@/lib/x402-server";

async function handler() {
  const agentIds = await fetchAllAgentIds();

  if (!agentIds || agentIds.length === 0) {
    return NextResponse.json({ agents: [], count: 0 });
  }

  const results = await Promise.all(
    agentIds.map((id) => fetchAgentServerData(Number(id))),
  );

  const agents = results
    .filter((a) => a !== null)
    .sort((a, b) => b.metrics.roiBps - a.metrics.roiBps);

  return NextResponse.json({
    agents,
    count: agents.length,
  });
}

export const GET = withPaywall(
  (_req: NextRequest) => handler(),
  "$0.005",
  "Full agent leaderboard with CRE-verified metrics, ranked by ROI",
);
