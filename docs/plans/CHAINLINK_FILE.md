# AgentIndex - Chainlink CRE Submission

## Project Overview

AgentIndex is a **CRE-powered performance oracle for AI trading agents**. Every agent metric, bonding curve price adjustment, and prediction market resolution flows through Chainlink DON consensus — making agent performance trustless and verifiable.

## Smart Contract Addresses

> Deployed on Tenderly Virtual TestNet (Sepolia fork)

| Contract | Purpose |
|----------|---------|
| **AgentRegistry** | Registers AI agents with metadata, wallet, strategy type, capabilities |
| **AgentMetrics** | Stores CRE-verified performance data (ROI, win rate, Sharpe, TVL, trades, drawdown) |
| **BondingCurveFactory** | Creates per-agent linear bonding curves for tokenized agent shares |
| **AgentBondingCurve** | Individual bonding curve with CRE-adjustable slope based on verified performance |
| **PredictionMarket** | Binary YES/NO markets on agent metrics, auto-resolved by CRE |

### Source Files

- `smart-contracts/src/AgentRegistry.sol`
- `smart-contracts/src/AgentMetrics.sol`
- `smart-contracts/src/BondingCurveFactory.sol`
- `smart-contracts/src/AgentBondingCurve.sol`
- `smart-contracts/src/PredictionMarket.sol`

### Deployment Scripts

- `smart-contracts/script/Deploy.s.sol` — Core contracts + seed data
- `smart-contracts/script/DeployPredictionMarket.s.sol` — Prediction market contract
- `smart-contracts/script/SetupCRE.s.sol` — Authorize CRE workflow address as AgentMetrics writer

## CRE Workflows

### Workflow 1: Performance Tracker (Cron)

**File:** `workflows/agentindex-tracker/main.ts`

**Trigger:** `CronCapability` — every 5 minutes

**CRE Features Used:**
- Confidential HTTP (`runtime.fetch()`) — fetches agent transaction history from Tenderly API with encrypted API key
- DON Consensus (`ConsensusAggregationByFields`) — all 6 metrics independently computed and agreed upon by DON nodes
- On-chain write via `EVMClient` — writes verified metrics to `AgentMetrics.updateMetrics()`
- On-chain read — reads agent wallet from `AgentRegistry.getAgent()`

**What It Does:**
1. Reads registered agent wallet addresses from AgentRegistry
2. Fetches real transaction history from Tenderly API (Confidential HTTP)
3. Computes 6 performance metrics: ROI (bps), win rate (bps), max drawdown (bps), Sharpe ratio (scaled), TVL managed (USD), total trades (absolute)
4. DON nodes reach consensus on computed values
5. Writes verified metrics on-chain to AgentMetrics contract

### Workflow 2: Curve Adjuster (Cron)

**File:** `workflows/curve-adjuster/main.ts`

**Trigger:** `CronCapability` — every 10 minutes

**CRE Features Used:**
- On-chain read via `EVMClient` — reads current metrics from AgentMetrics, current slope from BondingCurve
- DON Consensus — nodes independently compute the new slope
- On-chain write — adjusts bonding curve slope via `AgentBondingCurve.adjustSlope()`

**What It Does:**
1. Reads agent performance metrics (ROI + win rate) from AgentMetrics
2. Reads current bonding curve slope from BondingCurveFactory
3. Computes performance score: 50% ROI contribution + 50% win rate contribution
4. Calculates new slope: `currentSlope * (0.5 + score/200)` (performance-weighted adjustment)
5. Writes new slope on-chain — making token price a function of verified, DON-consensus performance

### Workflow 3: Market Resolver (Log Trigger)

**File:** `workflows/market-resolver/main.ts`

**Trigger:** `EVMClient.logTrigger()` — listens for `MarketExpired(uint256 marketId)` events

