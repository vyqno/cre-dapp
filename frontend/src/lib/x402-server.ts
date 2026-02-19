import { withX402 } from "@x402/next";
import type { RouteConfig } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { NextRequest, NextResponse } from "next/server";

const payTo = process.env.NEXT_PUBLIC_X402_PAYWALL_ADDRESS!;

// Use Base Sepolia for x402 payments (standard x402 payment network)
const PAYMENT_NETWORK = "eip155:84532" as const;

// x402 facilitator client (default public facilitator)
const facilitatorClient = new HTTPFacilitatorClient();

// x402 resource server with facilitator
const server = new x402ResourceServer(facilitatorClient);

/**
 * Wrap a Next.js API route handler with x402 payment protection.
 *
 * @param handler - The route handler to protect
 * @param price - Price as a string (e.g. "$0.001")
 * @param description - Description of the resource
 */
export function withPaywall<T = unknown>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  price: string,
  description: string,
) {
  const routeConfig: RouteConfig = {
    accepts: {
      scheme: "exact",
      network: PAYMENT_NETWORK,
      payTo,
      price,
    },
    description,
  };

  return withX402(handler, routeConfig, server);
}
