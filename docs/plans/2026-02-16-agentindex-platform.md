# AgentIndex — AI Agent Analytics Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI agent analytics platform where CRE workflows fetch, verify, and publish real on-chain performance data for AI agents — with optional bonding curve trading and prediction markets on top.

**Architecture:** CRE workflows are the core engine — they fetch agent transaction data from external APIs (Moralis, CoinGecko), calculate performance metrics (ROI, win rate, drawdown), reach DON consensus, and write verified results on-chain. Smart contracts store agent identity (ERC-8004 pattern), metrics, bonding curves, and prediction markets. The frontend (Next.js + thirdweb) displays real-time agent rankings, performance charts, and trading UI. x402 paywalls the analytics API for machine-to-machine monetization.

**Tech Stack:**
- Smart Contracts: Solidity 0.8.20+, Foundry (forge)
- CRE Workflows: TypeScript, @chainlink/cre-sdk, viem, zod
- Frontend: Next.js 16, React 19, thirdweb SDK v5, TailwindCSS 4, Recharts
- Demo Agents: Coinbase AgentKit (TypeScript)
- API Layer: x402 (@x402/next middleware)
- Testing: Tenderly Virtual TestNets, Foundry tests
- Data Sources: Moralis DeFi API, CoinGecko API, block explorer APIs

**Reference Materials (read these for context):**
- Hackathon rules & tracks: `.references/docs/hackathon-context.md`
- Winning patterns: `.references/prev-winners/WINNERS-PRD.md`
- Crypto trends & ERC standards: `.references/docs/BLOCKCHAIN_CRYPTO_TRENDS_FEB_2026.md`
- Tech research (thirdweb, AgentKit, x402, ERC-8004, CRE limits): `.references/docs/TECH-RESEARCH.md`
- Competitor analysis (Virtuals, AIXBT, Spectral, CRE limits, bonding curves): `.references/docs/competitor-and-feasibility-research.md`
- Strategy notes: `.references/docs/strategies.md`
- Existing CRE workflow example (Proof of Reserves): `workflows/workflow-01/main.ts` (391 lines — use this as the pattern for all CRE workflows)
- Existing ABI export pattern: `workflows/contracts/abi/` (use this pattern for new contract ABIs)
- Winner repos for code reference: `.references/prev-winners/YieldCoin-35K-GrandPrize/`, `.references/prev-winners/Azurance-15K-DeFi1st/`, `.references/prev-winners/BuckyFinance-15K-Financial1st/`

**Hackathon Track Targets:**
- Primary: CRE & AI ($10.5K / $6.5K)
- Secondary: DeFi & Tokenization ($12K / $8K)
- Tertiary: Prediction Markets ($10K / $6K)
- Sponsor: thirdweb x CRE (2 months Growth plan)
- Sponsor: Tenderly Virtual TestNets ($5K / $2.5K)
- Floor: Top 10 ($1.5K)

**CRE Constraints (respect these):**
- Execution timeout: 10 seconds max
- HTTP calls per execution: 5 max
- Response size: 256 bytes max
- Memory: 128 MB
- Cron minimum: 30 seconds
- LLM calls: must return structured JSON for consensus

---

## Phase 0: Project Setup & Dependencies

> Get all workspaces configured with correct dependencies before writing any code.

---

### Task 0.1: Install Smart Contract Dependencies

**Files:**
- Modify: `smart-contracts/foundry.toml`
- Run commands in: `smart-contracts/`

**Step 1: Update foundry.toml for Solidity 0.8.20+ and OpenZeppelin**

Replace contents of `smart-contracts/foundry.toml` with:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"
optimizer = true
optimizer_runs = 200
via_ir = false

[fmt]
line_length = 120
```

**Step 2: Install OpenZeppelin contracts**

Run: `cd S:\convergence-hackathon\smart-contracts && forge install OpenZeppelin/openzeppelin-contracts --no-commit`

**Step 3: Install forge-std (if not present)**

Run: `cd S:\convergence-hackathon\smart-contracts && forge install foundry-rs/forge-std --no-commit`

**Step 4: Create remappings.txt**

Create `smart-contracts/remappings.txt`:
```
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
forge-std/=lib/forge-std/src/
```

**Step 5: Verify setup compiles**

Run: `cd S:\convergence-hackathon\smart-contracts && forge build`
Expected: Compilation successful

**Step 6: Delete Counter boilerplate**

Delete: `smart-contracts/src/Counter.sol`, `smart-contracts/test/Counter.t.sol`, `smart-contracts/script/Counter.s.sol`

**Step 7: Commit**

```bash
cd S:\convergence-hackathon && git add smart-contracts/ && git commit -m "chore(contracts): configure Foundry for AgentIndex with OpenZeppelin"
```

---

### Task 0.2: Install Frontend Dependencies

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install thirdweb + UI + charting dependencies**

Run:
```bash
cd S:\convergence-hackathon\frontend && npm install thirdweb @x402/next recharts lucide-react clsx tailwind-merge class-variance-authority
```

**Step 2: Install shadcn/ui init (for clean components)**

Run:
```bash
cd S:\convergence-hackathon\frontend && npx shadcn@latest init -d
```

Select: New York style, Zinc color, CSS variables = yes

**Step 3: Add shadcn components we need**

Run:
```bash
cd S:\convergence-hackathon\frontend && npx shadcn@latest add button card badge tabs table dialog input select separator skeleton
```

**Step 4: Verify build works**

Run: `cd S:\convergence-hackathon\frontend && npm run build`
Expected: Build successful

**Step 5: Commit**

```bash
cd S:\convergence-hackathon && git add frontend/ && git commit -m "chore(frontend): add thirdweb, shadcn, recharts dependencies"
```

---

### Task 0.3: Create CRE Workflow Workspace for AgentIndex

**Files:**
- Create: `workflows/agentindex-tracker/` (new workflow directory)

**Step 1: Create workflow directory structure**

```bash
mkdir -p S:\convergence-hackathon\workflows\agentindex-tracker
```

**Step 2: Create package.json**

Create `workflows/agentindex-tracker/package.json`:
```json
{
  "name": "agentindex-tracker",
  "version": "1.0.0",
  "main": "dist/main.js",
  "private": true,
  "scripts": {
    "postinstall": "bunx cre-setup"
  },
  "license": "UNLICENSED",
  "dependencies": {
    "@chainlink/cre-sdk": "^1.0.7",
    "viem": "2.34.0",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "@types/bun": "1.2.21"
  }
}
```

**Step 3: Create tsconfig.json**

Create `workflows/agentindex-tracker/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": ".",
    "types": ["bun"]
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create workflow.yaml**

Create `workflows/agentindex-tracker/workflow.yaml`:
```yaml
staging-settings:
  user-workflow:
    workflow-name: "agentindex-tracker-staging"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.staging.json"
    secrets-path: ""

production-settings:
  user-workflow:
    workflow-name: "agentindex-tracker-production"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.production.json"
    secrets-path: ""
```

**Step 5: Install dependencies**

Run: `cd S:\convergence-hackathon\workflows\agentindex-tracker && bun install`

**Step 6: Commit**

```bash
cd S:\convergence-hackathon && git add workflows/agentindex-tracker/ && git commit -m "chore(workflows): scaffold agentindex-tracker CRE workspace"
```

---

### Task 0.4: Set Up Tenderly Virtual TestNet

