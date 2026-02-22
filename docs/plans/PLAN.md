# AgentIndex — Master Plan
> Last updated: 2026-02-20
> Status: Planning complete, ready to build
> Deadline: March 1, 2026 (hackathon submission)

---

## TL;DR

AgentIndex is a **CRE-powered performance oracle for AI agents**. CRE is not a cron job that happens to exist — it IS the product. Every metric, every price adjustment, every prediction market resolution flows through a Chainlink DON. The bonding curve price of an agent's token moves because a decentralized network of nodes verified its performance — not because someone hyped it. That's the wow moment judges need to see.

Current state: contracts done, frontend done, CRE broken (4 bugs), agent runner fake. Fix CRE first.

---

## 1. CRE — The Actual Engine (Read This First)

### Why CRE matters here (not just "we use it")

AgentIndex's pitch is: **you can't trust any agent's performance claims unless they're verified by a decentralized network**. CRE is how we do that verification:

- Multiple DON nodes independently compute ROI, win rate, drawdown
- They only agree and write on-chain when consensus is reached
- No single party — not us, not the agent creator — can manipulate the output
- The bonding curve slope is adjusted by the SAME verified data, making price a function of truth

This is fundamentally different from "we call an API and write to chain". The DON consensus (`ConsensusAggregationByFields`) makes it trustless.

### The 4 CRE Workflows (from PRD — all 4 must be built)

| Workflow | Trigger Type | CRE Features Used | What It Does |
|----------|-------------|-------------------|-------------|
| **Performance Tracker** | `CronCapability` (every 5min) | HTTP, DON consensus, on-chain write | Fetches agent tx data via Tenderly API, computes 6 metrics, DON votes, writes to AgentMetrics |
| **Curve Adjuster** | `CronCapability` (every 10min) | On-chain read + write, math | Reads metrics from AgentMetrics, computes new slope based on performance, writes to BondingCurve |
| **Market Resolver** | `LogTriggerCapability` on `MarketExpired` | Event-driven trigger, on-chain read + write | When market deadline fires, CRE reads AgentMetrics, resolves YES/NO, settles PredictionMarket |
| **Health Monitor** | `CronCapability` (every 15min) | HTTP (Tenderly), on-chain write | Checks if agent has transacted in last 24hr, deactivates inactive agents |

### CRE Capabilities to Showcase (Judge Impact)

| Capability | How We Use It | Wow Factor |
|-----------|--------------|-----------|
| **DON Consensus** (`ConsensusAggregationByFields`) | All 6 metrics go through DON agreement before writing | "No single party can fake agent metrics" |
| **Cron Trigger** | Performance & curve updates on schedule | Fully autonomous — no human trigger |
| **Log Trigger** | Market resolver fires on `MarketExpired` event | Markets resolve themselves, zero human intervention |
| **HTTP Capability** | Tenderly API for real tx history | Real off-chain data, not hardcoded |
| **Confidential HTTP** | API key for Tenderly is encrypted, never visible on-chain | Production-grade security in the DON |
| **On-chain reads + writes** | Reads AgentRegistry for wallet, writes AgentMetrics | Full blockchain integration |

### The Feedback Loop (CRE & AI track money shot)

```
Agent trades on Tenderly testnet
         ↓
CRE Performance Tracker: fetches tx history via Tenderly API
         ↓ (DON consensus)
AgentMetrics on-chain: ROI, win rate, drawdown, Sharpe written
         ↓
CRE Curve Adjuster: reads metrics, computes new slope
         ↓
BondingCurve slope changes → token price moves based on PERFORMANCE
         ↓
PredictionMarket: "Will Agent ROI > 10%?" auto-resolves via CRE log trigger
         ↓
THE AGENT ITSELF calls GET /api/leaderboard (x402 payment)
→ reads its own CRE-verified score
→ LLM decides "I'm ranked #3, be more aggressive" or "ranked #1, hold steady"
         ↓ (loop repeats every 60s)
```

This closes the loop: **agents are scored BY CRE AND consume CRE-verified data VIA x402 to improve themselves.** That's the CRE & AI track.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ /create  │  │ /agent/  │  │ /markets │  │/portfolio │  │
│  │  (P0)    │  │  [id]    │  │          │  │           │  │
│  └────┬─────┘  └──────────┘  └──────────┘  └───────────┘  │
│       │ thirdweb: TransactionButton, useReadContract,        │
│       │ useContractEvents, ConnectButton                     │
└───────┼─────────────────────────────────────────────────────┘
        │ POST /api/agent/deploy
        │ GET  /api/agent/[id]  ← x402: $0.001/query
        │ GET  /api/leaderboard ← x402: $0.005/query
┌───────▼─────────────────────────────────────────────────────┐
│              AGENT RUNNER (Next.js in-process)               │
│  ViemWalletProvider → AgentKit → getVercelAITools()          │
│  generateText(model, tools, system: strategyPrompt, maxSteps)│
│  ─► pythActionProvider (read Pyth price feeds)               │
│  ─► sushiRouterActionProvider / ensoActionProvider (swaps)   │
│  ─► erc20ActionProvider (balances)                           │
│  ─► customActionProvider (call /api/leaderboard via x402)    │
└───────┬─────────────────────────────────────────────────────┘
        │ txs go to Tenderly testnet
