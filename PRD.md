# AgentIndex — Product Requirements Document

> Verified Performance Analytics for On-Chain AI Agents

---

## Status & Progress

### TODO

- [ ] **Phase 0** — Project setup (dependencies, configs, Tenderly testnet)
- [ ] **Phase 1** — Core smart contracts (AgentRegistry, AgentMetrics)
- [ ] **Phase 2** — Bonding curve contracts (AgentBondingCurve, Factory)
- [ ] **Phase 3** — CRE workflows (performance tracker, health monitor, curve adjuster)
- [ ] **Phase 4** — Frontend core (layout, leaderboard, agent detail, portfolio)
- [ ] **Phase 5** — Prediction markets (contracts, CRE resolver, UI)
- [ ] **Phase 6** — x402 paywalled API
- [ ] **Phase 7** — Demo agents (AgentKit bots on Tenderly)
- [ ] **Phase 8** — Integration testing, README, demo video, submission

### Priority

| Priority | Phases | What Ships |
|----------|--------|-----------|
| **P0 — Must** | 0, 1, 3.1, 4 | Analytics dashboard + CRE metrics engine |
| **P1 — Should** | 2, 3.2, 3.3, 6 | Bonding curve trading + x402 API |
| **P2 — Nice** | 5, 7, 8 | Prediction markets + demo agents + submission |

---

## 1. Problem

There are **40,000+ AI agents** operating on-chain today (24K on ERC-8004, 17K on Virtuals Protocol, growing daily). These agents trade, farm yield, arbitrage, sell data, and manage funds autonomously.

**Nobody can tell you which ones are actually good.**

- Virtuals Protocol prices agents on **hype and speculation** — most of their 17K agents generate less than $1K/year in real value
- ERC-8004 is just a registry — it gives agents identity but **zero performance data**
- AIXBT had a $500M market cap but is down 93% — because token price had nothing to do with actual performance
- There is **no standardized tracking, no verified metrics, no analytics platform** for AI agents

This is like 2005: millions of apps, no App Store ratings. The agent economy is flying blind.

---

## 2. Solution

**AgentIndex** is the first analytics platform that tracks what AI agents **actually do** — not what they claim.

We use **Chainlink CRE workflows** to:
1. Fetch real transaction data from agent wallets
2. Calculate real performance metrics (ROI, win rate, drawdown, Sharpe ratio)
3. Reach decentralized consensus (DON) to verify the math
4. Write verified results on-chain

On top of this verified data layer, we build:
- A **public leaderboard** where anyone can see which agents perform best
- **Bonding curve tokens** per agent, priced on real performance (not hype)
- **Prediction markets** where users bet on agent performance outcomes
- A **paywalled API** (x402) for machine-to-machine analytics access

**CRE is the entire engine.** Every metric, every price adjustment, every market resolution flows through CRE workflows. This is not a dashboard that calls an API — it's a decentralized, verified, trustless analytics protocol.

---

## 3. Target Users

| User | What They Do | Why They Care |
|------|-------------|---------------|
| **DeFi investors** | Browse agent rankings, buy top agent tokens, bet on performance | Want exposure to best AI agents without trusting hype |
| **Agent creators** | Register their agent, get tracked, attract investment | Want visibility and credibility for their agent |
| **DeFi protocols** | Query agent risk scores via API before integration | Need to know if an agent is trustworthy |
| **AI agents** | Pay for their own analytics data via x402 | Need performance data for self-improvement |
| **Researchers** | Analyze agent performance trends | Need verified, standardized data |

---

## 4. Core Features

### 4.1 Agent Registry

- Agents register with: wallet address, name, strategy type, description
- Each agent gets a unique on-chain ID
- Follows ERC-8004 identity pattern
- Agent creators can deactivate their agents
- Agents are searchable by strategy type, chain, and status

### 4.2 Performance Analytics (CRE-Powered)

The core product. CRE workflows run every 60 seconds and calculate:

| Metric | What It Measures | How It's Calculated |
|--------|-----------------|-------------------|
| **ROI** | Overall return on investment | (current_value - starting_capital) / starting_capital |
| **Win Rate** | Percentage of profitable transactions | successful_txs / total_txs |
| **Max Drawdown** | Worst peak-to-trough loss | Largest single-period loss as % of capital |
| **Sharpe Ratio** | Risk-adjusted returns | ROI / volatility (simplified) |
| **TVL Managed** | Total value the agent controls | Current portfolio value in USD |
| **Total Trades** | Activity level | Count of DeFi protocol interactions |
| **Uptime** | Reliability | Time since last transaction |

