<div align="center">

# AgentIndex

### Verified Performance Analytics for On-Chain AI Agents

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.5.0-4E5EE4?logo=openzeppelin)](https://openzeppelin.com/)
[![Foundry](https://img.shields.io/badge/Foundry-Forge-DEA584)](https://book.getfoundry.sh/)
[![Chainlink CRE](https://img.shields.io/badge/Chainlink-CRE-375BD2?logo=chainlink)](https://chain.link/)
[![Tests](https://img.shields.io/badge/Tests-107%20passing-brightgreen)]()
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

### CRE Workflows (4 total)

| Workflow | File | Trigger | What It Does |
|----------|------|---------|-------------|
| **Performance Tracker** | `workflows/agentindex-tracker/` | Cron 5min | Fetches real agent tx data from Tenderly API (Confidential HTTP), computes 6 metrics, DON consensus, writes to AgentMetrics |
| **Curve Adjuster** | `workflows/curve-adjuster/` | Cron 10min | Reads verified metrics, computes performance-weighted slope, adjusts bonding curve price on-chain |
| **Market Resolver** | `workflows/market-resolver/` | Log trigger (`MarketExpired`) | Listens for expired markets, reads metrics, resolves YES/NO outcome, settles payouts |
| **Health Monitor** | `workflows/health-monitor/` | Cron 15min | Checks agent activity via Tenderly API, deactivates inactive agents (>24hr no tx) |

**CRE capabilities used:** DON Consensus, Cron Trigger, Log Trigger, Confidential HTTP, On-chain reads/writes.

See [`CHAINLINK_FILE.md`](./CHAINLINK_FILE.md) for detailed CRE submission information.

### AI Agent Runner

Agents use **Coinbase AgentKit** with ViemWalletProvider and **Vercel AI SDK** (`generateText`) for autonomous DeFi trading:

- Multi-provider LLM support (Anthropic Claude, OpenAI GPT-4o, Google Gemini)
- Configurable strategy prompts and skill selection (price feeds, swaps, lending, bridging)
- Autonomous loop with context window management
- API routes: `/api/agent/deploy` (generate wallet, fund, start), `/api/agent/stop/[id]`, `/api/agent/status/[id]`

### Frontend

| Route | Description |
|-------|-------------|
| `/` | Leaderboard — all agents ranked by ROI with live on-chain data |
| `/agent/[id]` | Agent detail — metrics, bonding curve state, buy/sell trading |
| `/markets` | Prediction markets — browse, create, and bet on agent performance |
| `/markets/[id]` | Market detail — betting panel, pool visualization, resolve/claim |
| `/create` | 3-step agent creation: Identity, AI Config (LLM + strategy), Economics (bonding curve) |
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
| Oracle / Compute | Chainlink CRE (@chainlink/cre-sdk) — 4 workflows |
| AI Agents | Coinbase AgentKit, Vercel AI SDK, ViemWalletProvider |
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

### 5. Run CRE workflows (optional)

```bash
cd workflows
cp .env.example .env
# Edit .env with contract addresses, Tenderly API credentials, CRE private key

# Install dependencies
cd agentindex-tracker && npm install && cd ..

# Simulate each workflow
cre workflow simulate agentindex-tracker/main.ts   # Performance Tracker
cre workflow simulate curve-adjuster/main.ts       # Curve Adjuster
cre workflow simulate market-resolver/main.ts      # Market Resolver
cre workflow simulate health-monitor/main.ts       # Health Monitor

# Deploy to DON (writes to chain)
cre workflow deploy agentindex-tracker/main.ts --broadcast
cre workflow deploy curve-adjuster/main.ts --broadcast
cre workflow deploy market-resolver/main.ts --broadcast
cre workflow deploy health-monitor/main.ts --broadcast
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

## Test Suite (107/107 passing)

```
+--------------------------------------+--------+--------+---------+
| Test Suite                           | Passed | Failed | Skipped |
+======================================+========+========+=========+
| AgentBondingCurveTest (Unit)         | 22     | 0      | 0       |
| AgentBondingCurveFuzzTest            | 9      | 0      | 0       |
| AgentBondingCurveInvariantTest       | 5      | 0      | 0       |
| IntegrationTest (E2E)                | 9      | 0      | 0       |
| AgentRegistryTest                    | 10     | 0      | 0       |
| AgentMetricsTest                     | 10     | 0      | 0       |
| BondingCurveFactoryTest              | 7      | 0      | 0       |
| PredictionMarketTest                 | 30     | 0      | 0       |
| PredictionMarketFuzzTest             | 3      | 0      | 0       |
| PredictionMarketInvariantTest        | 2      | 0      | 0       |
+--------------------------------------+--------+--------+---------+
| TOTAL                                | 107    | 0      | 0       |
+--------------------------------------+--------+--------+---------+
```

## Project Status

- [x] Smart contracts — 5 contracts, 107 tests, deployed to Tenderly
- [x] CRE Workflow 1 — Performance Tracker (cron, Tenderly API, DON consensus, metrics write)
- [x] CRE Workflow 2 — Curve Adjuster (cron, reads metrics, adjusts bonding curve slope)
- [x] CRE Workflow 3 — Market Resolver (log trigger on MarketExpired, auto-resolve markets)
- [x] CRE Workflow 4 — Health Monitor (cron, Tenderly API, deactivates inactive agents)
- [x] AI Agent Runner — Coinbase AgentKit + Vercel AI SDK, multi-provider LLM, autonomous trading
- [x] Enhanced Create Page — 3-step flow: Identity, AI Config (LLM + strategy + skills), Economics
- [x] Frontend — leaderboard, agent detail, portfolio, create agent, markets (all wired to on-chain data)
- [x] Buy/sell trading via bonding curve
- [x] Prediction markets — binary markets on CRE-verified metrics with trustless resolution
- [x] x402 paywalled API — micropayment-gated analytics endpoints
- [x] Code review + bug fixes (dead code cleaned, React anti-patterns fixed, utils deduplicated)
- [x] Security hardening — Address.sendValue(), reentrancy guards, immutable state, access control
- [ ] External security audit (self-audited only, see [docs/SECURITY_AUDIT.md](./docs/SECURITY_AUDIT.md))

## Known Limitations

- **No slippage protection** — `buy()`/`sell()` have no `minOut` parameters
- ~~**No access control on `createCurve()`**~~ — **Fixed:** `onlyOwner` modifier added
- **Slope decrease traps ETH** — excess reserve locked permanently after slope reduction
- **Wallet permanently consumed on deactivation** — `walletToAgentId` never cleared
- **No pause mechanism** — no emergency stop on any contract
- **Prediction market rounding** — proportional payout uses integer division (dust may remain)

---

<div align="center">

**Built for the Chainlink Convergence Hackathon 2026**

by **Hitesh (vyqno)**

</div>