┌───────▼─────────────────────────────────────────────────────┐
│               SMART CONTRACTS (Tenderly Virtual TestNet)      │
│  AgentRegistry     → agent identity + registered wallet      │
│  AgentMetrics      → CRE-ONLY writeable performance store    │
│  BondingCurveFactory → deploys ERC20 curve per agent        │
│  AgentBondingCurve → CRE-adjustable slope, buy/sell         │
│  PredictionMarket  → emits MarketExpired → triggers CRE      │
└───────┬─────────────────────────────────────────────────────┘
        │ CRE reads on-chain + Tenderly API
┌───────▼─────────────────────────────────────────────────────┐
│            CHAINLINK CRE — 4 WORKFLOWS (THE ENGINE)          │
│                                                              │
│  1. Performance Tracker (cron 5min)                          │
│     • HTTP: GET Tenderly API (Confidential HTTP)             │
│     • Compute: ROI, win rate, drawdown, Sharpe, TVL, trades  │
│     • DON: ConsensusAggregationByFields across nodes         │
│     • Write: AgentMetrics.setMetrics(agentId, metrics)       │
│                                                              │
│  2. Curve Adjuster (cron 10min)                              │
│     • Read: AgentMetrics.getMetrics(agentId)                 │
│     • Compute: new slope = base × (1 + roiBps/10000 × 0.5)  │
│     • Write: AgentBondingCurve.adjustSlope(newSlope)         │
│                                                              │
│  3. Market Resolver (log trigger: MarketExpired event)       │
│     • Trigger: PredictionMarket emits MarketExpired(marketId)│
│     • Read: AgentMetrics.getMetrics(agentId) for metric      │
│     • Resolve: PredictionMarket.resolve(marketId)            │
│                                                              │
│  4. Health Monitor (cron 15min)                              │
│     • HTTP: GET Tenderly API last tx timestamp               │
│     • If 24hr no activity: AgentRegistry.deactivate(agentId) │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. What's Done vs. What's Needed

### ✅ DONE — Keep As-Is

| Component | Notes |
|-----------|-------|
| `AgentRegistry.sol` | Fully tested, fuzz + invariant |
| `AgentMetrics.sol` | Write-gated to authorized CRE address |
| `AgentBondingCurve.sol` | `adjustSlope` ready for CRE |
| `BondingCurveFactory.sol` | Tested |
| `PredictionMarket.sol` | Needs deployment + `MarketExpired` event to be emitted |
| Deploy scripts | `Deploy.s.sol`, `DeployPredictionMarket.s.sol`, `SetupCRE.s.sol` |
| Frontend pages | Home, Agent Detail, Markets, Portfolio |
| x402 paywalled API | `/api/agent/[id]`, `/api/leaderboard` |
| thirdweb integration | ConnectButton, readContract, useSendTransaction |

### ❌ NOT BUILT / BROKEN

| Component | Status | Priority |
|-----------|--------|----------|
| Contract deployment | Not deployed | 🔴 P0 — nothing works without this |
| CRE Workflow 1: Performance Tracker | Broken (4 bugs) | 🔴 P0 — core of the project |
| CRE Workflow 2: Curve Adjuster | Not built | 🔴 P0 — the wow moment |
| CRE Workflow 3: Market Resolver | Not built | 🔴 P0 — closes the prediction markets loop |
| CRE Workflow 4: Health Monitor | Not built | 🟡 P1 |
| Agent runner (real) | Fake stub | 🔴 P0 — needs trades to score |
| `/api/agent/deploy` endpoint | Not built | 🔴 P0 |
| Enhanced Create page (AI config) | Partial | 🟡 P1 |
| `MarketExpired` event in PredictionMarket | Not emitted | 🔴 P0 (needed for log trigger) |

---

## 4. Critical Bugs to Fix

### 🔴 CRIT-1: Secrets in Git
- `smart-contracts/.env` and `workflows/.env` have private keys + API keys committed
- The Foundry default key `0xac0974bec...` is public — fine for testnet, but the Alchemy/Etherscan keys need rotating
- **Fix:** Add both to `.gitignore`, create `.env.example` with placeholders

### 🔴 CRIT-2: `onCronTrigger` async bug
- `workflows/agentindex-tracker/main.ts:406` — declared sync, uses `await` internally
- Promise is silently dropped → metrics computation **never actually runs**
- **Fix:** `async (runtime, payload): Promise<string>`

### 🔴 CRIT-3: Mock performance data
- `fetchRealAgentPerformance` returns hardcoded `{ trades: 12, volumeUsd: 4500 }` for every wallet
- **Fix:** Replace with real Tenderly Transaction API call (see §8)

### 🔴 CRIT-4: zeroAddress passed to computeMetrics
- Line 438: `computeMetrics(runtime, agentId, zeroAddress, ...)` — always passes zero address
- **Fix:** Read wallet from AgentRegistry before calling computeMetrics

### 🟠 HIGH-1: `MarketExpired` event missing from PredictionMarket
- The log-triggered Market Resolver workflow needs to listen for `MarketExpired(marketId)` event
- Current `PredictionMarket.sol` has no such event — it only has `MarketResolved`
- **Fix:** Add `event MarketExpired(uint256 indexed marketId)` + emit it when `deadline` passes on first `resolve()` call. Or better: add a `expire()` function that anyone can call after deadline, emits `MarketExpired`, which CRE catches to then call `resolve()`.