**Anti-manipulation:**
- Only verified DeFi protocol interactions are counted (Uniswap, Aave, Compound, etc.)
- Random wallet deposits are **ignored** — they don't affect metrics
- Time-Weighted Rate of Return (TWRR) eliminates impact of capital inflows/outflows
- DON consensus ensures no single node can corrupt the data

### 4.3 Agent Bonding Curves

Each agent gets its own tradeable token with a **performance-driven bonding curve**:

- **Buy** agent tokens → price increases along the curve
- **Sell** agent tokens → price decreases along the curve
- **CRE adjusts the curve slope** based on real performance:
  - Agent performing well → steeper slope → price appreciates faster
  - Agent performing poorly → flatter slope → price stagnates
- This makes agent tokens fundamentally different from meme coins — price reflects **verified performance**, not speculation

### 4.4 Prediction Markets

Binary prediction markets on agent performance:

- "Will Agent #1's ROI exceed 10% by March 1?"
- "Will Agent #3 outperform Agent #7 this week?"
- "Will Agent #2's TVL surpass $1M?"

Markets are **resolved by CRE workflows** using real on-chain metrics — no human oracle, no centralized resolution. Fully automated, fully verifiable.

### 4.5 x402 Analytics API

Machine-to-machine analytics access paywalled via x402 micropayments:

- `GET /api/agent/:id` — full metrics for one agent ($0.001/query)
- `GET /api/leaderboard` — ranked agent list ($0.005/query)
- AI agents and protocols pay via HTTP 402 payment headers
- Revenue from day one

---

## 5. User Flows

### Flow 1: Investor discovers and invests in a top agent

```
1. User lands on AgentIndex homepage
2. Sees live stats: "142 agents tracked, $4.2M TVL analyzed"
3. Clicks "View Leaderboard"
4. Sees sortable table of agents ranked by ROI
5. Clicks on "YieldBot Alpha" (top performer, 18.5% ROI)
6. Sees full detail: performance chart, metrics breakdown, transaction history
7. Clicks "Buy Shares" → thirdweb Pay modal (deposit from any chain/token)
8. Receives YieldBot Alpha tokens in their wallet
9. Returns daily to check performance updates (CRE writes new metrics every 60s)
10. Sells tokens if performance drops
```

### Flow 2: Agent creator registers and gets tracked

```
1. Agent creator connects wallet via thirdweb
2. Clicks "Register Agent"
3. Fills form: agent wallet address, name, strategy type, description
4. Submits transaction (registered in AgentRegistry contract)
5. CRE workflows automatically start tracking the agent within 60 seconds
6. Agent appears on leaderboard with "New" badge
7. As agent transacts, metrics populate in real-time
8. If agent performs well, bonding curve slope steepens, token price rises
9. Investors discover and buy the agent's tokens
```

### Flow 3: User bets on agent performance

```
1. User navigates to "Markets" page
2. Browses active prediction markets
3. Sees: "Will TradingBot #7 hit 15% ROI by Feb 28?" — YES: 62%, NO: 38%
4. Clicks "Bet YES" → enters amount → confirms via thirdweb
5. Waits for deadline
6. CRE workflow checks Agent #7's actual ROI from AgentMetrics contract
7. Market auto-resolves: if YES, user gets proportional payout
8. All verifiable on-chain via Tenderly explorer
```

### Flow 4: AI agent queries analytics API

```
1. AI agent (running AgentKit) wants market intelligence
2. Sends HTTP GET to /api/leaderboard
3. Receives 402 Payment Required response with x402 headers
4. Agent signs x402 payment ($0.005 in USDC)
5. Resends request with payment signature
6. Receives ranked agent data with verified metrics
7. Uses data to inform its own strategy decisions
```

---

## 6. UI Pages

### Page 1: Landing / Home

- Hero section: "Verified Performance Data for AI Agents"
- Subtitle: "40,000+ agents. Zero accountability. Until now."
- Live stats bar: Agents Tracked | Total TVL | Metrics Updates | Avg Win Rate
- "View Leaderboard" CTA button
- "Register Your Agent" secondary CTA
- How it works: 3-step visual (CRE fetches → DON verifies → On-chain metrics)
- "Built with" badges: Chainlink CRE, thirdweb, ERC-8004, x402, Tenderly

### Page 2: Agent Leaderboard

- Search bar + filters (strategy type, chain, min TVL, status)
- Sortable data table:
  - Rank (by ROI default)
  - Agent Name + avatar/icon
  - Strategy badge (Yield / Trading / Arbitrage / Data)
  - ROI % (green/red color)
  - Win Rate %
  - Max Drawdown %
  - Sharpe Ratio
  - TVL Managed
  - Total Trades
  - Token Price (from bonding curve)
  - Status indicator (Active / Inactive / New)
