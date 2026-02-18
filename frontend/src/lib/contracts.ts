import { getContract } from "thirdweb";
import { client, tenderlyChain } from "./thirdweb";

const AGENT_REGISTRY_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS ||
  "0xdBfD38820686b738fc80E7aD26566F4B77c1B92D";
const AGENT_METRICS_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_METRICS_ADDRESS ||
  "0xF37DA4260891042bEF41e9434e1c1dEf811b5412";
const BONDING_CURVE_FACTORY_ADDRESS =
  process.env.NEXT_PUBLIC_BONDING_CURVE_FACTORY_ADDRESS ||
  "0x5Db2bEB5465Cdd6794f6AF404cd5d4b19a0f9570";

export const agentRegistryContract = getContract({
  client,
  chain: tenderlyChain,
  address: AGENT_REGISTRY_ADDRESS,
});

export const agentMetricsContract = getContract({
  client,
  chain: tenderlyChain,
  address: AGENT_METRICS_ADDRESS,
});

export const bondingCurveFactoryContract = getContract({
  client,
  chain: tenderlyChain,
  address: BONDING_CURVE_FACTORY_ADDRESS,
});

export function getBondingCurveContract(address: string) {
  return getContract({
    client,
    chain: tenderlyChain,
    address,
  });
}
