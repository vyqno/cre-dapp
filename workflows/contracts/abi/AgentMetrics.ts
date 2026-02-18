export const AgentMetricsABI = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "authorizedWriter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBatchMetrics",
    "inputs": [
      {
        "name": "agentIds",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct AgentMetrics.Metrics[]",
        "components": [
          {
            "name": "roiBps",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "winRateBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxDrawdownBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sharpeRatioScaled",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "tvlManaged",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalTrades",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lastUpdated",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMetrics",
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
        "internalType": "struct AgentMetrics.Metrics",
        "components": [
          {
            "name": "roiBps",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "winRateBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxDrawdownBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sharpeRatioScaled",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "tvlManaged",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalTrades",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lastUpdated",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTrackedAgentIds",
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
    "name": "getUpdateCount",
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
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isTracked",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "latestMetrics",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "roiBps",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "winRateBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxDrawdownBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sharpeRatioScaled",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tvlManaged",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "totalTrades",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lastUpdated",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setAuthorizedWriter",
    "inputs": [
      {
        "name": "writer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "trackedAgentIds",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
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
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateCounts",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
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
    "name": "updateMetrics",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "roiBps",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "winRateBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxDrawdownBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sharpeRatioScaled",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tvlManaged",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "totalTrades",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AuthorizedWriterUpdated",
    "inputs": [
      {
        "name": "oldWriter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newWriter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MetricsUpdated",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "roiBps",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      },
      {
        "name": "winRateBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalTrades",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "Metrics__InvalidDrawdown",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Metrics__InvalidWinRate",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Metrics__InvalidWriterAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Metrics__NotAuthorized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;
