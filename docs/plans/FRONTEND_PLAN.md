# Frontend Plan — AgentIndex Protocol

> **TL;DR:** The frontend is ~90% complete. All pages exist and are wired to contract ABIs.
> The primary work is switching from Tenderly testnet → live Sepolia, fixing two
> placeholder addresses, and adding a handful of missing UX pieces.

---

## Current State (What Already Exists)

| Page / Feature | Status | Notes |
|---|---|---|
| `/` Leaderboard | ✅ Done | polls every 30s, responsive |
| `/create` 3-step wizard | ✅ Done | register agent + deploy curve |
| `/agent/[id]` detail + trade | ✅ Done | buy/sell bonding curve tokens |
| `/portfolio` user holdings | ✅ Done | shows token balances |
| `/markets` list + create | ✅ Done | create market form |
| `/markets/[id]` betting panel | ✅ Done | bet YES/NO, resolve, claim |
| Autonomous agent loop | ✅ Done | AgentKit + Vercel AI SDK |
| `/api/agent/deploy` | ✅ Done | generates wallet, funds 0.01 ETH |
| `/api/agent/status/[id]` | ✅ Done | in-process status check |
| `/api/agent/stop/[id]` | ✅ Done | stops running agent loop |
| x402 paywalled `/api/leaderboard` | ✅ Done | $0.005 paywall |
| x402 paywalled `/api/agent/[id]` | ✅ Done | $0.001 paywall |
| `useAgents()` / `useAgent()` hooks | ✅ Done | thirdweb reads |
| `useMarkets()` / `useMarket()` hooks | ✅ Done | prediction market reads |
| Wallet connection (Navbar) | ✅ Done | thirdweb ConnectButton |

---

## Phase 0 — Environment Switch (Do This First, ~10 min)

The `.env.local` still points to old Tenderly contracts and has two placeholder addresses.
**This is the single biggest blocker** — nothing in Prediction Markets works until fixed.

### 0.1 Update `frontend/.env.local`

Replace the entire file with:

```env
# ── Thirdweb ──────────────────────────────────────────────────────────
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=demo-client-id      # replace with real ID from thirdweb.com

# ── Chain — Sepolia ───────────────────────────────────────────────────
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_CHAIN_NAME=Sepolia
NEXT_PUBLIC_IS_TESTNET=true
NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/lBuG0QG7h_qqBn5y4oomW
NEXT_PUBLIC_BLOCK_EXPLORER_URL=https://sepolia.etherscan.io

# ── Deployed Contract Addresses (Sepolia) ─────────────────────────────
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=0x1872EEE5A7ef87975da8F506d6a619412101Ac7C
NEXT_PUBLIC_AGENT_METRICS_ADDRESS=0x4E2d84cf2347a3CBBcd57B919d5D7cB43a0b7187
NEXT_PUBLIC_BONDING_CURVE_FACTORY_ADDRESS=0x8FF1B3d40fd68F112e0928e8498a307e14600512
NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS=0x4a6F0de4750FDbDAda99B9e812656De0E2866C09

# ── x402 Paywall ──────────────────────────────────────────────────────
NEXT_PUBLIC_X402_PAYWALL_ADDRESS=0x814a3D96C36C45e92159Ce119a82b3250Aa79E5b  # deployer wallet receives payments
X402_FACILITATOR_URL=https://x402.org/facilitator
X402_RESOURCE_WALLET_PRIVATE_KEY=0x604d98d46a5545c6771142f85da92a216c5b8be97b9bc967c512555a88679843

# ── Server-side (agent deployment funding) ────────────────────────────
DEPLOYER_PRIVATE_KEY=0x604d98d46a5545c6771142f85da92a216c5b8be97b9bc967c512555a88679843
```

### 0.2 Update `thirdweb.ts` chain config

`src/lib/thirdweb.ts` defines a custom chain from env vars. After switching to real Sepolia,
use `import { sepolia } from "thirdweb/chains"` directly so the block explorer and metadata
come from the canonical definition — no chance of misconfiguration:

