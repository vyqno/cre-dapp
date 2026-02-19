import { createThirdwebClient, defineChain } from "thirdweb";

export const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "demo-client-id",
});

export const tenderlyChain = defineChain({
  id: 11155111,
  rpc: process.env.NEXT_PUBLIC_TENDERLY_RPC_URL ||
    "https://virtual.rpc.tenderly.co/Suji/chainlink-cre/private/agent-index-rpc/33a3e738-8ea4-4ebf-8687-051fa8ab7926",
  name: "Tenderly Sepolia",
  testnet: true,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
});