**CRE Features Used:**
- Log trigger via `evmClient.logTrigger({addresses: [predictionMarketAddress]})` — fires when market deadline passes
- On-chain read — reads market details and current agent metrics from AgentMetrics
- DON Consensus — nodes agree on resolution outcome (YES/NO)
- On-chain write — resolves prediction market and settles payouts via `PredictionMarket.resolve()`

**What It Does:**
1. Listens for `MarketExpired` events emitted when a market deadline passes
2. Extracts `marketId` from event log topics
3. Reads market details (agent, metric, comparison, threshold)
4. Reads current verified metric value from AgentMetrics
5. Compares metric against threshold to determine YES/NO outcome
6. Resolves market on-chain — zero human intervention required

### Workflow 4: Health Monitor (Cron)

**File:** `workflows/health-monitor/main.ts`

**Trigger:** `CronCapability` — every 15 minutes

**CRE Features Used:**
- On-chain read — reads agent data from AgentRegistry
- Confidential HTTP (`runtime.fetch()`) — checks Tenderly API for last transaction timestamp
- DON Consensus — nodes agree on agent activity status
- On-chain write — deactivates inactive agents via `AgentRegistry.deactivateAgent()`

**What It Does:**
1. Reads all active agents from AgentRegistry
2. For each agent, fetches last transaction timestamp from Tenderly API
3. If agent has been inactive for > 24 hours, marks it for deactivation
4. DON consensus confirms inactivity
5. Deactivates agent on-chain — protects investors from zombie agents

## CRE Capabilities Demonstrated

| Capability | Workflows Using It | Description |
|-----------|-------------------|-------------|
| **DON Consensus** (`ConsensusAggregationByFields`) | All 4 | Decentralized agreement on computed values before any on-chain write |
| **Cron Trigger** (`CronCapability`) | Performance Tracker, Curve Adjuster, Health Monitor | Autonomous scheduled execution — no human trigger needed |
| **Log Trigger** (`EVMClient.logTrigger()`) | Market Resolver | Event-driven execution — markets resolve themselves when deadlines pass |
| **Confidential HTTP** (`runtime.fetch()`) | Performance Tracker, Health Monitor | Encrypted API keys for Tenderly — never visible on-chain |
| **On-chain Reads** (`EVMClient`) | All 4 | Read agent registry, metrics, bonding curve state |
| **On-chain Writes** (`EVMClient`) | All 4 | Write metrics, adjust slopes, resolve markets, deactivate agents |

## CRE Configuration

**Project config:** `workflows/project.yaml`

**Chain:** Ethereum Testnet Sepolia (via Tenderly Virtual TestNet)

**RPC:** Tenderly private RPC endpoint configured in `project.yaml` staging-settings

## The Feedback Loop (Why CRE Matters Here)

```
Agent trades on Tenderly VNet
       |
       v
CRE Performance Tracker (Cron 5min)
  - Fetches trades via Confidential HTTP
  - DON consensus on 6 metrics
  - Writes to AgentMetrics
       |
       v
CRE Curve Adjuster (Cron 10min)
  - Reads verified metrics
  - Computes performance-weighted slope
  - Adjusts bonding curve price
       |
       v
Token price reflects verified performance
  - Good agent = steeper curve = rising price
  - Bad agent = flatter curve = falling price
       |
       v
Prediction Markets resolve automatically
  - CRE Market Resolver fires on MarketExpired
  - Reads DON-verified metrics
  - Settles YES/NO — zero human intervention
```

**The key insight:** You can't trust any agent's performance claims unless they're verified by a decentralized network. CRE makes price a function of truth.

## Additional Integrations

- **Coinbase AgentKit** — AI agents use ViemWalletProvider + Vercel AI SDK for autonomous DeFi trading
- **Tenderly Virtual TestNet** — All agent transactions execute on Tenderly; CRE reads real tx history via API
- **thirdweb v5** — Frontend uses ConnectButton, useSendTransaction, readContract for all wallet interactions
- **x402 Protocol** — Paywalled API endpoints (`/api/agent/[id]`, `/api/leaderboard`) for monetized data access