### 🟠 HIGH-2: PredictionMarket address is placeholder
- `NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS=0x0000000000000000000000000000000000000001`
- **Fix:** Deploy and update env

### 🟠 HIGH-3: Agent ID race condition in create page
- `setAgentId(previousTotal + 1n)` — breaks if two registrations happen in same block
- **Fix:** Read `AgentRegistered` event from tx receipt (see §6)

### 🟡 MED-1: `totalTrades` inflation
- Workflow adds to existing on-chain value instead of replacing it — inflates 10x per 10 cycles
- **Fix:** Read the count of txs from Tenderly directly and set as absolute value, not cumulative

### 🟡 MED-2: `useBuyPrice` wrong formula
- Divides ETH by current price (linear), but bonding curve uses integral — overestimates tokens
- **Fix:** Call `getBuyPrice(tokenAmount)` with binary search, or show ETH-only input

---

## 5. Dead Code to Remove

| File | What | Action |
|------|------|--------|
| `frontend/src/lib/thirdweb.ts:25` | `tenderlyChain` export — never imported | Delete |
| `frontend/src/lib/thirdweb.ts:27` | `blockExplorerUrl` — never imported | Delete |
| `frontend/src/lib/hooks.ts:15` | Custom `parseUnits` — duplicates thirdweb's `toWei` | Delete |
| `frontend/src/lib/prediction-hooks.ts:52` | `getMarketCount` in METHODS — never called | Delete |
| `workflows/agentindex-tracker/tmp.js` | Build artifact | Delete + `.gitignore` |
| `workflows/agentindex-tracker/tmp.wasm` | Build artifact | Delete + `.gitignore` |
| `agents/basic-trader/trade.ts` | LangChain stub, never calls LLM | Replace entirely |
| `agents/basic-trader/index.ts` | CdpWalletProvider won't work on Tenderly | Replace entirely |
| Duplicate `formatThreshold` (both market pages) | Copy-pasted function | Move to `utils.ts` |
| Duplicate `formatTimeLeft` (both market pages) | Copy-pasted function | Move to `utils.ts` |

---

## 6. CRE Workflows — Detailed Implementation

### Workflow 1: Performance Tracker (fix existing)

**File:** `workflows/agentindex-tracker/main.ts`

**Fixes needed:**
1. Make `onCronTrigger` async
2. Read agent wallet from AgentRegistry (not zeroAddress)
3. Replace mock with Tenderly API
4. Fix totalTrades to be absolute

**Real Tenderly data fetch pattern:**
```typescript
// Use CRE's runtime.fetch() — supports Confidential HTTP (API key encrypted)
async function fetchAgentPerformance(runtime: Runtime<Config>, agentWallet: Address) {
  const res = await runtime.fetch(
    `https://api.tenderly.co/api/v1/account/${runtime.config.tenderlyAccount}/project/${runtime.config.tenderlyProject}/transactions?wallet=${agentWallet}&limit=100`,
    { headers: { "X-Access-Key": runtime.config.tenderlyAccessKey } }
  );
  const data = await res.json();
  const txs = data.transactions ?? [];

  // Only count successful DeFi interactions (swap, deposit, withdraw)
  const defiTxs = txs.filter(tx =>
    tx.status === true &&
    ["swap", "deposit", "withdraw", "harvest"].some(m => tx.decoded_input?.name?.toLowerCase().includes(m))
  );
  const wins = defiTxs.filter(tx => (tx.value_usd ?? 0) > 0).length;
  const profitUsd = defiTxs.reduce((sum, tx) => sum + (tx.net_value_usd ?? 0), 0);
  const volumeUsd = defiTxs.reduce((sum, tx) => sum + Math.abs(tx.value_usd ?? 0), 0);

  return { trades: defiTxs.length, wins, volumeUsd, profitUsd };
}
```

**Metrics computation (correct formulas):**
```typescript
// ROI in basis points (e.g., 185000 = 18.5%)
roiBps = Math.round((profitUsd / startingCapitalUsd) * 10000);

// Win rate in bps (e.g., 7800 = 78%)
winRateBps = trades > 0 ? Math.round((wins / trades) * 10000) : 0;

// Max drawdown: largest single loss / starting capital in bps
maxDrawdownBps = Math.round((maxSingleLoss / startingCapitalUsd) * 10000);

// Sharpe (simplified): ROI / std_dev × 100 (stored as integer)
sharpeRatioScaled = stdDev > 0 ? Math.round(((roiBps / 10000) / stdDev) * 100) : 0;

// TVL: current balance — STORED AS RAW USD (integer, e.g., 1250 = $1250)
// Frontend divides by 1 (NOT 1e6 — fix the frontend TVL display too)
tvlManaged = Math.round(currentBalanceUsd);

