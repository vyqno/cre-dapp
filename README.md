<div align="center">

# AgentIndex

### Verified Performance Analytics for On-Chain AI Agents

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.5.0-4E5EE4?logo=openzeppelin)](https://openzeppelin.com/)
[![Foundry](https://img.shields.io/badge/Foundry-Forge-DEA584)](https://book.getfoundry.sh/)
[![Chainlink CRE](https://img.shields.io/badge/Chainlink-CRE-375BD2?logo=chainlink)](https://chain.link/)
[![Tests](https://img.shields.io/badge/Tests-79%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/License-MIT-blue)]()

**40,000+ AI agents operate on-chain. Nobody can tell you which ones are good.**

AgentIndex fixes that. We track what agents *actually do* — not what they claim.

Performance metrics are verified by Chainlink CRE DON consensus and published on-chain. Each agent has a linear bonding curve token — price adjusts automatically based on verified performance. Users can create prediction markets on agent metrics and access premium analytics via x402 micropayments.

---

</div>

## Architecture

```
                    +----------------------------+
                    |   Frontend (Next.js 16)    |
                    |   thirdweb SDK v5          |
                    +----------+---------+-------+
                               |         |
                    readContract|    x402 | API routes
                               |         |
              +----------------+----+----+----------+
              |                |    |                |
     +--------v---+    +------v----v--+   +---------v---------+
     | AgentRegistry|  | AgentMetrics  |  | BondingCurveFactory |
     | (register,   |  | (CRE-written  |  | (deploy curves)     |
     |  deactivate) |  |  performance) |  +--------+------------+
     +-------------+  +------^--+-----+           |
                              |  |                 | creates
                              |  | reads    +------v-----------+
                    +---------+--+------+   | AgentBondingCurve |
                    | CRE Workflow      |   | (ERC-20 + linear  |
                    | (Chainlink DON)   |   |  curve buy/sell)  |
                    | Reads curve state |   +------------------+
                    | Computes metrics  |
                    | Writes on-chain   |   +-----------------------+
                    | Adjusts slope     |   | PredictionMarket      |
                    +-------------------+   | (binary markets on    |
                                            |  CRE-verified metrics)|
                                            +---+-------------------+
                                                |
                                                | reads AgentMetrics
                                                | for trustless resolution
```

### Smart Contracts (Solidity 0.8.24)

| Contract | Purpose |
|----------|---------|
| `AgentRegistry` | Register/deactivate AI agents with metadata (name, strategy, wallet) |
| `AgentMetrics` | Store CRE-verified performance metrics (ROI, win rate, Sharpe, TVL, drawdown) |
| `BondingCurveFactory` | Deploy linear bonding curve ERC-20 tokens per agent |
| `AgentBondingCurve` | ERC-20 token with `buy()` / `sell()` via `price = basePrice + slope * supply` |
| `PredictionMarket` | Binary prediction markets on agent metrics, resolved via AgentMetrics oracle |

### CRE Workflow

The Chainlink CRE workflow (`workflows/agentindex-tracker/`) runs on a DON and:

1. Reads bonding curve state (supply, reserve, price, slope) for each tracked agent
2. Computes performance metrics deterministically (ROI, win rate, Sharpe ratio, TVL, trade count)
3. Writes verified metrics on-chain via DON consensus
4. Adjusts bonding curve slope based on ROI performance tiers

### Frontend

| Route | Description |
|-------|-------------|
| `/` | Leaderboard — all agents ranked by ROI with live on-chain data |
| `/agent/[id]` | Agent detail — metrics, bonding curve state, buy/sell trading |
| `/markets` | Prediction markets — browse, create, and bet on agent performance |
| `/markets/[id]` | Market detail — betting panel, pool visualization, resolve/claim |
| `/create` | Register agent on-chain + deploy bonding curve token (two-step flow) |
| `/portfolio` | User's token holdings across all agent curves |

### x402 Paywalled API

Premium analytics data gated behind HTTP 402 micropayments via x402 protocol.

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /api/agent/[id]` | $0.001 | Agent data + CRE metrics + curve state |
| `GET /api/leaderboard` | $0.005 | All agents ranked by ROI with full metrics |

**Usage with x402 client:**

```bash
# Without payment — returns 402 with payment instructions
curl -v http://localhost:3000/api/agent/1

# With x402 payment header — returns JSON data
curl -H "X-PAYMENT: <x402-payment-token>" http://localhost:3000/api/agent/1
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24, OpenZeppelin 5.5.0, Foundry |
| Oracle / Compute | Chainlink CRE (@chainlink/cre-sdk) |
| Frontend | Next.js 16, React 19, Tailwind 4, thirdweb SDK v5 |
| Payments | x402 protocol (@x402/next) |
| Testnet | Tenderly Virtual TestNet (Sepolia fork) |

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)
- [Node.js](https://nodejs.org/) >= 18
- A [Tenderly](https://tenderly.co/) Virtual TestNet with funded deployer wallet
- A [thirdweb](https://thirdweb.com/dashboard) client ID

## Setup

### 1. Deploy smart contracts

```bash
cd smart-contracts

# Run full test suite
forge test -vv

# Deploy to Tenderly
export PRIVATE_KEY=<your-deployer-private-key>
export TENDERLY_VNET_RPC=<your-tenderly-rpc-url>

forge script script/Deploy.s.sol --rpc-url $TENDERLY_VNET_RPC --broadcast --slow
```

Save the output addresses for the next steps.

### 2. Post-deploy setup

```bash
# Simulate trades (seeds on-chain activity)
export BONDING_CURVE_FACTORY=<factory-address>
forge script script/SimulateTrades.s.sol --rpc-url $TENDERLY_VNET_RPC --broadcast --slow

# Setup CRE authorization + seed metrics
export AGENT_METRICS=<metrics-address>
forge script script/SetupCRE.s.sol --rpc-url $TENDERLY_VNET_RPC --broadcast --slow
```

### 3. Deploy PredictionMarket

```bash
export AGENT_METRICS=<metrics-address>
forge script script/DeployPredictionMarket.s.sol --rpc-url $TENDERLY_VNET_RPC --broadcast --slow
```

### 4. Configure and run frontend

```bash
cd frontend
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=<your-thirdweb-client-id>
NEXT_PUBLIC_TENDERLY_RPC_URL=<your-tenderly-rpc-url>
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=<from-deploy-output>
NEXT_PUBLIC_AGENT_METRICS_ADDRESS=<from-deploy-output>
NEXT_PUBLIC_BONDING_CURVE_FACTORY_ADDRESS=<from-deploy-output>
NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS=<from-deploy-output>
NEXT_PUBLIC_X402_PAYWALL_ADDRESS=<your-wallet-address-for-payments>
```

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Run CRE workflow (optional)

```bash
cd workflows
cp .env.example .env
# Edit .env with your private key

# Dry run
cre workflow run agentindex-tracker --config agentindex-tracker/config.staging.json

# Live (writes to chain)
cre workflow run agentindex-tracker --config agentindex-tracker/config.production.json --broadcast
```

## Deployed Contracts (Tenderly Sepolia)

**Network:** Tenderly Sepolia Virtual TestNet (Chain ID: 11155111)

```
AgentRegistry:       0xdBfD38820686b738fc80E7aD26566F4B77c1B92D
AgentMetrics:        0xF37DA4260891042bEF41e9434e1c1dEf811b5412
BondingCurveFactory: 0x5Db2bEB5465Cdd6794f6AF404cd5d4b19a0f9570
Curve 1 (AYS):       0x2216b6fed45De015c17969E6de540350D74Fc00c
Curve 2 (MTS):       0xE15d1bD9413F8c5b58a230ca1c90418092fF4E9b
Curve 3 (SHS):       0x40bfF11cE143c739dF976a2ACB109fFd9457B1b1
PredictionMarket:    <deploy-pending>
```

## Test Suite (79/79 passing)

```
+--------------------------------+--------+--------+---------+
| Test Suite                     | Passed | Failed | Skipped |
+================================+========+========+=========+
| AgentBondingCurveTest (Unit)   | 18     | 0      | 0       |
| AgentBondingCurveFuzzTest      | 9      | 0      | 0       |
| AgentBondingCurveInvariantTest | 5      | 0      | 0       |
| IntegrationTest (E2E)          | 9      | 0      | 0       |
| AgentRegistryTest              | 10     | 0      | 0       |
| AgentMetricsTest               | 9      | 0      | 0       |
| BondingCurveFactoryTest        | 6      | 0      | 0       |
| PredictionMarketTest           | 13     | 0      | 0       |
+--------------------------------+--------+--------+---------+
| TOTAL                          | 79     | 0      | 0       |
+--------------------------------+--------+--------+---------+
```

## Project Status

- [x] Smart contracts — 5 contracts, 79 tests, deployed to Tenderly
- [x] CRE workflow — reads curve state, computes metrics, writes on-chain, adjusts slope
- [x] Frontend — leaderboard, agent detail, portfolio, create agent (all wired to on-chain data)
- [x] Buy/sell trading via bonding curve
- [x] Mobile-responsive layouts
- [x] Code review + bug fixes (12 bugs fixed, dead code cleaned)
- [x] Prediction markets — binary markets on CRE-verified metrics with trustless resolution
- [x] x402 paywalled API — micropayment-gated analytics endpoints
- [ ] Security audit (self-audited, no external audit)

## Known Limitations

- **No slippage protection** — `buy()`/`sell()` have no `minOut` parameters
- **No access control on `createCurve()`** — anyone can front-run curve creation
- **Slope decrease traps ETH** — excess reserve locked permanently after slope reduction
- **Wallet permanently consumed on deactivation** — `walletToAgentId` never cleared
- **No pause mechanism** — no emergency stop on any contract
- **Prediction market rounding** — proportional payout uses integer division (dust may remain)

---

<div align="center">

**Built for the Chainlink Convergence Hackathon 2026**

by **Hitesh (vyqno)**

</div>
