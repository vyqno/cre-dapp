import { createThirdwebClient, defineChain } from "thirdweb";

if (!process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID) {
  console.warn("NEXT_PUBLIC_THIRDWEB_CLIENT_ID is not set — thirdweb SDK may not function correctly.");
}

export const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
});

if (!process.env.NEXT_PUBLIC_RPC_URL) {
  console.warn("NEXT_PUBLIC_RPC_URL is not set — chain RPC will not work.");
}

// Dynamic chain from env — works for ANY EVM chain
export const appChain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 11155111,
  rpc: process.env.NEXT_PUBLIC_RPC_URL || "",
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || "Sepolia",
  testnet: process.env.NEXT_PUBLIC_IS_TESTNET === "true",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
});