```typescript
// Before (custom chain from env):
export const chain = defineChain({ id: Number(process.env.NEXT_PUBLIC_CHAIN_ID), ... });

// After (canonical Sepolia):
import { sepolia } from "thirdweb/chains";
export const chain = sepolia;
```

Keep the env-based fallback for local/Tenderly development.

**Verification:** Run `npm run dev` and open `/` — agents should appear with live on-chain data.

---

## Phase 1 — Critical UI Gaps (Missing UX for Running Agents)

The agent runner (`agent-runner.ts`) and APIs exist, but the UI doesn't surface agent
running state to the user after creation.

### 1.1 Add Agent Running Status to `/agent/[id]`

**File:** `src/app/agent/[id]/page.tsx`

Add a status section below the metrics grid:

```
┌─────────────────────────────────────────────┐
│  Agent Status                               │
│  ● Running  |  Cycle #47  |  Up 2h 14m      │
│  Last error: none                           │
│  [Stop Agent]                               │
└─────────────────────────────────────────────┘
```

**Implementation:**
- `useEffect` polling `/api/agent/status/${id}` every 10s
- Show `status`, `cycleCount`, `uptimeMs`, `lastError`
- "Stop Agent" button → `POST /api/agent/stop/${id}`
- Green dot if `status === "running"`, grey dot if `"not_running"`

### 1.2 Redirect After Create to Agent Detail

**File:** `src/app/create/page.tsx`

After successful deployment (step 3 success screen), the current UI shows a static card.
Change the "View Agent" button to `router.push(`/agent/${agentId}`)` so the user sees
their live agent immediately.

### 1.3 Add "Start Agent" Button on Agent Detail

Currently agents can only be started via the create wizard. Add a "Start Agent" button
on `/agent/[id]` that opens a modal with:
- LLM Provider selector
- API Key input
- Optional strategy prompt override
- Submit → `POST /api/agent/deploy`

This lets an agent be restarted after a server restart without going through the wizard again.

---

## Phase 2 — Missing Polish (Nice-to-Have Before Demo)

### 2.1 Transaction Toast Notifications

Currently transactions succeed/fail silently (no visible confirmation outside wallet pop-up).

**Add:** A simple toast system (or use `react-hot-toast`) that shows:
- "Transaction submitted… 0x1234..." (pending)
- "✔ Buy confirmed — you received 14.3 tokens" (success)
- "✖ Transaction reverted: PM__ZeroBet" (error, humanized)

**Files to update:** `agent/[id]/page.tsx`, `markets/[id]/page.tsx`, `create/page.tsx`

### 2.2 Market Expiry State

Markets past their deadline that haven't been resolved yet should show an "Expired" badge
and a "Resolve" button (anyone can call `resolve()` after deadline). Currently the UI
shows "Open" until someone resolves it.

**File:** `src/app/markets/[id]/page.tsx`

Logic:
```typescript
const isPastDeadline = Date.now() > market.deadline * 1000;
const canResolve = market.status === 0 && isPastDeadline;
```

### 2.3 Empty States

Each page needs a proper empty state when no data exists:

| Page | Empty State |
|---|---|
| `/` | "No agents registered yet. [Create one →]" |
| `/markets` | "No markets yet. [Create the first one →]" |
| `/portfolio` | "You don't hold any agent tokens yet. [Browse agents →]" |

### 2.4 Loading Skeletons

Replace the current `"Loading..."` text with animated skeleton cards to prevent layout shift
and improve perceived performance. Use a simple CSS pulse animation.

### 2.5 Mobile Betting Panel on `/markets/[id]`

The betting panel is currently a fixed-position sidebar. On mobile (<768px) it should
collapse to a bottom sheet or a button that opens a modal — the current layout breaks
on small screens.

---

## Phase 3 — Agent Status Persistence (Post-Demo Enhancement)