// Total trades: absolute count, NOT cumulative
totalTrades = trades;  // SET not ADD
```

**DON Consensus:** Already in the workflow via `ConsensusAggregationByFields`. Each DON node independently computes the same metrics from the same Tenderly API data. Only when nodes agree (within configured threshold) does the write happen.

**CRE constraints budget:**
- HTTP calls: 1 (Tenderly API) + 1 (AgentRegistry read) + 1 (AgentMetrics write) = 3 of 5 ✅
- Timeout: Read `LAST_FINALIZED_BLOCK_NUMBER` for hints, avoid redundant reads
- Per cycle: process agents sequentially (agentIds[0], agentIds[1], etc. — rotate with offset)

---

### Workflow 2: Curve Adjuster (new file)

**File:** `workflows/curve-adjuster/main.ts`

**Trigger:** Cron every 10 minutes

```typescript
// Slope formula: better ROI → steeper slope → faster price appreciation
function computeNewSlope(currentSlope: bigint, roiBps: number, winRateBps: number): bigint {
  // Score: 0-200 (100 = neutral)
  const score = Math.max(0, Math.min(200,
    (roiBps / 10000) * 50 +   // ROI contributes 50% (max 50 pts)
    (winRateBps / 10000) * 50  // win rate contributes 50% (max 50 pts)
  ));

  // Apply: new_slope = base_slope × (0.5 + score/200)
  // Score 200 → slope × 1.5 (50% steeper)
  // Score 100 → slope × 1.0 (unchanged)
  // Score 0   → slope × 0.5 (50% flatter)
  const multiplier = BigInt(Math.round((0.5 + score / 200) * 1000));
  return (currentSlope * multiplier) / 1000n;
}
```

**Why this is the wow moment:** An agent that consistently wins gets a steeper slope. Its token appreciates faster. An agent that loses money gets a flatter slope — the market sends a signal. Price follows performance, not hype.

---

### Workflow 3: Market Resolver (new file)

**File:** `workflows/market-resolver/main.ts`

**Trigger:** `LogTriggerCapability` on `MarketExpired(marketId)` event from PredictionMarket contract

**Required change to PredictionMarket.sol:**
```solidity
// Add this event
event MarketExpired(uint256 indexed marketId);

// Add this function (anyone can call after deadline)
function expire(uint256 marketId) external {
    Market storage m = markets[marketId];
    if (m.status != Status.OPEN) revert PM__MarketNotOpen();
    if (block.timestamp < m.deadline) revert PM__DeadlineNotPassed();
    emit MarketExpired(marketId);  // CRE log trigger fires here
}
```

CRE workflow listens for `MarketExpired`, then:
1. Reads `market.agentId` and `market.metric` from PredictionMarket
2. Reads `AgentMetrics.getMetrics(agentId)` for the relevant metric value
3. Compares to `market.threshold` with `market.comparison`
4. Calls `PredictionMarket.resolve(marketId)` with the result

**Why this is impressive:** Users don't need to trust anyone to resolve their bet. A Chainlink DON reads the real on-chain metrics and resolves automatically. The resolution is provably fair.

---

### Workflow 4: Health Monitor (new file)

**File:** `workflows/health-monitor/main.ts`

**Trigger:** Cron every 15 minutes

Simple workflow — for each tracked agent:
1. HTTP call to Tenderly: get last transaction timestamp for agent wallet
2. If `now - lastTxTime > 24 hours` → call `AgentRegistry.deactivate(agentId)`
3. Agents that go dark automatically get "Inactive" status on leaderboard

Showcases: CRE as a protocol governance layer — no admin needed to clean up inactive agents.

---

## 7. Agent Runner — Real Implementation

### Why current stub is wrong

`agents/basic-trader/` uses `CdpWalletProvider` (CDP API keys, only Base/Ethereum mainnet) and `LangChain HumanMessage` (never calls an LLM, just lists actions). It's entirely fake.

### Correct pattern: ViemWalletProvider + Vercel AI SDK

```typescript
// frontend/src/lib/agent-runner.ts
import { AgentKit } from "@coinbase/agentkit";
import { ViemWalletProvider } from "@coinbase/agentkit";  // from local agentkit/ clone
import { getVercelAITools } from "@coinbase/agentkit-vercel-ai-sdk";
import { erc20ActionProvider, pythActionProvider } from "@coinbase/agentkit";
import { sushiRouterActionProvider } from "@coinbase/agentkit/action-providers/sushi";
import { ensoActionProvider } from "@coinbase/agentkit/action-providers/enso";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createWalletClient, http, privateKeyToAccount, defineChain } from "viem";
import type { CoreMessage } from "ai";

export interface AgentConfig {
  agentId: number;
  privateKey: `0x${string}`;
  llmProvider: "anthropic" | "openai" | "gemini";
  llmKey: string;
  strategyPrompt: string;
  skills: string[];    // ["swap", "prices", "lend", "bridge"]
  intervalMs?: number; // default 60000 (1 min)
  running: { value: boolean };  // mutable ref so caller can stop it
}