## Repository Structure

```
convergence-hackathon/
├── smart-contracts/          # Foundry project — 5 Solidity contracts
│   ├── src/                  # Contract source files
│   ├── test/                 # Foundry test suite
│   └── script/               # Deployment scripts
├── workflows/                # CRE workflows (TypeScript)
│   ├── agentindex-tracker/   # Workflow 1: Performance Tracker
│   ├── curve-adjuster/       # Workflow 2: Curve Adjuster
│   ├── market-resolver/      # Workflow 3: Market Resolver
│   ├── health-monitor/       # Workflow 4: Health Monitor
│   ├── contracts/abi/        # Shared ABI definitions
│   └── project.yaml          # CRE project configuration
├── frontend/                 # Next.js 16 + thirdweb v5
│   ├── src/app/              # Pages: leaderboard, agent detail, create, markets, portfolio
│   ├── src/lib/              # Hooks, contracts, agent runner, utilities
│   └── src/app/api/          # API routes (agent deploy/stop, x402 paywall)
└── agents/                   # Standalone agent runner (basic-trader)
```
─────────────────────
 Ready to code?                                                
                                                                Here is Claude's plan:                                        
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Plan: Smart Contract Security Hardening + CRE Simulation      
                                                               
 Context                                                       
                                                             
 All code phases (0-6) of the AgentIndex hackathon project are 
  complete. Before submission, we need to:                     
 1. Fix security vulnerabilities found during audit of the 5 
 Solidity contracts                                            
 2. Fill critical test coverage gaps (PredictionMarket is      
 especially undertested)
 3. Create CRE simulation scripts so the frontend shows live,  
 evolving data without deploying to a real Chainlink DON       

 ---
 Phase 1: Security Fixes (7 tasks)

 Task 1.1: PredictionMarket — replace raw .call{value} with    
 Address.sendValue()

 File: smart-contracts/src/PredictionMarket.sol
 - Add import: import {Address} from
 "@openzeppelin/contracts/utils/Address.sol";
 - Add using Address for address payable; after contract       
 declaration
 - Line 194-195: Replace (bool ok,) = msg.sender.call{value:   
 payout}(""); if (!ok) revert PM__TransferFailed(); with       
 payable(msg.sender).sendValue(payout);
 - Remove error PM__TransferFailed(); (line 58) — no longer    
 needed
 - Verify: forge build compiles

 Task 1.2: PredictionMarket — add nonReentrant to resolve()    

 File: smart-contracts/src/PredictionMarket.sol
 - Line 141: Change function resolve(uint256 marketId)
 external { → function resolve(uint256 marketId) external      
 nonReentrant {

 Task 1.3: PredictionMarket — remove dead code

 File: smart-contracts/src/PredictionMarket.sol
 - Delete error PM__NoLiquidity(); (line 57) — declared but    
 never used
 - Delete return 0; at end of _readMetric (line 224) —
 unreachable after exhaustive if-chain

 Task 1.4: BondingCurve — mark basePrice as immutable

 File: smart-contracts/src/AgentBondingCurve.sol
 - Line 103: Change uint256 public basePrice; → uint256 public 
  immutable basePrice;

 Task 1.5: BondingCurveFactory — mark defaults as immutable    

 File: smart-contracts/src/BondingCurveFactory.sol
 - Line 35: uint256 public defaultBasePrice; → uint256 public  
 immutable defaultBasePrice;
 - Line 38: uint256 public defaultSlope; → uint256 public      
 immutable defaultSlope;

 Task 1.6: BondingCurveFactory — add access control to
 createCurve()

 File: smart-contracts/src/BondingCurveFactory.sol
 - Add onlyOwner modifier to createCurve() — prevents
 front-running curve creation

 Task 1.7: Add PredictionMarket to gas reports

 File: smart-contracts/foundry.toml
 - Add "PredictionMarket", to the gas_reports array

 Verification after Phase 1: forge build && forge test -vvv —  
 all 79 existing tests must still pass.

 ---
 Phase 2: Test Hardening (12 tasks)

 Task 2.1: Test expire() function

 File: smart-contracts/test/PredictionMarket.t.sol
 - test_expire() — warp past deadline, call expire, assert     
 MarketExpired event emitted (vm.expectEmit), assert market    
 status still OPEN
 - test_expireBeforeDeadlineReverts() — assert
 PM__DeadlineNotPassed
 - test_expireResolvedMarketReverts() — resolve first, then    
 expire → PM__MarketNotOpen

 Task 2.2: Test all 6 MetricFields in resolution

 File: smart-contracts/test/PredictionMarket.t.sol
 - test_resolveWinRate() — agent 1 winRate=7800 vs threshold   
 7000, ABOVE → YES
 - test_resolveSharpe() — agent 1 sharpe=18500 vs threshold    
 20000, ABOVE → NO
 - test_resolveTVL() — agent 1 TVL=1500000e6 vs threshold      
 1000000e6, ABOVE → YES
 - test_resolveTrades() — agent 1 trades=200 vs threshold 300, 
  ABOVE → NO
 - test_resolveDrawdown() — agent 1 drawdown=3200 vs threshold 
  5000, BELOW → YES

 Task 2.3: Test RESOLVED_NO claim by NO bettor

 File: smart-contracts/test/PredictionMarket.t.sol
 - test_claimNoWinnerPayout() — create market resolving NO,    
 Alice bets NO, Bob bets YES, resolve, Alice claims full pool, 
  Bob gets PM__NothingToClaim

 Task 2.4: Event emission tests (vm.expectEmit)

 File: smart-contracts/test/PredictionMarket.t.sol
 - test_createMarketEmitsEvent() — MarketCreated
 - test_betYesEmitsEvent() — BetPlaced
 - test_resolveEmitsMarketResolvedEvent() — MarketResolved
 - test_claimEmitsEvent() — Claimed

 File: smart-contracts/test/AgentBondingCurve.t.sol
 - test_buyEmitsTokensBoughtEvent() — TokensBought
 - test_adjustSlopeEmitsEvent() — SlopeAdjusted

 File: smart-contracts/test/AgentMetrics.t.sol
 - test_updateMetricsEmitsEvent() — MetricsUpdated

 Task 2.5: Test multiple bets accumulation

 File: smart-contracts/test/PredictionMarket.t.sol
 - test_multipleBetsAccumulate() — Alice bets YES 3 times,     
 assert yesStakes sums correctly

 Task 2.6: Test betting on non-OPEN market

 File: smart-contracts/test/PredictionMarket.t.sol
 - test_betOnResolvedMarketReverts() — PM__MarketNotOpen       
 - test_betOnCancelledMarketReverts() — PM__MarketNotOpen      

 Task 2.7: Fix missing AgentMetrics assertions

 File: smart-contracts/test/AgentMetrics.t.sol
 - In test_UpdateMetrics(): add assertEq(m.sharpeRatioScaled,  
 ...) and assertEq(m.tvlManaged, ...)

 Task 2.8: Test non-owner access control

 File: smart-contracts/test/AgentBondingCurve.t.sol
 - test_nonOwnerCannotSetCurveAdjuster() —
 OwnableUnauthorizedAccount

 File: smart-contracts/test/BondingCurveFactory.t.sol
 - test_nonOwnerCannotCreateCurve() —
 OwnableUnauthorizedAccount (after Task 1.6)

 Task 2.9: Test ERC20 transfer then sell

 File: smart-contracts/test/AgentBondingCurve.t.sol
 - test_transferAndSell() — buy, transfer half to another      
 address, recipient sells, verify refund

 Task 2.10: Reentrancy attack test

 File: smart-contracts/test/PredictionMarket.t.sol
 - Create ReentrantAttacker contract that tries to re-enter    
 claim() in its receive()
 - test_reentrancyAttackBlocked() — attack contract bets,      
 market resolves, claim triggers reentrant call which fails    

 Task 2.11: PredictionMarket fuzz tests

 New file: smart-contracts/test/PredictionMarket.fuzz.t.sol    
 - testFuzz_betRandomAmount(uint256 amount) — bound [0.001     
 ETH, 100 ETH], verify stakes
 - testFuzz_resolutionThreshold(int256 threshold) — random     
 thresholds, resolve should never revert
 - testFuzz_multipleUsersBetting(uint8 numUsers) — 2-20 random 
  users, verify totalYes + totalNo == contract balance

 Task 2.12: PredictionMarket invariant tests

 New file:
 smart-contracts/test/PredictionMarket.invariant.t.sol
 - Handler with bet(amount, isYes) action
 - invariant_contractBalanceMatchesStakes() —
 address(pm).balance == totalYes + totalNo while OPEN
 - invariant_noDoubleClaim() — claimed mapping prevents double 
  payouts

 Verification after Phase 2: forge test -vvv — expect ~100+    
 tests passing. forge test --gas-report for gas analysis.      

 ---
 Phase 3: CRE Simulation Scripts (3 tasks)

 Task 3.1: Foundry one-shot simulation script

 New file: smart-contracts/script/SimulateCRE.s.sol
 - Reads AGENT_METRICS, BONDING_CURVE_FACTORY,
 PREDICTION_MARKET from env
 - _updateMetrics() — writes realistic metrics for agents 1-3  
 (simulates Performance Tracker)
 - _adjustSlopes() — reads metrics, computes slope using same  
 formula as CRE workflow, calls adjustSlope() (simulates Curve 
  Adjuster)
 - _resolveMarkets() — iterates allMarketIds, resolves any     
 past deadline (simulates Market Resolver)
 - Usage: forge script script/SimulateCRE.s.sol --rpc-url $RPC 
  --broadcast

 Task 3.2: Node.js continuous simulation script

 New file: scripts/simulate-cre.ts
 - Uses viem + shared ABIs from workflows/contracts/abi/       
 - Holds in-memory metrics state that evolves each tick:       
   - ROI: ±500-2000 bps (random walk)
   - Win rate: ±50-200 bps
   - Trades: +1-5 per tick
   - TVL: ±1-5%
   - Sharpe: derived from ROI
   - Drawdown: ±20-100 bps
 - Each tick (every 30s):
   a. Evolve metrics → call updateMetrics() on-chain
   b. Compute new slope → call adjustSlope() on-chain
   c. Check expired markets → call resolve() on-chain
 - Run: npx tsx scripts/simulate-cre.ts

 Task 3.3: Scripts package.json + .env.example

 New file: scripts/package.json — dependencies: viem, tsx      
 New file: scripts/.env.example — PRIVATE_KEY, RPC_URL,        
 contract addresses

 Verification after Phase 3: Run SimulateCRE.s.sol on Tenderly 
  fork, verify metrics update. Run simulate-cre.ts for 2       
 minutes, verify metrics evolve and slopes adjust.

 ---
 Phase 4: Documentation (2 tasks)

 Task 4.1: Update README Known Limitations with fixes applied  

 File: README.md — update the "Known Limitations" section to   
 note which were fixed

 Task 4.2: Create security audit doc

 New file: docs/SECURITY_AUDIT.md — all vulnerabilities found, 
  severity ratings, fixes applied, remaining known
 limitations, test coverage summary

 ---
 Batch Plan

 Batch 1 (Tasks 1.1–1.7): Security fixes → run forge build &&  
 forge test
 Batch 2 (Tasks 2.1–2.6): High-priority test gaps → run forge  
 test -vvv
 Batch 3 (Tasks 2.7–2.12): Remaining tests + fuzz/invariant →  
 run forge test -vvv
 Batch 4 (Tasks 3.1–3.3): CRE simulation scripts
 Batch 5 (Tasks 4.1–4.2): Documentation
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