**Step 1: Create a Tenderly account (if not already) at https://dashboard.tenderly.co**

**Step 2: Create a Virtual TestNet**

- Go to Tenderly Dashboard → Virtual TestNets → Create
- Fork from: Ethereum Sepolia
- Enable: Unlimited faucet, State sync
- Note the RPC URL provided

**Step 3: Update project.yaml with Tenderly RPC**

Modify `workflows/project.yaml` — add the Tenderly Virtual TestNet RPC URL alongside existing Sepolia RPC.

**Step 4: Fund test wallets**

Use Tenderly's unlimited faucet to fund your deployer wallet with ETH on the Virtual TestNet.

---

## Phase 1: Smart Contracts — Core (AgentRegistry + AgentMetrics)

> These are the foundation. Everything else builds on top.
> Reference: Study `workflows/contracts/abi/` for the ABI export pattern we'll follow.

---

### Task 1.1: AgentRegistry Contract

**Files:**
- Create: `smart-contracts/src/AgentRegistry.sol`
- Create: `smart-contracts/test/AgentRegistry.t.sol`

**Context:** This contract registers AI agents with on-chain identity. It stores agent metadata (wallet address, strategy type, name, chains it operates on). Follows ERC-8004 identity pattern but simplified for hackathon scope. Each agent gets a unique ID (auto-incrementing uint256).

**Step 1: Write the test**

Create `smart-contracts/test/AgentRegistry.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;
    address public owner = address(this);
    address public agentWallet = address(0x1234);

    function setUp() public {
        registry = new AgentRegistry();
    }

    function test_RegisterAgent() public {
        uint256 agentId = registry.registerAgent(
            agentWallet,
            "YieldBot Alpha",
            "yield_farming",
            "Automated yield farming across Aave and Compound"
        );

        assertEq(agentId, 1);

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.wallet, agentWallet);
        assertEq(agent.name, "YieldBot Alpha");
        assertEq(agent.strategyType, "yield_farming");
        assertEq(agent.creator, owner);
        assertTrue(agent.isActive);
        assertGt(agent.registeredAt, 0);
    }

    function test_RegisterMultipleAgents() public {
        uint256 id1 = registry.registerAgent(agentWallet, "Bot1", "trading", "desc1");
        uint256 id2 = registry.registerAgent(address(0x5678), "Bot2", "arbitrage", "desc2");

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(registry.totalAgents(), 2);
    }

    function test_DeactivateAgent() public {
        uint256 agentId = registry.registerAgent(agentWallet, "Bot1", "trading", "desc1");
        registry.deactivateAgent(agentId);

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertFalse(agent.isActive);
    }

    function test_OnlyCreatorCanDeactivate() public {
        uint256 agentId = registry.registerAgent(agentWallet, "Bot1", "trading", "desc1");

        vm.prank(address(0x9999));
        vm.expectRevert("Not agent creator");
        registry.deactivateAgent(agentId);
    }

    function test_GetActiveAgents() public {
        registry.registerAgent(agentWallet, "Bot1", "trading", "desc1");
        registry.registerAgent(address(0x5678), "Bot2", "yield_farming", "desc2");
        registry.registerAgent(address(0x9abc), "Bot3", "arbitrage", "desc3");

        uint256[] memory activeIds = registry.getActiveAgentIds();
        assertEq(activeIds.length, 3);
    }

    function test_GetAgentByWallet() public {
        registry.registerAgent(agentWallet, "Bot1", "trading", "desc1");

        uint256 agentId = registry.getAgentIdByWallet(agentWallet);
        assertEq(agentId, 1);
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd S:\convergence-hackathon\smart-contracts && forge test --match-contract AgentRegistryTest -v`
Expected: FAIL — `AgentRegistry.sol` not found

**Step 3: Write the implementation**

Create `smart-contracts/src/AgentRegistry.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    struct Agent {
        uint256 id;
        address wallet;
        address creator;
        string name;
        string strategyType;
        string description;
        bool isActive;
        uint256 registeredAt;
    }

    uint256 public totalAgents;
    mapping(uint256 => Agent) public agents;
    mapping(address => uint256) public walletToAgentId;

    event AgentRegistered(uint256 indexed agentId, address indexed wallet, string name, string strategyType);
    event AgentDeactivated(uint256 indexed agentId);

    function registerAgent(
        address wallet,
        string calldata name,
        string calldata strategyType,
        string calldata description
    ) external returns (uint256) {
        require(walletToAgentId[wallet] == 0, "Wallet already registered");

        totalAgents++;
        uint256 agentId = totalAgents;

        agents[agentId] = Agent({
            id: agentId,
            wallet: wallet,
            creator: msg.sender,
            name: name,
            strategyType: strategyType,
            description: description,
            isActive: true,
            registeredAt: block.timestamp
        });

        walletToAgentId[wallet] = agentId;

        emit AgentRegistered(agentId, wallet, name, strategyType);
        return agentId;
    }

    function deactivateAgent(uint256 agentId) external {
        require(agents[agentId].creator == msg.sender, "Not agent creator");
        agents[agentId].isActive = false;
        emit AgentDeactivated(agentId);
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function getAgentIdByWallet(address wallet) external view returns (uint256) {
        return walletToAgentId[wallet];
    }

    function getActiveAgentIds() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= totalAgents; i++) {
            if (agents[i].isActive) count++;
        }

        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= totalAgents; i++) {
            if (agents[i].isActive) {
                ids[idx] = i;
                idx++;
            }
        }
        return ids;
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd S:\convergence-hackathon\smart-contracts && forge test --match-contract AgentRegistryTest -v`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
cd S:\convergence-hackathon && git add smart-contracts/ && git commit -m "feat(contracts): add AgentRegistry with tests"
```

---

### Task 1.2: AgentMetrics Contract

**Files:**
- Create: `smart-contracts/src/AgentMetrics.sol`
- Create: `smart-contracts/test/AgentMetrics.t.sol`

**Context:** This contract stores performance metrics written by CRE workflows. Only the authorized CRE workflow address (set by owner) can write metrics. Metrics are stored as integers scaled by 1e4 (e.g., 15.25% ROI = 152500). This is what CRE writes to on every cron cycle.

**Step 1: Write the test**

Create `smart-contracts/test/AgentMetrics.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentMetrics.sol";

