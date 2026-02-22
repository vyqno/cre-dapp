import { getContract } from "thirdweb";
import { client, appChain } from "./thirdweb";

const AGENT_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS!;
const AGENT_METRICS_ADDRESS = process.env.NEXT_PUBLIC_AGENT_METRICS_ADDRESS!;
const BONDING_CURVE_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_BONDING_CURVE_FACTORY_ADDRESS!;
const PREDICTION_MARKET_ADDRESS = process.env.NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS!;

export const agentRegistryContract = getContract({
  client,
  chain: appChain,
  address: AGENT_REGISTRY_ADDRESS,
});

export const agentMetricsContract = getContract({
  client,
  chain: appChain,
  address: AGENT_METRICS_ADDRESS,
});

export const bondingCurveFactoryContract = getContract({
  client,
  chain: appChain,
  address: BONDING_CURVE_FACTORY_ADDRESS,
});

export const predictionMarketContract = getContract({
  client,
  chain: appChain,
  address: PREDICTION_MARKET_ADDRESS,
});

export function getBondingCurveContract(address: string) {
  return getContract({
    client,
    chain: appChain,
    address,
  });
}
