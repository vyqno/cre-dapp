import { createThirdwebClient, defineChain } from "thirdweb";
import { sepolia } from "thirdweb/chains";

if (!process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID) {
  console.warn("NEXT_PUBLIC_THIRDWEB_CLIENT_ID is not set — thirdweb SDK may not function correctly.");
}

export const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
});

// Use canonical Sepolia by default; fall back to env-based custom chain for local/Tenderly dev
export const appChain = process.env.NEXT_PUBLIC_RPC_URL
  ? defineChain({
      id: Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 11155111,
      rpc: process.env.NEXT_PUBLIC_RPC_URL,
      name: process.env.NEXT_PUBLIC_CHAIN_NAME || "Sepolia",
      testnet: (process.env.NEXT_PUBLIC_IS_TESTNET === "true") as true,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    })
  : sepolia;