The `getRunningAgent()` Map is in-process only — it resets on every Next.js server restart
(e.g., cold deploy on Vercel). This means agents appear as "not running" even if they were
deployed before the restart.

### Option A: Redis (Production-grade)
- Store `RunningAgent` state in Redis via `@vercel/kv` or `ioredis`
- `createAndRunAgent` writes status on each cycle update
- Status endpoint reads from Redis first
- Agent loop writes heartbeat every 60s

### Option B: Local JSON (Hackathon-grade)
- Write running agent state to `data/agents.json` on each cycle
- Status endpoint reads from file
- Fast to implement, fine for demo

**Recommended for hackathon:** Option B. One file, zero dependencies.

---

## Phase 4 — Feature Gaps Discovered During Exploration

These are not blockers but would round out the product.

### 4.1 Transaction History Page (`/history`)

Show past buys/sells/bets for connected wallet. Read from on-chain events:
- `TokensBought(agentId, buyer, ethSpent, tokensReceived)`
- `BetPlaced(marketId, user, isYes, amount)`
- `Claimed(marketId, user, payout)`

Use `getContractEvents()` from thirdweb SDK.

### 4.2 Agent Profile Edit Page (`/agent/[id]/edit`)

Agents can currently only be created, not updated. AgentRegistry doesn't have an update
function on-chain, but the agent description/strategy stored off-chain could be editable
via a simple localStorage or server-side store.

**Out of scope for hackathon** — mention in README as known limitation.

### 4.3 Market Cancellation

No UI button to cancel an open market. The contract has no `cancel()` function (only
`expire()` which the resolver calls after deadline with no liquidity). Leave as-is,
mention in README.

---

## Implementation Order

```
Day 1 (2h):
  Phase 0 — env update + chain config fix + smoke test all pages

Day 1 (3h):
  Phase 1.1 — agent status on /agent/[id]
  Phase 1.2 — redirect after create
  Phase 1.3 — Start Agent modal

Day 2 (2h):
  Phase 2.1 — transaction toasts
  Phase 2.2 — market expiry badge + resolve button
  Phase 2.3 — empty states
  Phase 2.4 — loading skeletons

Day 2 (1h):
  Phase 2.5 — mobile betting panel fix

Optional (post-demo):
  Phase 3.B — JSON agent status persistence
  Phase 4.1 — transaction history
```

---

## File Map — What to Edit

| Task | File(s) |
|---|---|
| Env update | `frontend/.env.local` |
| Chain config | `src/lib/thirdweb.ts` |
| Agent status UI | `src/app/agent/[id]/page.tsx` |
| Post-create redirect | `src/app/create/page.tsx` |
| Start Agent modal | `src/app/agent/[id]/page.tsx` |
| Toast system | New `src/components/Toast.tsx` + layout |
| Market expiry | `src/app/markets/[id]/page.tsx` |
| Empty states | `page.tsx`, `markets/page.tsx`, `portfolio/page.tsx` |
| Skeletons | New `src/components/Skeleton.tsx` |
| Mobile betting | `src/app/markets/[id]/page.tsx` |
| Status persistence | `src/lib/agent-runner.ts` + new `data/agents.json` |

---

## Contract ABIs Already Imported

All ABIs are imported from `workflows/contracts/abi/` and wired through `src/lib/contracts.ts`.
No ABI changes are needed — the on-chain interface is stable.

```typescript
// src/lib/contracts.ts (already correct)
AgentRegistry:       0x1872EEE5A7ef87975da8F506d6a619412101Ac7C
AgentMetrics:        0x4E2d84cf2347a3CBBcd57B919d5D7cB43a0b7187
BondingCurveFactory: 0x8FF1B3d40fd68F112e0928e8498a307e14600512
PredictionMarket:    0x4a6F0de4750FDbDAda99B9e812656De0E2866C09
```

The only thing blocking full functionality is the stale values in `.env.local`.