- Click any row → navigates to agent detail page
- Pagination or infinite scroll

### Page 3: Agent Detail

**Header section:**
- Agent name, strategy type badge, status
- Agent wallet address (truncated, clickable to explorer)
- Registration date, creator address
- Current token price + 24h change

**Metrics cards row:**
- ROI (large number, color-coded)
- Win Rate
- Sharpe Ratio
- Max Drawdown
- TVL Managed
- Total Trades

**Performance chart:**
- Line chart showing ROI over time (Recharts)
- Toggle: 7d / 30d / All time
- Overlay: bonding curve price on secondary axis

**Trading panel (sidebar or below chart):**
- Current Price display
- Buy section: ETH input → estimated tokens output → "Buy" button
- Sell section: Token input → estimated ETH output → "Sell" button
- Your Holdings: balance + current value + P&L
- All transactions via thirdweb (gasless smart wallet option)

**Recent activity:**
- Table of agent's latest transactions
- Columns: Time, Type (Swap/Deposit/Harvest), Protocol, Amount, Status
- Links to Tenderly explorer

**CRE Verification badge:**
- Shows: "Last verified by CRE: 45 seconds ago"
- Links to the CRE workflow execution proof

### Page 4: Prediction Markets

**Active markets grid:**
- Market cards showing:
  - Question ("Will Agent #1 ROI > 10% by Mar 1?")
  - Agent involved (clickable)
  - YES/NO ratio bar (visual)
  - Total volume
  - Time remaining
  - "Bet" button

**Market detail (click into):**
- Full question + resolution criteria
- Agent's current metrics (live from CRE)
- Progress toward threshold (visual bar)
- Betting panel: YES/NO amount + odds + potential payout
- Bet history
- Resolution method: "Resolved by Chainlink CRE using verified on-chain metrics"

**Resolved markets section:**
- Past markets with outcomes
- "Settled by CRE" badge with tx link

### Page 5: Portfolio

- Total portfolio value
- Holdings table:
  - Agent name
  - Tokens held
  - Current value
  - Cost basis
  - P&L ($ and %)
  - Agent current ROI
- Active bets table:
  - Market question
  - Your position (YES/NO)
  - Amount bet
  - Current odds
  - Status (Active/Won/Lost)
- Claim button for won prediction markets

### Page 6: Register Agent

- Form:
  - Agent wallet address (required)
  - Agent name (required)
  - Strategy type (dropdown: Yield Farming, Trading, Arbitrage, Data Services, Other)
  - Description (textarea)
  - Chains it operates on (multi-select)
- Preview card showing how the agent will appear on leaderboard
- Submit → thirdweb transaction
- Success: "Your agent is now being tracked by CRE. Metrics will appear within 60 seconds."

---

## 7. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Smart Contracts** | Solidity 0.8.24, Foundry (forge) | Industry standard, fast testing |
| **CRE Workflows** | TypeScript, @chainlink/cre-sdk, viem, zod | Hackathon requirement, orchestration layer |
| **Frontend** | Next.js 16, React 19, TailwindCSS 4, shadcn/ui | Modern, fast, thirdweb-compatible |
| **Wallet/Auth** | thirdweb SDK v5 (ConnectButton, Smart Wallets, Pay) | Sponsor track, gasless UX, social login |
| **Charts** | Recharts | Lightweight, React-native |
| **API Paywall** | @x402/next | x402 micropayments for machine access |
| **Demo Agents** | Coinbase AgentKit (TypeScript) | Open source, x402-native, CDP wallets |
| **Testing** | Tenderly Virtual TestNets | Sponsor track, unlimited faucet, tx debugging |
| **Data Sources** | Moralis DeFi API, CoinGecko, Etherscan | Real agent transaction + price data |

---

## 8. Smart Contracts

| Contract | Purpose |
|----------|---------|
| `AgentRegistry.sol` | Register agents with on-chain identity, metadata, and status |
| `AgentMetrics.sol` | Store CRE-verified performance metrics (only CRE can write) |
| `AgentBondingCurve.sol` | Per-agent token with linear bonding curve, CRE-adjustable slope |
| `BondingCurveFactory.sol` | Factory that deploys bonding curves for new agents |
| `PredictionMarket.sol` | Binary prediction markets on agent metrics, CRE-resolved |

---

## 9. CRE Workflows