contract AgentMetricsTest is Test {
    AgentMetrics public metrics;
    address public creWorkflow = address(0xCRE);

    function setUp() public {
        metrics = new AgentMetrics();
        metrics.setAuthorizedWriter(creWorkflow);
    }

    function test_UpdateMetrics() public {
        vm.prank(creWorkflow);
        metrics.updateMetrics(
            1,              // agentId
            152500,         // roiBps (15.25% scaled by 1e4)
            7500,           // winRateBps (75.00%)
            3200,           // maxDrawdownBps (32.00%)
            18500,          // sharpeRatioScaled (1.85 scaled by 1e4)
            1000000e6,      // tvlManaged (1M USDC, 6 decimals)
            150             // totalTrades
        );

        AgentMetrics.Metrics memory m = metrics.getMetrics(1);
        assertEq(m.roiBps, 152500);
        assertEq(m.winRateBps, 7500);
        assertEq(m.maxDrawdownBps, 3200);
        assertEq(m.totalTrades, 150);
        assertGt(m.lastUpdated, 0);
    }

    function test_OnlyAuthorizedWriter() public {
        vm.prank(address(0x9999));
        vm.expectRevert("Not authorized");
        metrics.updateMetrics(1, 100, 100, 100, 100, 100, 100);
    }

    function test_MetricsHistory() public {
        vm.startPrank(creWorkflow);
        metrics.updateMetrics(1, 100, 5000, 1000, 10000, 500e6, 10);

        vm.warp(block.timestamp + 60);
        metrics.updateMetrics(1, 200, 6000, 900, 12000, 600e6, 20);
        vm.stopPrank();

        assertEq(metrics.getUpdateCount(1), 2);

        AgentMetrics.Metrics memory latest = metrics.getMetrics(1);
        assertEq(latest.roiBps, 200);
        assertEq(latest.totalTrades, 20);
    }

    function test_GetAllAgentMetrics() public {
        vm.startPrank(creWorkflow);
        metrics.updateMetrics(1, 100, 5000, 1000, 10000, 500e6, 10);
        metrics.updateMetrics(2, 200, 6000, 800, 15000, 700e6, 25);
        metrics.updateMetrics(3, 50, 4000, 2000, 8000, 300e6, 5);
        vm.stopPrank();

        uint256[] memory agentIds = new uint256[](3);
        agentIds[0] = 1;
        agentIds[1] = 2;
        agentIds[2] = 3;

        AgentMetrics.Metrics[] memory batch = metrics.getBatchMetrics(agentIds);
        assertEq(batch.length, 3);
        assertEq(batch[1].roiBps, 200);
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd S:\convergence-hackathon\smart-contracts && forge test --match-contract AgentMetricsTest -v`
Expected: FAIL

**Step 3: Write the implementation**

Create `smart-contracts/src/AgentMetrics.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AgentMetrics is Ownable {
    struct Metrics {
        int256 roiBps;           // ROI in basis points * 100 (15.25% = 152500)
        uint256 winRateBps;      // Win rate in basis points (75% = 7500)
        uint256 maxDrawdownBps;  // Max drawdown in basis points
        uint256 sharpeRatioScaled; // Sharpe ratio * 10000
        uint256 tvlManaged;      // Total value locked (token decimals)
        uint256 totalTrades;     // Total trade count
        uint256 lastUpdated;     // Timestamp
    }

    address public authorizedWriter;
    mapping(uint256 => Metrics) public latestMetrics;
    mapping(uint256 => uint256) public updateCounts;
    uint256[] public trackedAgentIds;
    mapping(uint256 => bool) public isTracked;

    event MetricsUpdated(uint256 indexed agentId, int256 roiBps, uint256 winRateBps, uint256 totalTrades);

    constructor() Ownable(msg.sender) {}

    function setAuthorizedWriter(address writer) external onlyOwner {
        authorizedWriter = writer;
    }

    function updateMetrics(
        uint256 agentId,
        int256 roiBps,
        uint256 winRateBps,
        uint256 maxDrawdownBps,
        uint256 sharpeRatioScaled,
        uint256 tvlManaged,
        uint256 totalTrades
    ) external {
        require(msg.sender == authorizedWriter, "Not authorized");

        latestMetrics[agentId] = Metrics({
            roiBps: roiBps,
            winRateBps: winRateBps,
            maxDrawdownBps: maxDrawdownBps,
            sharpeRatioScaled: sharpeRatioScaled,
            tvlManaged: tvlManaged,
            totalTrades: totalTrades,
            lastUpdated: block.timestamp
        });

        updateCounts[agentId]++;

        if (!isTracked[agentId]) {
            trackedAgentIds.push(agentId);
            isTracked[agentId] = true;
        }

        emit MetricsUpdated(agentId, roiBps, winRateBps, totalTrades);
    }

    function getMetrics(uint256 agentId) external view returns (Metrics memory) {
        return latestMetrics[agentId];
    }

    function getUpdateCount(uint256 agentId) external view returns (uint256) {
        return updateCounts[agentId];
    }

    function getBatchMetrics(uint256[] calldata agentIds) external view returns (Metrics[] memory) {
        Metrics[] memory batch = new Metrics[](agentIds.length);
        for (uint256 i = 0; i < agentIds.length; i++) {
            batch[i] = latestMetrics[agentIds[i]];
        }
        return batch;
    }

    function getTrackedAgentIds() external view returns (uint256[] memory) {
        return trackedAgentIds;
    }
}
```

**Step 4: Run tests**

Run: `cd S:\convergence-hackathon\smart-contracts && forge test --match-contract AgentMetricsTest -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
cd S:\convergence-hackathon && git add smart-contracts/ && git commit -m "feat(contracts): add AgentMetrics with CRE writer auth"
```

---

### Task 1.3: Export Contract ABIs for CRE Workflows

**Files:**
- Create: `workflows/contracts/abi/AgentRegistry.ts`
- Create: `workflows/contracts/abi/AgentMetrics.ts`

**Context:** CRE workflows need contract ABIs as TypeScript exports. Follow the exact pattern used in `workflows/contracts/abi/IERC20.ts` and the other existing ABI files.

**Step 1: Build contracts to generate ABIs**

Run: `cd S:\convergence-hackathon\smart-contracts && forge build`

**Step 2: Extract ABIs**

Read the ABI from `smart-contracts/out/AgentRegistry.sol/AgentRegistry.json` and `smart-contracts/out/AgentMetrics.sol/AgentMetrics.json`.

**Step 3: Create TypeScript ABI exports**

Create `workflows/contracts/abi/AgentRegistry.ts` — export the ABI as a const array following the same pattern as `workflows/contracts/abi/ReserveManager.ts`.

Create `workflows/contracts/abi/AgentMetrics.ts` — same pattern.

**Step 4: Update the barrel export**

Modify `workflows/contracts/abi/index.ts` — add:
```typescript
export { default as AgentRegistry } from './AgentRegistry'
export { default as AgentMetrics } from './AgentMetrics'
```

**Step 5: Commit**

```bash
cd S:\convergence-hackathon && git add workflows/contracts/ && git commit -m "feat(workflows): export AgentRegistry and AgentMetrics ABIs"
```

---

## Phase 2: Smart Contracts — Bonding Curves

> Optional trading layer. Agents get their own tokens priced on CRE-verified performance.
> Reference: `.references/docs/competitor-and-feasibility-research.md` — see bonding curve section for math and open-source implementations.

---

### Task 2.1: AgentBondingCurve Contract

**Files:**
- Create: `smart-contracts/src/AgentBondingCurve.sol`
- Create: `smart-contracts/test/AgentBondingCurve.t.sol`

**Context:** A linear bonding curve for each agent. Price = basePrice + (slope * supply). The slope is adjusted by CRE based on agent performance. Better performance → steeper slope → higher price appreciation. Uses ETH (or USDC) as reserve currency. Buy/sell agent tokens directly from the curve.

**Step 1: Write the test**

Create `smart-contracts/test/AgentBondingCurve.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentBondingCurve.sol";

contract AgentBondingCurveTest is Test {
    AgentBondingCurve public curve;
    address public buyer = address(0xBEEF);
    address public curveAdjuster = address(0xCRE);

    function setUp() public {
        curve = new AgentBondingCurve(
            "AgentBot1 Shares",
            "ABS1",
            1,                  // agentId
            0.0001 ether,       // basePrice
            0.00001 ether       // initialSlope
        );
        curve.setCurveAdjuster(curveAdjuster);
        vm.deal(buyer, 100 ether);
    }

    function test_Buy() public {
        vm.prank(buyer);
        uint256 tokensBought = curve.buy{value: 0.01 ether}();

        assertGt(tokensBought, 0);
        assertEq(curve.balanceOf(buyer), tokensBought);
        assertGt(curve.currentPrice(), 0.0001 ether);
    }

    function test_Sell() public {
        vm.startPrank(buyer);
        uint256 tokensBought = curve.buy{value: 0.01 ether}();

        uint256 balanceBefore = buyer.balance;
        curve.sell(tokensBought / 2);
        uint256 balanceAfter = buyer.balance;

        assertGt(balanceAfter, balanceBefore);
        vm.stopPrank();
    }

    function test_AdjustSlope() public {
        uint256 priceBefore = curve.currentPrice();

        vm.prank(curveAdjuster);
        curve.adjustSlope(0.00005 ether); // 5x steeper = agent performing well

        // Price at current supply shouldn't change, but future buys are more expensive
        // Buy some tokens to see effect
        vm.prank(buyer);
        curve.buy{value: 0.01 ether}();

        assertGt(curve.slope(), 0.00001 ether);
    }

    function test_OnlyAdjusterCanChangeSlope() public {
        vm.prank(address(0x9999));
        vm.expectRevert("Not authorized adjuster");
        curve.adjustSlope(0.001 ether);
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd S:\convergence-hackathon\smart-contracts && forge test --match-contract AgentBondingCurveTest -v`
Expected: FAIL

**Step 3: Write the implementation**

Create `smart-contracts/src/AgentBondingCurve.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AgentBondingCurve is ERC20, Ownable {
    uint256 public immutable agentId;
    uint256 public basePrice;
    uint256 public slope;
    uint256 public reserveBalance;
    address public curveAdjuster;

    event TokensBought(address indexed buyer, uint256 amount, uint256 cost);
    event TokensSold(address indexed seller, uint256 amount, uint256 refund);
    event SlopeAdjusted(uint256 oldSlope, uint256 newSlope);

    constructor(
        string memory name,
        string memory symbol,
        uint256 _agentId,
        uint256 _basePrice,
        uint256 _initialSlope
    ) ERC20(name, symbol) Ownable(msg.sender) {
        agentId = _agentId;
        basePrice = _basePrice;
        slope = _initialSlope;
    }

    function setCurveAdjuster(address adjuster) external onlyOwner {
        curveAdjuster = adjuster;
    }

    function currentPrice() public view returns (uint256) {
        uint256 supply = totalSupply() / 1e18;
        return basePrice + (slope * supply);
    }

    function getBuyPrice(uint256 tokenAmount) public view returns (uint256) {
        uint256 supply = totalSupply() / 1e18;
        uint256 tokens = tokenAmount / 1e18;
        // Integral of (basePrice + slope * x) from supply to supply + tokens
        // = basePrice * tokens + slope * (tokens * (2 * supply + tokens)) / 2
        uint256 cost = basePrice * tokens + slope * tokens * (2 * supply + tokens) / 2;
        return cost;
    }

    function getSellRefund(uint256 tokenAmount) public view returns (uint256) {
        uint256 supply = totalSupply() / 1e18;
        uint256 tokens = tokenAmount / 1e18;
        require(tokens <= supply, "Not enough supply");
        uint256 newSupply = supply - tokens;
        uint256 refund = basePrice * tokens + slope * tokens * (2 * newSupply + tokens) / 2;
        return refund;
    }

    function buy() external payable returns (uint256) {
        require(msg.value > 0, "Send ETH to buy");

        // Binary search for token amount that costs msg.value
        uint256 low = 1e18;
        uint256 high = msg.value * 1e18 / basePrice;
        if (high < low) high = low;

        uint256 tokenAmount = low;
        for (uint256 i = 0; i < 50; i++) {
            uint256 mid = (low + high) / 2;
            uint256 cost = getBuyPrice(mid);
            if (cost <= msg.value) {
                tokenAmount = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
            if (low > high) break;
        }

        uint256 cost = getBuyPrice(tokenAmount);
        require(cost <= msg.value, "Insufficient ETH");

        _mint(msg.sender, tokenAmount);
        reserveBalance += cost;

        // Refund excess
        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }

        emit TokensBought(msg.sender, tokenAmount, cost);
        return tokenAmount;
    }

    function sell(uint256 tokenAmount) external {
        require(balanceOf(msg.sender) >= tokenAmount, "Insufficient balance");

        uint256 refund = getSellRefund(tokenAmount);
        require(refund <= reserveBalance, "Insufficient reserves");

        _burn(msg.sender, tokenAmount);
        reserveBalance -= refund;

        payable(msg.sender).transfer(refund);

        emit TokensSold(msg.sender, tokenAmount, refund);
    }

    function adjustSlope(uint256 newSlope) external {
        require(msg.sender == curveAdjuster, "Not authorized adjuster");

        uint256 oldSlope = slope;
        slope = newSlope;

        emit SlopeAdjusted(oldSlope, newSlope);
    }
}
```

**Step 4: Run tests**

Run: `cd S:\convergence-hackathon\smart-contracts && forge test --match-contract AgentBondingCurveTest -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
cd S:\convergence-hackathon && git add smart-contracts/ && git commit -m "feat(contracts): add AgentBondingCurve with CRE-adjustable slope"
```

---

### Task 2.2: BondingCurveFactory Contract

**Files:**
- Create: `smart-contracts/src/BondingCurveFactory.sol`
- Create: `smart-contracts/test/BondingCurveFactory.t.sol`

**Context:** Factory that deploys a new AgentBondingCurve for each registered agent. Only callable by the AgentRegistry or owner.

**Step 1: Write test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BondingCurveFactory.sol";
import "../src/AgentBondingCurve.sol";

contract BondingCurveFactoryTest is Test {
    BondingCurveFactory public factory;

    function setUp() public {
        factory = new BondingCurveFactory(0.0001 ether, 0.00001 ether);
    }

    function test_CreateCurve() public {
        address curveAddr = factory.createCurve(1, "Bot1 Shares", "BOT1");

        AgentBondingCurve curve = AgentBondingCurve(curveAddr);
        assertEq(curve.agentId(), 1);
        assertEq(curve.basePrice(), 0.0001 ether);
    }

    function test_GetCurveForAgent() public {
        address curveAddr = factory.createCurve(1, "Bot1 Shares", "BOT1");
        assertEq(factory.getCurve(1), curveAddr);
    }

    function test_CannotCreateDuplicate() public {
        factory.createCurve(1, "Bot1 Shares", "BOT1");
        vm.expectRevert("Curve already exists");
        factory.createCurve(1, "Bot1 Shares", "BOT1");
    }
}
```

**Step 2: Write implementation**

Create `smart-contracts/src/BondingCurveFactory.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AgentBondingCurve.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BondingCurveFactory is Ownable {
    uint256 public defaultBasePrice;
    uint256 public defaultSlope;

    mapping(uint256 => address) public agentCurves;
    uint256[] public allAgentIds;

    event CurveCreated(uint256 indexed agentId, address curveAddress);

    constructor(uint256 _basePrice, uint256 _slope) Ownable(msg.sender) {
        defaultBasePrice = _basePrice;
        defaultSlope = _slope;
    }

    function createCurve(
        uint256 agentId,
        string calldata name,
        string calldata symbol
    ) external returns (address) {
        require(agentCurves[agentId] == address(0), "Curve already exists");

        AgentBondingCurve curve = new AgentBondingCurve(
            name, symbol, agentId, defaultBasePrice, defaultSlope
        );
        curve.transferOwnership(msg.sender);

        agentCurves[agentId] = address(curve);
        allAgentIds.push(agentId);

        emit CurveCreated(agentId, address(curve));
        return address(curve);
    }

    function getCurve(uint256 agentId) external view returns (address) {
        return agentCurves[agentId];
    }

    function getAllAgentIds() external view returns (uint256[] memory) {
        return allAgentIds;
    }
}
```

**Step 3: Run tests**

Run: `cd S:\convergence-hackathon\smart-contracts && forge test --match-contract BondingCurveFactoryTest -v`
Expected: All 3 tests PASS

**Step 4: Commit**

```bash
cd S:\convergence-hackathon && git add smart-contracts/ && git commit -m "feat(contracts): add BondingCurveFactory"
```

---

### Task 2.3: Deployment Script

**Files:**
- Create: `smart-contracts/script/Deploy.s.sol`

**Context:** Deploys all contracts to Tenderly Virtual TestNet. Registers 3-5 demo agents.

**Step 1: Write deployment script**

Create `smart-contracts/script/Deploy.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentMetrics.sol";
import "../src/BondingCurveFactory.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy core contracts
        AgentRegistry registry = new AgentRegistry();
        AgentMetrics metrics = new AgentMetrics();
        BondingCurveFactory factory = new BondingCurveFactory(0.0001 ether, 0.00001 ether);

        // Log addresses
        console.log("AgentRegistry:", address(registry));
        console.log("AgentMetrics:", address(metrics));
        console.log("BondingCurveFactory:", address(factory));

        vm.stopBroadcast();
    }
}
```

**Step 2: Deploy to Tenderly Virtual TestNet**

Run:
```bash
cd S:\convergence-hackathon\smart-contracts && forge script script/Deploy.s.sol --rpc-url <TENDERLY_VIRTUAL_TESTNET_RPC> --private-key <YOUR_PRIVATE_KEY> --broadcast
```

**Step 3: Save deployed addresses**

Create `smart-contracts/deployments/tenderly.json` with the deployed addresses.

**Step 4: Commit**

```bash
cd S:\convergence-hackathon && git add smart-contracts/ && git commit -m "feat(contracts): add deployment script and deploy to Tenderly"
```

---

## Phase 3: CRE Workflows — Performance Tracker

> This is the CORE of the project. CRE workflows that fetch real agent data, calculate metrics, and write on-chain.
> Reference: Study `workflows/workflow-01/main.ts` for the exact CRE SDK patterns (handler, CronCapability, HTTPClient, EVMClient, ConsensusAggregationByFields).
> Reference: `.references/docs/TECH-RESEARCH.md` — CRE section for SDK capabilities.
> Reference: `.references/docs/competitor-and-feasibility-research.md` — CRE limitations section.

---

### Task 3.1: Performance Tracker Workflow (Cron)

**Files:**
- Create: `workflows/agentindex-tracker/main.ts`
- Create: `workflows/agentindex-tracker/config.staging.json`

**Context:** This is the most important file in the entire project. It's a CRE workflow that runs every 60 seconds. For each tracked agent, it:
1. HTTP fetches the agent's wallet transaction data from a block explorer API
2. HTTP fetches token prices from CoinGecko
3. Computes ROI, win rate, max drawdown
4. Reaches DON consensus on the metrics
5. Writes verified metrics to AgentMetrics.sol on-chain

Follow the EXACT pattern from `workflows/workflow-01/main.ts`. Use the same imports, handler pattern, CronCapability, HTTPClient, EVMClient, and ConsensusAggregationByFields.

**Step 1: Create config.staging.json**

Create `workflows/agentindex-tracker/config.staging.json`:
```json
{
  "schedule": "*/60 * * * * *",
  "agentMetricsAddress": "<DEPLOYED_AGENT_METRICS_ADDRESS>",
  "agentRegistryAddress": "<DEPLOYED_AGENT_REGISTRY_ADDRESS>",
  "agents": [
    {
      "agentId": 1,
      "wallet": "<DEMO_AGENT_1_WALLET>",
      "startingCapitalUsd": 10000
    },
    {
      "agentId": 2,
      "wallet": "<DEMO_AGENT_2_WALLET>",
      "startingCapitalUsd": 10000
    },
    {
      "agentId": 3,
      "wallet": "<DEMO_AGENT_3_WALLET>",
      "startingCapitalUsd": 10000
    }
  ],
  "chainSelectorName": "ethereum-testnet-sepolia",
  "gasLimit": "500000",
  "explorerApiUrl": "https://api-sepolia.etherscan.io/api",
  "priceApiUrl": "https://api.coingecko.com/api/v3"
}
```

**Step 2: Write the workflow**

Create `workflows/agentindex-tracker/main.ts`:

```typescript
import {
    ConsensusAggregationByFields,
    type CronPayload,
    handler,
    CronCapability,
    EVMClient,
    HTTPClient,
    encodeCallMsg,
    getNetwork,
    type HTTPSendRequester,
    median,
    Runner,
    type Runtime,
    TxStatus,
} from '@chainlink/cre-sdk'
import { type Address, encodeFunctionData } from 'viem'
import { z } from 'zod'
import { AgentMetrics } from '../contracts/abi'

// ============================================================
// CONFIG SCHEMA
// ============================================================
const configSchema = z.object({
    schedule: z.string(),
    agentMetricsAddress: z.string(),
    agentRegistryAddress: z.string(),
    agents: z.array(
        z.object({
            agentId: z.number(),
            wallet: z.string(),
            startingCapitalUsd: z.number(),
        }),
    ),
    chainSelectorName: z.string(),
    gasLimit: z.string(),
    explorerApiUrl: z.string(),
    priceApiUrl: z.string(),
})

type Config = z.infer<typeof configSchema>

// ============================================================
// DATA TYPES
// ============================================================
interface AgentPerformance {
    agentId: number
    roiBps: number       // basis points * 100
    winRateBps: number   // basis points
    maxDrawdownBps: number
    sharpeScaled: number // * 10000
    tvlWei: number
    totalTrades: number
}

interface TxData {
    hash: string
    value: string
    isError: string
    functionName: string
    to: string
    from: string
    timeStamp: string
}

// ============================================================
// PERFORMANCE CALCULATION
// ============================================================
function calculatePerformance(
    transactions: TxData[],
    startingCapitalUsd: number,
    ethPriceUsd: number,
): AgentPerformance {
    if (transactions.length === 0) {
        return {
            agentId: 0,
            roiBps: 0,
            winRateBps: 5000,
            maxDrawdownBps: 0,
            sharpeScaled: 0,
            tvlWei: 0,
            totalTrades: 0,
        }
    }

    // Filter to only DeFi-like transactions (non-zero function calls)
    const defiTxs = transactions.filter(
        (tx) => tx.functionName && tx.functionName.length > 0 && tx.isError === '0',
    )

    const totalTrades = defiTxs.length
    const successfulTxs = defiTxs.filter((tx) => tx.isError === '0').length
    const winRateBps = totalTrades > 0 ? Math.round((successfulTxs / totalTrades) * 10000) : 5000

    // Calculate net value flow (simplified P&L)
    let totalInflow = 0
    let totalOutflow = 0
    for (const tx of transactions) {
        const valueEth = parseInt(tx.value) / 1e18
        const valueUsd = valueEth * ethPriceUsd
        if (tx.to.toLowerCase() === transactions[0]?.from?.toLowerCase()) {
            totalInflow += valueUsd
        } else {
            totalOutflow += valueUsd
        }
    }

    const netPnl = totalInflow - totalOutflow
    const roiBps = startingCapitalUsd > 0
        ? Math.round((netPnl / startingCapitalUsd) * 1000000)
        : 0

    // Simplified max drawdown (worst single tx loss as % of capital)
    let maxLoss = 0
    for (const tx of defiTxs) {
        const valueEth = parseInt(tx.value) / 1e18
        const valueUsd = valueEth * ethPriceUsd
        if (valueUsd > maxLoss) maxLoss = valueUsd
    }
    const maxDrawdownBps = startingCapitalUsd > 0
        ? Math.round((maxLoss / startingCapitalUsd) * 10000)
        : 0

    // Simplified Sharpe (ROI / drawdown as proxy for risk-adjusted return)
    const sharpeScaled = maxDrawdownBps > 0
        ? Math.round((roiBps / maxDrawdownBps) * 10000)
        : 0

    const currentBalance = startingCapitalUsd + netPnl
    const tvlWei = Math.round(currentBalance * 1e6) // USDC decimals

    return {
        agentId: 0, // Set by caller
        roiBps,
        winRateBps,
        maxDrawdownBps,
        sharpeScaled,
        tvlWei,
        totalTrades,
    }
}

// ============================================================
// WORKFLOW HANDLER
// ============================================================
handler(
    'agentindex-tracker',
    class {
        config!: Config

        buildTrigger(runtime: Runtime) {
            this.config = configSchema.parse(runtime.config)
            return new CronCapability(this.config.schedule)
        }

        async run(runtime: Runtime, _triggerEvent: CronPayload) {
            const config = this.config
            const httpClient = new HTTPClient(runtime)
            const evmClient = new EVMClient(runtime)

            runtime.logger.info('[AgentIndex] Starting performance tracking cycle')

            // Process ONE agent per cycle (rotate through agents based on timestamp)
            const cycleIndex = Math.floor(Date.now() / 60000) % config.agents.length
            const agent = config.agents[cycleIndex]

            runtime.logger.info(`[AgentIndex] Processing agent ${agent.agentId} (wallet: ${agent.wallet})`)

            // ---- HTTP CALL 1: Fetch agent transactions from block explorer ----
            const txResponse = await httpClient.fetch({
                url: `${config.explorerApiUrl}?module=account&action=txlist&address=${agent.wallet}&startblock=0&endblock=99999999&sort=desc&page=1&offset=50`,
                method: 'GET',
                headers: {},
            })

            let transactions: TxData[] = []
            try {
                const txData = JSON.parse(txResponse.body)
                transactions = txData.result || []
            } catch (e) {
                runtime.logger.error(`[AgentIndex] Failed to parse tx data: ${e}`)
            }

            // ---- HTTP CALL 2: Fetch ETH price from CoinGecko ----
            const priceResponse = await httpClient.fetch({
                url: `${config.priceApiUrl}/simple/price?ids=ethereum&vs_currencies=usd`,
                method: 'GET',
                headers: {},
            })

            let ethPriceUsd = 2500 // fallback
            try {
                const priceData = JSON.parse(priceResponse.body)
                ethPriceUsd = priceData.ethereum?.usd || 2500
            } catch (e) {
                runtime.logger.error(`[AgentIndex] Failed to parse price data: ${e}`)
            }

            // ---- COMPUTE: Calculate performance metrics ----
            const perf = calculatePerformance(transactions, agent.startingCapitalUsd, ethPriceUsd)
            perf.agentId = agent.agentId

            runtime.logger.info(
                `[AgentIndex] Agent ${perf.agentId}: ROI=${perf.roiBps}bps, WinRate=${perf.winRateBps}bps, Trades=${perf.totalTrades}`,
            )

            // ---- CONSENSUS: DON nodes agree on metrics ----
            const consensus = new ConsensusAggregationByFields(runtime, {
                fields: {
                    agentId: { type: 'int', aggregation: median },
                    roiBps: { type: 'int', aggregation: median },
                    winRateBps: { type: 'int', aggregation: median },
                    maxDrawdownBps: { type: 'int', aggregation: median },
                    sharpeScaled: { type: 'int', aggregation: median },
                    tvlWei: { type: 'int', aggregation: median },
                    totalTrades: { type: 'int', aggregation: median },
                },
            })

            const report = await consensus.getReport({
                agentId: perf.agentId,
                roiBps: perf.roiBps,
                winRateBps: perf.winRateBps,
                maxDrawdownBps: perf.maxDrawdownBps,
                sharpeScaled: perf.sharpeScaled,
                tvlWei: perf.tvlWei,
                totalTrades: perf.totalTrades,
            })

            // ---- ON-CHAIN WRITE: Update AgentMetrics contract ----
            const metricsAddress = config.agentMetricsAddress as Address
            const network = getNetwork(config.chainSelectorName)

            const calldata = encodeFunctionData({
                abi: AgentMetrics,
                functionName: 'updateMetrics',
                args: [
                    BigInt(report.agentId),
                    BigInt(report.roiBps),
                    BigInt(report.winRateBps),
                    BigInt(report.maxDrawdownBps),
                    BigInt(report.sharpeScaled),
                    BigInt(report.tvlWei),
                    BigInt(report.totalTrades),
                ],
            })

            const txResult = await evmClient.sendTransaction({
                to: metricsAddress,
                data: calldata,
                network: network,
                gasLimit: BigInt(config.gasLimit),
            })

            if (txResult.status === TxStatus.Success) {
                runtime.logger.info(`[AgentIndex] Metrics written on-chain for agent ${perf.agentId}`)
            } else {
                runtime.logger.error(`[AgentIndex] Failed to write metrics for agent ${perf.agentId}`)
            }
        }
    },
)
```

**Step 3: Create config.production.json (same structure, different addresses)**

Copy `config.staging.json` to `config.production.json`.

**Step 4: Simulate the workflow**

Run: `cd S:\convergence-hackathon\workflows\agentindex-tracker && cre workflow simulate --target staging`
Expected: Workflow runs, fetches data, computes metrics, writes on-chain

**Step 5: Commit**

```bash
cd S:\convergence-hackathon && git add workflows/ && git commit -m "feat(workflows): add agentindex-tracker CRE performance workflow"
```

---

### Task 3.2: Health Monitor Workflow (Cron)

**Files:**
- Create: `workflows/agentindex-health/` (new workflow directory — same setup as Task 0.3)
- Create: `workflows/agentindex-health/main.ts`

**Context:** A second CRE workflow that checks agent liveness every 5 minutes. If an agent hasn't made a transaction in 24 hours, it emits an alert event and marks the agent as inactive. This demonstrates multiple CRE workflow types and shows the "safety" aspect.

Follow the same pattern as Task 3.1 but with:
- Cron schedule: `*/300 * * * * *` (every 5 minutes)
- HTTP: Fetch latest tx timestamp from block explorer
- Compare to current time
- If gap > 24h: write deactivation on-chain

**Implementation:** Same structure as Task 3.1 but simpler — only 1 HTTP call + 1 on-chain write.

**Commit:** `feat(workflows): add agentindex-health monitor workflow`

---

### Task 3.3: Curve Adjuster Workflow (Cron)

**Files:**
- Create: `workflows/agentindex-curves/` (new workflow directory)
- Create: `workflows/agentindex-curves/main.ts`

**Context:** A third CRE workflow that adjusts bonding curve slopes based on agent metrics every 10 minutes. Reads latest metrics from AgentMetrics.sol, calculates new slope based on ROI trend, writes to BondingCurve.adjustSlope().

This is what makes our bonding curves performance-driven (not hype-driven). CRE calculates the slope, not market makers.

**Key formula:**
```
newSlope = defaultSlope * (1 + agentROI / 10000)
```
Positive ROI → steeper slope → price rises faster on buys.
Negative ROI → flatter slope → price rises slower.

**Implementation:** Similar structure. Read on-chain (AgentMetrics), compute new slope, consensus, write on-chain (BondingCurve).

**Commit:** `feat(workflows): add bonding curve adjuster workflow`

---

## Phase 4: Frontend — Core Pages

> Next.js 16 + thirdweb SDK v5 + TailwindCSS + shadcn + Recharts.
> All contract reads use thirdweb `useReadContract`. Wallet connection via thirdweb `ConnectButton`.
> Reference: `.references/docs/TECH-RESEARCH.md` — thirdweb section for SDK patterns.

---

### Task 4.1: thirdweb Provider Setup & Layout

**Files:**
- Create: `frontend/src/lib/thirdweb.ts` (client config)
- Create: `frontend/src/lib/contracts.ts` (contract addresses + ABIs)
- Modify: `frontend/src/app/layout.tsx` (wrap with ThirdwebProvider)
- Create: `frontend/src/components/navbar.tsx`

**Context:** Set up thirdweb client, provider, and contract config. The layout wraps the entire app with ThirdwebProvider. The navbar has ConnectButton + navigation links.

**Key thirdweb v5 patterns:**
```tsx
import { createThirdwebClient } from "thirdweb";
import { ThirdwebProvider, ConnectButton } from "thirdweb/react";
import { useReadContract, useSendTransaction } from "thirdweb/react";
import { getContract } from "thirdweb";
import { sepolia } from "thirdweb/chains";
```

**Step 1:** Create `frontend/src/lib/thirdweb.ts` with client ID from thirdweb dashboard.
**Step 2:** Create `frontend/src/lib/contracts.ts` with deployed addresses and ABIs.
**Step 3:** Update `frontend/src/app/layout.tsx` — wrap children with `<ThirdwebProvider>`.
**Step 4:** Create navbar with `<ConnectButton />` and navigation links (Leaderboard, Markets, Portfolio).
**Step 5:** Verify: `npm run dev` — page loads with thirdweb connect button.

**Commit:** `feat(frontend): setup thirdweb provider, layout, and navbar`

---

### Task 4.2: Landing Page

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Context:** Hero section with project name, tagline, live stats (total agents tracked, total TVL, total trades analyzed). Stats are read from AgentMetrics contract via thirdweb.

**Key elements:**
- Hero: "AgentIndex — Verified Performance Data for AI Agents"
- Subtitle: "The first analytics platform that tracks what AI agents actually do — not what they claim. Powered by Chainlink CRE."
- Live stats cards: Agents Tracked, Total TVL, Metrics Updates, Win Rate Avg
- CTA: "View Leaderboard" → `/leaderboard`
- Built with: Chainlink CRE, thirdweb, ERC-8004, x402 logos/badges

**Commit:** `feat(frontend): add landing page with live stats`

---

### Task 4.3: Agent Leaderboard Page

**Files:**
- Create: `frontend/src/app/leaderboard/page.tsx`
- Create: `frontend/src/components/agent-table.tsx`
- Create: `frontend/src/components/metric-badge.tsx`

**Context:** A sortable table of all tracked agents with their metrics. This is the core page. Reads from AgentRegistry + AgentMetrics contracts.

**Columns:** Rank, Agent Name, Strategy, ROI, Win Rate, Max Drawdown, Sharpe, TVL, Trades, Status
**Sort by:** Any column (default: ROI descending)
**Color coding:** Green for positive ROI, red for negative. Risk badges (Low/Med/High based on drawdown).

**Data fetching:** Use thirdweb `useReadContract` to fetch all agent IDs from AgentRegistry, then batch-fetch metrics from AgentMetrics.

**Commit:** `feat(frontend): add agent leaderboard with sortable metrics table`

---

### Task 4.4: Agent Detail Page

**Files:**
- Create: `frontend/src/app/agent/[id]/page.tsx`
- Create: `frontend/src/components/performance-chart.tsx`
- Create: `frontend/src/components/buy-sell-panel.tsx`

**Context:** Full detail page for a single agent. Shows:
1. Agent info (name, strategy, wallet, registration date)
2. Performance metrics (large cards: ROI, Win Rate, Sharpe, etc.)
3. Performance chart over time (Recharts line chart — mock historical data for hackathon)
4. Buy/Sell panel for agent's bonding curve token
5. Recent transactions list (fetched from block explorer)

**Buy/Sell panel:** Uses thirdweb `useSendTransaction` to call `buy()` and `sell()` on the agent's BondingCurve contract. Shows current price, your balance, estimated cost.

**Commit:** `feat(frontend): add agent detail page with charts and trading`

---

### Task 4.5: Portfolio Dashboard

**Files:**
- Create: `frontend/src/app/portfolio/page.tsx`
- Create: `frontend/src/components/holdings-table.tsx`

**Context:** Shows the connected user's agent token holdings, P&L per holding, and total portfolio value. Reads balances from each AgentBondingCurve contract.

**Commit:** `feat(frontend): add portfolio dashboard`

---

## Phase 5: Prediction Markets (Optional but High-Value)

> Adds the third track (Prediction Markets). Users bet on agent performance.
> If time is tight, skip this phase — the core product (analytics + trading) is enough for 2 tracks + 2 sponsors.

---

### Task 5.1: PredictionMarket Contract

**Files:**
- Create: `smart-contracts/src/PredictionMarket.sol`
- Create: `smart-contracts/test/PredictionMarket.t.sol`

**Context:** A simple binary prediction market. Example: "Will Agent #1's ROI exceed 10% by March 1?" Users deposit ETH on YES or NO. CRE workflow resolves the market using real AgentMetrics data.

**Key functions:**
- `createMarket(agentId, metricType, threshold, deadline)` — create a new market
- `bet(marketId, isYes)` — place a bet (payable)
- `resolve(marketId, outcome)` — only callable by authorized CRE workflow
- `claim(marketId)` — winners claim their share

**Commit:** `feat(contracts): add PredictionMarket with CRE resolution`

---

### Task 5.2: Market Resolver CRE Workflow (Log Trigger)

**Files:**
- Create: `workflows/agentindex-resolver/` (new workflow directory)
- Create: `workflows/agentindex-resolver/main.ts`

**Context:** A CRE workflow triggered by log events (MarketExpired). When a market deadline passes, this workflow:
1. Reads the market's conditions (which agent, which metric, what threshold)
2. Reads the agent's actual metrics from AgentMetrics contract
3. Determines outcome (YES/NO)
4. DON consensus
5. Calls `resolve()` on the PredictionMarket contract

This uses a LOG TRIGGER (different from cron) — demonstrates multiple trigger types to judges.

**Commit:** `feat(workflows): add prediction market resolver (log trigger)`

---

### Task 5.3: Prediction Markets Frontend

**Files:**
- Create: `frontend/src/app/markets/page.tsx`
- Create: `frontend/src/components/market-card.tsx`
- Create: `frontend/src/app/markets/[id]/page.tsx`

**Context:** Browse active markets, place bets, view resolved markets. Each market shows: question, agent involved, current odds (YES/NO pool ratio), deadline, total volume.

**Commit:** `feat(frontend): add prediction markets UI`

---

## Phase 6: x402 API Layer

> Paywalled analytics API. Agents and protocols pay per query via x402 micropayments.
> Reference: `.references/docs/TECH-RESEARCH.md` — x402 section for @x402/next patterns.

---

### Task 6.1: x402 Paywalled API Routes

**Files:**
- Create: `frontend/src/app/api/agent/[id]/route.ts`
- Create: `frontend/src/app/api/leaderboard/route.ts`
- Modify: `frontend/package.json` (already has @x402/next from Task 0.2)

**Context:** Next.js API routes that serve agent metrics data. Protected by x402 middleware — callers must include a payment header. The free dashboard uses direct contract reads (thirdweb), but the API is for machine-to-machine access.

**Pattern:**
```typescript
import { paymentMiddleware } from "@x402/next";

export const GET = paymentMiddleware(handler, {
  price: "$0.001",
  network: "base-sepolia",
  payTo: "<YOUR_WALLET>",
});
```

**Routes:**
- `GET /api/agent/[id]` — returns full metrics for one agent ($0.001 per query)
- `GET /api/leaderboard` — returns top agents ranked by ROI ($0.005 per query)

**Commit:** `feat(api): add x402 paywalled analytics endpoints`

---

## Phase 7: Demo Agents

> Deploy 3-5 AI agents using Coinbase AgentKit that actually transact on Tenderly.
> These generate the REAL transaction data that CRE workflows will track.

---

### Task 7.1: Scaffold AgentKit Demo Agents

**Files:**
- Create: `agents/` directory at project root
- Create: `agents/yield-bot/` — yield farming agent
- Create: `agents/trading-bot/` — simple trading agent
- Create: `agents/arb-bot/` — arbitrage agent

**Step 1:** Scaffold with `npm create onchain-agent@latest` in each directory.
**Step 2:** Configure each agent with a CDP wallet on Sepolia/Tenderly.
**Step 3:** Implement simple strategies:
  - **yield-bot:** Deposits into Aave, harvests rewards periodically
  - **trading-bot:** Buys/sells ETH based on simple price thresholds
  - **arb-bot:** Simulates arbitrage between two DEX pools
**Step 4:** Register each agent in AgentRegistry contract.
**Step 5:** Run agents on Tenderly to generate transaction history.

**Commit:** `feat(agents): add 3 demo AgentKit agents for Tenderly`

---

## Phase 8: Integration, Polish & Demo

---

### Task 8.1: End-to-End Integration Test

**Steps:**
1. Deploy all contracts to Tenderly Virtual TestNet
2. Register 3 demo agents in AgentRegistry
3. Deploy bonding curves for each via BondingCurveFactory
4. Run demo agents (generate transactions for 30+ minutes)
5. Run CRE performance tracker workflow — verify metrics written on-chain
6. Run CRE curve adjuster workflow — verify bonding curve slopes update
7. Open frontend — verify leaderboard shows live agent data
8. Buy/sell agent tokens — verify bonding curve works
9. Create a prediction market — verify it displays
10. Resolve prediction market via CRE — verify settlement
11. Query x402 API — verify payment required and data returned
12. Capture all Tenderly transaction links for submission

---

### Task 8.2: README & Documentation

**Files:**
- Create: `README.md` at project root

**Content:**
- Project overview and problem statement
- Architecture diagram (CRE workflows → contracts → frontend)
- Track submissions (CRE & AI, DeFi, Prediction Markets, thirdweb, Tenderly)
- Links to all Chainlink-related files (CRE workflows, contracts)
- Setup instructions
- Tenderly Virtual TestNet Explorer links
- Tech stack
- Team info

---

### Task 8.3: Demo Video (3-5 minutes)

**Script:**
```
0:00 — Hook: "There are 40,000 AI agents on-chain. Nobody knows which ones are good."
0:20 — Show the problem: Virtuals agents priced on hype, most generate nothing
0:40 — Introduce AgentIndex: "Verified performance data. Powered by Chainlink CRE."
1:00 — Dashboard tour: Agent leaderboard with real metrics
1:30 — Deep dive: Agent detail page, performance charts, real transaction data
2:00 — CRE in action: Show workflow running, metrics updating live
2:30 — Trading: Buy agent tokens, bonding curve responds to CRE-verified performance
3:00 — Prediction market: Create bet, CRE resolves with real data
3:30 — x402 API: Show machine-to-machine payment for analytics data
3:45 — Architecture: CRE workflows diagram, contract addresses, Tenderly links
4:00 — Close: "AgentIndex — the credit score for AI agents. Built on CRE."
```

**Tools:** OBS for screen recording, simple voiceover, no fancy editing needed.

---

### Task 8.4: Submission

**Checklist:**
- [ ] Public GitHub repo with all code
- [ ] README with links to Chainlink-related files
- [ ] 3-5 minute video on YouTube (unlisted or public)
- [ ] CRE workflow simulation or live deployment demonstrated
- [ ] Tenderly Virtual TestNet Explorer links
- [ ] Register on hackathon platform
- [ ] Submit before March 1, 2026 deadline

---

## Summary: What We Build (by priority)

| Priority | What | Phase | Track |
|----------|------|-------|-------|
| **P0 (Must)** | AgentRegistry + AgentMetrics contracts | Phase 1 | Foundation |
| **P0 (Must)** | CRE Performance Tracker workflow | Phase 3 | CRE & AI |
| **P0 (Must)** | Frontend leaderboard + agent detail | Phase 4 | thirdweb |
| **P0 (Must)** | Demo agents on Tenderly | Phase 7 | Tenderly |
| **P1 (Should)** | Bonding curves + trading | Phase 2 | DeFi & Tokenization |
| **P1 (Should)** | CRE Curve Adjuster workflow | Phase 3 | CRE & AI |
| **P1 (Should)** | x402 API | Phase 6 | CRE & AI |
| **P2 (Nice)** | Prediction Markets | Phase 5 | Prediction Markets |
| **P2 (Nice)** | CRE Market Resolver workflow | Phase 5 | CRE & AI |
| **P2 (Nice)** | CRE Health Monitor workflow | Phase 3 | Risk & Compliance |

**If time is tight:** Ship P0 only. That's 1 track (CRE & AI) + 2 sponsors (thirdweb + Tenderly) + Top 10 floor.

**If on schedule:** Add P1. That's 2 tracks + 2 sponsors.

**If ahead:** Add P2. That's 3-4 tracks + 2 sponsors. Maximum prize potential.