export async function createAndRunAgent(config: AgentConfig) {
  // 1. Wallet — ViemWalletProvider works with ANY RPC including Tenderly
  const account = privateKeyToAccount(config.privateKey);
  const tenderlyChain = defineChain({
    id: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!),
    rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL!] } },
    name: "Tenderly TestNet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  });
  const walletClient = createWalletClient({ account, chain: tenderlyChain, transport: http() });
  const walletProvider = new ViemWalletProvider(walletClient);

  // 2. AgentKit with skill-mapped action providers
  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      erc20ActionProvider(),   // always: balances, approvals
      pythActionProvider(),    // always: price feeds (Pyth Network)
      ...(config.skills.includes("swap")   ? [sushiRouterActionProvider(), ensoActionProvider()] : []),
      // NOTE: compoundActionProvider, moonwellActionProvider for lending
      // NOTE: acrossActionProvider for bridging
      // Keep these commented until confirmed working on Tenderly fork
    ],
  });

  // 3. Convert all AgentKit actions to Vercel AI SDK tools (28-line adapter)
  const tools = getVercelAITools(agentkit);

  // 4. LLM model with user-provided key
  const model =
    config.llmProvider === "anthropic"
      ? createAnthropic({ apiKey: config.llmKey })("claude-sonnet-4-5-20250929")
      : createOpenAI({ apiKey: config.llmKey })("gpt-4o");

  // 5. Autonomous loop — generates text, executes tool calls, waits, repeats
  const messages: CoreMessage[] = [];
  while (config.running.value) {
    try {
      const { text } = await generateText({
        model,
        tools,
        messages,
        system: config.strategyPrompt + `\n\nYou are agent ID ${config.agentId}. Your wallet: ${account.address}. Always check your balances before trading. Never spend more than 10% of your balance on any single trade.`,
        maxSteps: 5,  // chain up to 5 tool calls per decision cycle
      });
      if (text) messages.push({ role: "assistant", content: text });
      if (messages.length > 20) messages.splice(0, 2);  // keep context window bounded
    } catch (err) {
      console.error(`[Agent ${config.agentId}] Error:`, err);
    }
    await new Promise(r => setTimeout(r, config.intervalMs ?? 60_000));
  }
}
```

### Skills → Action Providers (safe for Tenderly fork)

| UI Checkbox | Action Provider | Notes |
|-------------|----------------|-------|
| ✅ Price Feeds | `pythActionProvider` | Always on. Pyth oracle, works everywhere |
| ✅ Token Swaps | `sushiRouterActionProvider`, `ensoActionProvider` | Sushi V2/V3 exists on Tenderly fork |
| ⚠️ Lending | `compoundActionProvider`, `moonwellActionProvider` | Verify these exist on the fork first |
| ⚠️ Bridging | `acrossActionProvider` | Cross-chain may not work on single-chain Tenderly VNet |

### API Route: `/api/agent/deploy`

```typescript
// frontend/src/app/api/agent/deploy/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, parseEther } from "viem";
import { createAndRunAgent } from "@/lib/agent-runner";

// In-process map — ephemeral, fine for hackathon
const runningAgents = new Map<number, { running: { value: boolean } }>();