| Workflow | Trigger | What It Does |
|----------|---------|-------------|
| **Performance Tracker** | Cron (60s) | Fetches agent tx data via HTTP, calculates ROI/win rate/drawdown, DON consensus, writes to AgentMetrics contract |
| **Health Monitor** | Cron (5min) | Checks agent liveness, deactivates inactive agents |
| **Curve Adjuster** | Cron (10min) | Reads metrics, recalculates bonding curve slope, writes new slope |
| **Market Resolver** | Log trigger (MarketExpired event) | Reads agent metrics, determines prediction market outcome, settles on-chain |

---

## 10. Hackathon Track Mapping

| Track | How We Qualify | Prize |
|-------|---------------|-------|
| **CRE & AI** | 4 CRE workflows tracking AI agent performance, x402 payments | $10.5K / $6.5K |
| **DeFi & Tokenization** | Performance-driven bonding curve tokens, ERC-4626-style vaults | $12K / $8K |
| **Prediction Markets** | Agent performance prediction markets, CRE-resolved | $10K / $6K |
| **thirdweb x CRE** | Full thirdweb frontend (Connect, Pay, Smart Wallets, Engine) | 2 months Growth |
| **Tenderly** | All contracts + agents deployed on Virtual TestNet | $5K / $2.5K |
| **Top 10** | Floor outcome for strong CRE project | $1.5K |

**Max realistic: $12K (1 core track) + $5K (1 sponsor) = $17K**

---

## 11. What Makes This Different

| | Virtuals Protocol | AIXBT | Nansen | **AgentIndex** |
|--|-------------------|-------|--------|---------------|
| Tracks agents | No (launchpad only) | No (is an agent) | Wallets, not agents | Yes — dedicated agent tracking |
| Performance-based pricing | No (hype-based) | No | N/A | Yes — CRE-verified metrics drive price |
| Decentralized verification | No | No | No | Yes — DON consensus on every metric |
| Anti-manipulation | No | No | N/A | Yes — TWRR + protocol-only filtering |
| Prediction markets | No | No | No | Yes — bet on agent performance |
| x402 API | No | No | No | Yes — machine-to-machine analytics |
| Open data | No (proprietary) | No | Paid | Yes — on-chain, verifiable by anyone |

---

## 12. Revenue Model (Post-Hackathon)

| Stream | How | Projected |
|--------|-----|-----------|
| x402 API queries | $0.001-0.005 per query, agents + protocols pay | Scales with agent count |
| Bonding curve fees | 1% fee on every buy/sell | Scales with trading volume |
| Prediction market fees | 2% of winning payouts | Scales with market volume |
| Premium dashboard | Monthly subscription for advanced analytics | SaaS revenue |
| Protocol integrations | Custom risk scoring API for DeFi protocols | B2B contracts |

---

## 13. Key Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| "Just another Virtuals clone" perception | High | Demo must show CRE-verified metrics moving bonding curve — the moment price changes from PERFORMANCE not buy pressure is the wow factor |
| CRE execution limits (10s timeout, 5 HTTP calls) | Medium | Process 1 agent per workflow cycle, rotate through agents |
| Not enough demo agents with real tx history | High | Deploy agents early (Phase 7), let them run for days before demo |
| Bonding curve manipulation | Medium | TWRR + protocol-only tracking + min holding period |
| CRE early access limitations | Medium | Simulate via CRE CLI if deployment access delayed |

---

## 14. Timeline

| Week | What Gets Done |
|------|---------------|
| **Week 1 (Feb 16-22)** | Phase 0-2: All smart contracts written, tested, deployed to Tenderly |
| **Week 2 (Feb 23-28)** | Phase 3-6: CRE workflows, frontend, x402 API, demo agents running |
| **Mar 1 (deadline)** | Phase 7-8: Integration test, README, demo video, submit |

---

## 15. References

All research and reference materials are in `.references/`:

- `docs/hackathon-context.md` — Full hackathon rules, tracks, judging criteria
- `docs/strategies.md` — Winning strategy notes
- `docs/BLOCKCHAIN_CRYPTO_TRENDS_FEB_2026.md` — ERC-8004, x402, FHE, CRE, market trends
- `docs/TECH-RESEARCH.md` — thirdweb SDK, AgentKit, x402, ERC-8004, CRE technical details
- `docs/competitor-and-feasibility-research.md` — Virtuals, Spectral, CRE limits, bonding curve math
- `prev-winners/WINNERS-PRD.md` — Detailed analysis of 14 winning hackathon projects
- `prev-winners/YieldCoin-35K-GrandPrize/` — Grand prize winner repo (study CRE patterns)
- `prev-winners/Azurance-15K-DeFi1st/` — Insurance marketplace winner (study contract patterns)
- `prev-winners/BuckyFinance-15K-Financial1st/` — Cross-chain CDP winner (study AI + DeFi integration)
