export const AgentRegistryABI = [
  {
    "type": "function",
    "name": "getAgent",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AgentRegistry.Agent",
        "components": [
          { "name": "id", "type": "uint256", "internalType": "uint256" },
          { "name": "wallet", "type": "address", "internalType": "address" },
          { "name": "creator", "type": "address", "internalType": "address" },
          { "name": "name", "type": "string", "internalType": "string" },
          { "name": "strategyType", "type": "string", "internalType": "string" },
          { "name": "description", "type": "string", "internalType": "string" },
          { "name": "capabilities", "type": "string[]", "internalType": "string[]" },
          { "name": "isActive", "type": "bool", "internalType": "bool" },
          { "name": "registeredAt", "type": "uint256", "internalType": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getActiveAgentIds",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalAgents",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deactivateAgent",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;
