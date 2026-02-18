// Minimal ABIs for thirdweb readContract / prepareContractCall

export const agentRegistryAbi = [
  {
    type: "function",
    name: "getAgent",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "wallet", type: "address" },
          { name: "creator", type: "address" },
          { name: "name", type: "string" },
          { name: "strategyType", type: "string" },
          { name: "description", type: "string" },
          { name: "isActive", type: "bool" },
          { name: "registeredAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getActiveAgentIds",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalAgents",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const agentMetricsAbi = [
  {
    type: "function",
    name: "getMetrics",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "roiBps", type: "int256" },
          { name: "winRateBps", type: "uint256" },
          { name: "maxDrawdownBps", type: "uint256" },
          { name: "sharpeRatioScaled", type: "uint256" },
          { name: "tvlManaged", type: "uint256" },
          { name: "totalTrades", type: "uint256" },
          { name: "lastUpdated", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBatchMetrics",
    inputs: [{ name: "agentIds", type: "uint256[]" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "roiBps", type: "int256" },
          { name: "winRateBps", type: "uint256" },
          { name: "maxDrawdownBps", type: "uint256" },
          { name: "sharpeRatioScaled", type: "uint256" },
          { name: "tvlManaged", type: "uint256" },
          { name: "totalTrades", type: "uint256" },
          { name: "lastUpdated", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTrackedAgentIds",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
] as const;

export const bondingCurveFactoryAbi = [
  {
    type: "function",
    name: "getCurve",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllAgentIds",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
] as const;

export const agentBondingCurveAbi = [
  {
    type: "function",
    name: "currentPrice",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reserveBalance",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "buy",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "sell",
    inputs: [{ name: "tokenAmount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "slope",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBuyPrice",
    inputs: [{ name: "tokenAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSellRefund",
    inputs: [{ name: "tokenAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