export async function POST(req: NextRequest) {
  const { agentId, llmProvider, llmKey, strategyPrompt, skills } = await req.json();

  if (!agentId || !llmKey || !strategyPrompt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Generate fresh agent wallet
  const privateKey = generatePrivateKey();
  const agentWallet = privateKeyToAccount(privateKey).address;

  // Fund agent wallet from deployer (0.01 ETH for gas + swaps)
  // Deployer uses DEPLOYER_PRIVATE_KEY from server env
  const deployerClient = createWalletClient({
    account: privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`),
    chain: appChain,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });
  await deployerClient.sendTransaction({ to: agentWallet, value: parseEther("0.01") });

  // Update AgentRegistry with the agent's actual wallet
  // (Called server-side after user's registerAgent TX)
  // ...

  // Start autonomous loop (non-blocking)
  const running = { value: true };
  createAndRunAgent({ agentId, privateKey, llmProvider, llmKey, strategyPrompt, skills, running });
  runningAgents.set(agentId, { running });

  return NextResponse.json({ success: true, agentWallet });
}

export async function DELETE(req: NextRequest) {
  const { agentId } = await req.json();
  const agent = runningAgents.get(agentId);
  if (agent) { agent.running.value = false; runningAgents.delete(agentId); }
  return NextResponse.json({ success: true });
}
```

---

## 8. Enhanced Create Page Flow

### 3-step create flow

```
Step 1: Agent Identity (existing)
  ├─ Name *
  ├─ Description
  ├─ Strategy Type (dropdown: Momentum / Mean Reversion / Arbitrage / Custom)
  └─ Capabilities (tags)

Step 2: AI Configuration ← NEW
  ├─ LLM Provider (Anthropic / OpenAI / Gemini)
  ├─ API Key (password input — never stored server-side, only passed to agent runner)
  ├─ Strategy Prompt (textarea, 500 char max)
  │   Default: "You are a momentum DeFi trader. Use Pyth price feeds to monitor
  │   ETH/USDC. When ETH price increases more than 1% in the last 5 minutes, buy
  │   $10 USDC worth of ETH. When it drops 2%, sell back to USDC. Never hold more
  │   than 50% of your portfolio in a single asset."
  └─ Skills
      [✓] Price Feeds  [✓] Token Swaps  [ ] Lending  [ ] Bridging

Step 3: Economics (existing bonding curve params)
  ├─ Initial token price
  ├─ Curve slope
  └─ Starting capital (ETH to fund the agent wallet)
```

### Deploy sequence

```
1. TX 1: AgentRegistry.registerAgent(name, wallet=0, strategyType, description)
         ← TransactionButton reads AgentRegistered(agentId) event from receipt
         ← Sets agentId in React state

2. TX 2: BondingCurveFactory.createCurve(agentId, initialPrice, slope)
         ← TransactionButton

3. POST /api/agent/deploy { agentId, llmProvider, llmKey, strategyPrompt, skills }
         ← API generates wallet, funds it, starts loop
         ← Returns { agentWallet }

4. TX 3 (server-side): AgentRegistry.updateAgentWallet(agentId, agentWallet)
         OR: include wallet in registerAgent (requires contract change)

5. Redirect → /agent/[agentId]
```

### Agent ID fix (no more race condition)

```typescript
// In TransactionButton onTransactionConfirmed:
import { getContractEvents } from "thirdweb";

const events = await getContractEvents({
  contract: registryContract,
  fromBlock: receipt.blockNumber,
  toBlock: receipt.blockNumber,
});
const registeredEvent = events.find(e => e.eventName === "AgentRegistered");
const realAgentId = registeredEvent?.args?.agentId;  // canonical ID from chain
setAgentId(realAgentId);
```

---

## 9. Thirdweb Improvements

### TransactionButton (replace all manual useSendTransaction)

```tsx
// Before (150+ lines across 4 files):
const { mutate: sendTx, isPending } = useSendTransaction();
<button onClick={() => sendTx(tx)} disabled={isPending}>
  {isPending ? "Confirming..." : "Buy"}
</button>

// After (handles loading, error, success, explorer link automatically):
import { TransactionButton } from "thirdweb/react";
<TransactionButton
  transaction={() => prepareBuyTx(curveAddress, buyAmount)}
  onTransactionConfirmed={(receipt) => {
    setBuyAmount("");
    toast.success(`Bought! tx: ${receipt.transactionHash.slice(0,10)}...`);
  }}
  onError={(err) => toast.error(err.message)}
>
  Buy Tokens
</TransactionButton>
```

Files to update: `agent/[id]/page.tsx`, `create/page.tsx`, `markets/[id]/page.tsx`

### useReadContract (replace all manual polling)

```typescript
// Before (hooks.ts, 300+ lines of useEffect + setInterval):
useEffect(() => {
  const poll = async () => { /* readContract, setState */ };
  poll(); const id = setInterval(poll, 5000);
  return () => clearInterval(id);
}, [deps]);

// After (3 lines, thirdweb handles caching + block-aware refetch):
const { data: agentData, isLoading } = useReadContract({
  contract: registryContract,
  method: "function getAgent(uint256) returns (Agent)",
  params: [BigInt(agentId)],
});
```

### useContractEvents for live agent activity feed

```typescript
// Real-time feed of agent trades on agent detail page
import { useContractEvents } from "thirdweb/react";
const { data: buyEvents } = useContractEvents({
  contract: curveContract,
  eventName: "TokensBought",
  watch: true,  // subscribes to new events via WebSocket
});
```

---

## 10. E2E Demo Flow (The Video)

```
0:00 — Open AgentIndex home. Show live leaderboard with 3 pre-seeded agents.
        Metrics show: "Last updated by CRE: 32s ago". Point out the CRE badge.

0:30 — Click "Create Agent". Fill:
        - Name: "Momentum Bot"
        - Strategy: Momentum
        - LLM: Anthropic, paste API key
        - Prompt: "Buy ETH when price rises 1%, sell on 2% drawdown"
        - Skills: [Price Feeds ✓] [Swaps ✓]
        Click Deploy. Show 2 TXs confirm (TransactionButton).

1:00 — API call to /api/agent/deploy in DevTools → 200 OK, agentWallet returned.
        Redirect to /agent/4 page. Agent status: "Running".

1:30 — Open Tenderly explorer. Show agent wallet receiving 0.01 ETH.
        Wait ~60s. First trade appears: "swap 5 USDC → 0.003 ETH via SushiSwap"
        Show transaction in Tenderly with decoded inputs.

2:00 — Wait for CRE trigger (every 5min). Show CRE workflow run in CLI or dashboard.
        Show AgentMetrics contract: ROI, win rate, trades updated on-chain.
        Show "Last updated by CRE: 8s ago" badge refresh on frontend.

2:30 — Show bonding curve page. Slope: was 1000, now 1050 (CRE Curve Adjuster ran).
        "The price curve got steeper because the agent is performing well."
        Buy some tokens. Show price update.

3:00 — Markets page. Show "Will Agent 4 ROI > 5% by Feb 28?" market.
        Bet YES. Show TX confirm. Show pool split.
        "When deadline passes, CRE will auto-resolve this using verified metrics."

3:30 — Show existing resolved market (pre-seeded). Show CRE transaction that resolved it.
        Portfolio page: show user's agent token holdings + active market bets.

4:00 — Recap: "Every number on this page was written by a Chainlink DON.
        No dashboard calling an API. Decentralized, verified, trustless."
```

---

## 11. Build Phases

### Phase 0: Secrets + Deploy (Feb 21, ~2 hrs)
- [ ] Add `smart-contracts/.env` and `workflows/.env` to `.gitignore`
- [ ] Create `.env.example` files with placeholder values
- [ ] Delete `tmp.js`, `tmp.wasm`
- [ ] Deploy all contracts to Tenderly (`forge script --broadcast`)
- [ ] Run `SetupCRE.s.sol` to authorize CRE workflow address as AgentMetrics writer
- [ ] Update all `NEXT_PUBLIC_*` addresses in `frontend/.env.local`
- [ ] Add `MarketExpired` event + `expire()` to `PredictionMarket.sol`
- [ ] Redeploy PredictionMarket, seed 3 demo markets

### Phase 1: Fix CRE Workflow 1 (Feb 22, ~3 hrs)
- [ ] Make `onCronTrigger` async
- [ ] Read agent wallet from AgentRegistry contract (not zeroAddress)
- [ ] Replace `fetchRealAgentPerformance` with real Tenderly API call
- [ ] Fix `totalTrades` to be absolute (not cumulative)
- [ ] Fix TVL units (pick raw USD, update frontend display to match)
- [ ] Test: run `cre workflow simulate` → verify metrics written to chain

### Phase 2: Build CRE Workflows 2, 3, 4 (Feb 23, ~4 hrs)
- [ ] Write `workflows/curve-adjuster/main.ts` (cron 10min, adjusts slope)
- [ ] Write `workflows/market-resolver/main.ts` (log trigger on MarketExpired)
- [ ] Write `workflows/health-monitor/main.ts` (cron 15min, deactivates inactive)
- [ ] Test each with `cre workflow simulate`
- [ ] Submit to CRE DON / deploy

### Phase 3: Real Agent Runner (Feb 24, ~4 hrs)
- [ ] Replace `agents/basic-trader/index.ts` with ViemWalletProvider pattern
- [ ] Build `frontend/src/lib/agent-runner.ts` (Vercel AI SDK loop)
- [ ] Build `/api/agent/deploy` route (generates key, funds, starts loop)
- [ ] Build `/api/agent/status/[id]` and `/api/agent/stop/[id]`
- [ ] Test: create agent → verify swaps execute on Tenderly within 60s

### Phase 4: Enhanced Create Page (Feb 25, ~3 hrs)
- [ ] Add Step 2 (AI Config): LLM provider, API key, strategy prompt, skills
- [ ] Fix agent ID race condition: read from `AgentRegistered` event in receipt
- [ ] Wire up POST /api/agent/deploy after TXs confirm
- [ ] Show live status while agent initializes

### Phase 5: UI Polish (Feb 26, ~3 hrs)
- [ ] Replace `useSendTransaction` with `TransactionButton` everywhere
- [ ] Replace manual polling with `useReadContract`
- [ ] Add `useContractEvents` for live trade feed on agent detail
- [ ] Fix duplicate `formatThreshold` and `formatTimeLeft` (move to utils.ts)
- [ ] Fix `HoldingRow` React anti-pattern (setState in render → useEffect)
- [ ] Add explorer links on all tx successes

### Phase 6: Demo Prep (Feb 27–Mar 1, ~4 hrs)
- [ ] Deploy 3 seed agents with different strategy prompts
- [ ] Let them run 30+ min, verify real swaps on Tenderly
- [ ] Verify CRE has scored them (check AgentMetrics on-chain)
- [ ] Verify Curve Adjuster has run (slopes should differ per agent performance)
- [ ] Seed + confirm 2 prediction markets (one resolved, one open for demo)
- [ ] Record 4-min demo video (script above)
- [ ] Write `CHAINLINK_FILE.md` (required for submission) with all:
  - Contract addresses
  - CRE workflow file paths
  - Link to CRE workflow execution proof
- [ ] Update `README.md` with setup instructions

---

## 12. Hackathon Track Strategy

| Track | Prize | Our angle |
|-------|-------|-----------|
| **CRE & AI** (primary) | $10.5K | 4 CRE workflows + AI agents consuming x402 API |
| **Prediction Markets** (secondary) | $10K | CRE log-triggered auto-resolution of markets |
| **DeFi & Tokenization** (stretch) | $12K | Performance-driven bonding curves — price = verified truth |
| **Tenderly** (sponsor) | $5K | All agents on Tenderly VNet, Tenderly API in CRE workflow |
| **thirdweb x CRE** (sponsor) | non-cash | Full thirdweb v5: TransactionButton, useReadContract, ConnectButton |

**Max realistic prize: CRE&AI ($10.5K) + Tenderly ($5K) = $15.5K**

---

## 13. What Makes This Judging-Ready

From the hackathon judging criteria (equally weighted):

| Criterion | How We Hit It |
|-----------|--------------|
| **Technical Execution** | 4 CRE workflows (cron + log trigger), DON consensus, Confidential HTTP, full Solidity test suite, thirdweb v5 correct patterns |
| **Blockchain Technology** | On-chain agent registry + metrics + bonding curves + prediction markets, all on Tenderly |
| **Effective Use of CRE** | CRE IS the product — every metric write, every price adjustment, every market resolution goes through CRE DON |
| **Originality / Wow Factor** | "Price of an agent's token is determined by a decentralized network of oracle nodes verifying real trades" — genuinely novel |

**The single most important thing for wow factor:** During the demo, show the bonding curve slope change LIVE after the CRE Curve Adjuster runs. "That curve got steeper because a Chainlink DON verified this agent made profitable trades." No one else does this.

---

## 14. Files Reference

```
convergence-hackathon/
├── agents/
│   └── basic-trader/
│       ├── index.ts    ❌ REPLACE — ViemWalletProvider not CDP
│       └── trade.ts    ❌ REPLACE — Vercel AI SDK not LangChain
│
├── agentkit/typescript/   ✅ Local clone — use these packages:
│   ├── agentkit/src/wallet-providers/viemWalletProvider.ts  ← USE THIS
│   ├── agentkit/src/action-providers/sushi/sushiRouterActionProvider.ts
│   ├── agentkit/src/action-providers/enso/ensoActionProvider.ts
│   ├── agentkit/src/action-providers/pyth/
│   └── framework-extensions/vercel-ai-sdk/src/getVercelAiTools.ts  ← 28 lines
│
├── frontend/src/
│   ├── app/
│   │   ├── page.tsx                ✅ leaderboard
│   │   ├── agent/[id]/page.tsx     🟡 needs TransactionButton + events feed
│   │   ├── create/page.tsx         🔴 needs Step 2 AI config + agent ID fix
│   │   ├── markets/page.tsx        🟠 needs real contract address
│   │   ├── markets/[id]/page.tsx   🟠 needs real contract address
│   │   ├── portfolio/page.tsx      🟡 React anti-pattern fix
│   │   └── api/
│   │       ├── agent/[id]/route.ts    ✅ x402 paywall
│   │       ├── leaderboard/route.ts   ✅ x402 paywall
│   │       ├── agent/deploy/route.ts  ❌ MUST BUILD
│   │       ├── agent/status/[id]/     ❌ MUST BUILD
│   │       └── agent/stop/[id]/       ❌ MUST BUILD
│   └── lib/
│       ├── agent-runner.ts         ❌ MUST BUILD (new)
│       ├── thirdweb.ts             🟡 remove dead exports
│       ├── hooks.ts                🟡 replace with useReadContract
│       ├── server-contracts.ts     🟡 deduplicate with hooks.ts
│       ├── utils.ts                🟡 add formatThreshold, formatTimeLeft
│       ├── contracts.ts            ✅ ABIs
│       ├── prediction-hooks.ts     🟡 remove unused METHODS entries
│       └── x402-server.ts          ✅ x402
│
├── smart-contracts/src/
│   ├── AgentRegistry.sol           ✅ done
│   ├── AgentMetrics.sol            ✅ done
│   ├── AgentBondingCurve.sol       ✅ done
│   ├── BondingCurveFactory.sol     ✅ done
│   └── PredictionMarket.sol        🟠 needs MarketExpired event + expire()
│
└── workflows/
    ├── agentindex-tracker/main.ts  🔴 4 bugs to fix (Performance Tracker)
    ├── curve-adjuster/             ❌ MUST BUILD
    ├── market-resolver/            ❌ MUST BUILD
    └── health-monitor/             ❌ MUST BUILD (P1)
```

---

## 15. Environment Variables

### `frontend/.env.local`
```bash
# Chain (Tenderly Virtual TestNet)
NEXT_PUBLIC_CHAIN_ID=<tenderly_chain_id>
NEXT_PUBLIC_RPC_URL=<tenderly_private_rpc>
NEXT_PUBLIC_BLOCK_EXPLORER_URL=<tenderly_explorer_url>

# Contract addresses (fill after deploy)
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=
NEXT_PUBLIC_AGENT_METRICS_ADDRESS=
NEXT_PUBLIC_BONDING_CURVE_FACTORY_ADDRESS=
NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS=   # NOT 0x...0001

# thirdweb
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=

# x402 paywall (server-side)
X402_FACILITATOR_URL=https://x402.org/facilitator
X402_PAYWALL_ADDRESS=
X402_RESOURCE_WALLET_PRIVATE_KEY=

# Agent deployment (server-side — never NEXT_PUBLIC)
DEPLOYER_PRIVATE_KEY=       # funds new agent wallets
TENDERLY_ACCESS_KEY=        # for CRE workflow tx history API
```

### `workflows/.env`
```bash
CRE_ETH_PRIVATE_KEY=
AGENT_METRICS_ADDRESS=
BONDING_CURVE_FACTORY_ADDRESS=
AGENT_REGISTRY_ADDRESS=
PREDICTION_MARKET_ADDRESS=
CHAIN_SELECTOR_NAME=
TENDERLY_ACCESS_KEY=     # used in Confidential HTTP config
TENDERLY_ACCOUNT=
TENDERLY_PROJECT=
```

### `smart-contracts/.env` (NEVER COMMIT)
```bash
PRIVATE_KEY=
TENDERLY_RPC_URL=
AGENT_METRICS=           # used in DeployPredictionMarket.s.sol
```

---

## 16. Known Non-Issues (Don't Fix)

- `PredictionMarket` no fee mechanism — intentional for hackathon
- `AgentRegistry.getAgent()` returns empty struct for invalid IDs — frontend handles it
- `@x402/core` not in package.json — transitive dep of `@x402/next`, works fine
- Unbounded strings in `registerAgent` — fine for testnet
- `adjustSlope` permanently locked without `curveAdjuster` — SetupCRE.s.sol sets it

---

*CRE is the engine. Build the 4 workflows first. Everything else is the dashboard on top.*
