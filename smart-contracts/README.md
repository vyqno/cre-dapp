# AgentIndex Protocol - Smart Contracts

On-chain infrastructure for a decentralized AI agent performance marketplace. Agents are registered, their performance is verified by **Chainlink CRE (Compute Runtime Environment)** workflows, and token prices adjust automatically via bonding curves based on real performance data.

Built for the **Chainlink Convergence Hackathon** (Feb 6 - Mar 1, 2026).

## Architecture

```
                    +-----------------+
                    | Chainlink CRE   |
                    | (DON Consensus) |
                    +--------+--------+
                             |
                    updateMetrics() / adjustSlope()
                             |
+----------------+  +--------v--------+  +--------------------+
| AgentRegistry  |  |  AgentMetrics   |  | BondingCurveFactory|
| (Identity)     |  |  (Performance)  |  | (Deploys Curves)   |
+----------------+  +-----------------+  +---------+----------+
                                                   |
                                          +--------v--------+
                                          |AgentBondingCurve|
                                          | (ERC-20 Token)  |
                                          | buy() / sell()  |
                                          +-----------------+
```

## Contracts

| Contract | Description | Size |
|----------|-------------|------|
| `AgentRegistry` | On-chain identity registry. Auto-incrementing IDs, unique wallet mapping, creator-only deactivation. | 3,882 bytes |
| `AgentMetrics` | CRE-verified performance storage. ROI, win rate, drawdown, Sharpe ratio, TVL, trade count. | 2,852 bytes |
| `AgentBondingCurve` | ERC-20 token with linear bonding curve pricing. `price = basePrice + slope * supply`. CRE adjusts slope based on performance. | 6,448 bytes |
| `BondingCurveFactory` | Deploys one `AgentBondingCurve` per agent. Enforces uniqueness. | 8,203 bytes |

## Deployed Addresses (Tenderly Sepolia Virtual TestNet)

**Chain ID:** 11155111 (Sepolia)
**RPC:** Tenderly Virtual TestNet

| Contract | Address |
|----------|---------|
| AgentRegistry | `0xdBfD38820686b738fc80E7aD26566F4B77c1B92D` |
| AgentMetrics | `0xF37DA4260891042bEF41e9434e1c1dEf811b5412` |
| BondingCurveFactory | `0x5Db2bEB5465Cdd6794f6AF404cd5d4b19a0f9570` |
| Curve 1 - AlphaYield (AYS) | `0x2216b6fed45De015c17969E6de540350D74Fc00c` |
| Curve 2 - MomentumTrader (MTS) | `0xE15d1bD9413F8c5b58a230ca1c90418092fF4E9b` |
| Curve 3 - StableHarvester (SHS) | `0x40bfF11cE143c739dF976a2ACB109fFd9457B1b1` |

## Security

### Standards Followed

- **Custom errors** across all contracts (gas-efficient reverts, no string storage)
- **OpenZeppelin 5.5.0**: ERC20, Ownable, ReentrancyGuard, Address.sendValue()
- **CEI pattern** (Checks-Effects-Interactions) in all state-changing functions
- **Reserve solvency invariant**: reserve always covers full token sellback
- **Solvency-checked slope adjustment**: slope increases blocked if they would cause insolvency
- **Whole-token granularity**: all operations snap to 1e18 multiples to prevent precision attacks
- **AA/multisig compatible**: uses `Address.sendValue()` instead of `.transfer()` (no 2300 gas limit)
- **MAX_SLOPE cap**: prevents extreme price manipulation (0.01 ETH per token)
- **Input validation**: zero-address checks, bounds checking, constructor validation

### Audit Findings (Self-Audit, Fixed)

| Severity | Issue | Fix |
|----------|-------|-----|
| CRITICAL | `.transfer()` breaks smart contract wallets | Replaced with OZ `Address.sendValue()` |
| CRITICAL | Slope increase can cause insolvency | Added solvency check in `adjustSlope()` |
| CRITICAL | No minimum buy protection | Added `MIN_BUY_TOKENS = 1e18` |
| MEDIUM | `setCurveAdjuster` accepts `address(0)` | Added zero-address validation |
| MEDIUM | Factory constructor unvalidated | Added `basePrice > 0` and `slope <= MAX_SLOPE` checks |
| MEDIUM | Metrics accept invalid percentages | Added `winRateBps <= 10000`, `maxDrawdownBps <= 10000` |

## Test Suite

**66 tests passing** across 7 suites (unit, fuzz, invariant, integration).

```
forge test --summary
```

```
+--------------------------------+--------+--------+---------+
| Test Suite                     | Passed | Failed | Skipped |
+================================+========+========+=========+
| AgentBondingCurveTest          | 18     | 0      | 0       |
| AgentBondingCurveFuzzTest      | 9      | 0      | 0       |
| AgentBondingCurveInvariantTest | 5      | 0      | 0       |
| IntegrationTest                | 9      | 0      | 0       |
| AgentRegistryTest              | 10     | 0      | 0       |
| AgentMetricsTest               | 9      | 0      | 0       |
| BondingCurveFactoryTest        | 6      | 0      | 0       |
+--------------------------------+--------+--------+---------+
| TOTAL                          | 66     | 0      | 0       |
+--------------------------------+--------+--------+---------+
```

### Test Breakdown

**Unit Tests (18)** - `AgentBondingCurve.t.sol`
- Buy/sell mechanics, price increases, reserve tracking
- Constructor validation (zero base price, excessive slope)
- Access control (only adjuster can change slope)
- Smart contract wallet compatibility (Address.sendValue)
- Multi-buyer independent balances
- Partial sell then buy again

**Fuzz Tests (9)** - `AgentBondingCurve.fuzz.t.sol` (1,000 runs each)
- Random buy amounts, buy-then-sell-all, partial sell solvency
- Multiple buyers LIFO ordering, price monotonicity
- Buy-sell symmetry, slope adjustment bounds
- Slope increase solvency preservation, tiny buy amounts

**Invariant Tests (5)** - `AgentBondingCurve.invariant.t.sol` (256 runs, 15 depth)
- Reserve solvency (with integer rounding tolerance)
- ETH balance covers tracked reserve
- Price floor (never below basePrice)
- Slope bounds (never exceeds MAX_SLOPE)
- Whole-token supply (totalSupply % 1e18 == 0)

**Integration Tests (9)** - `Integration.t.sol`
- Full agent lifecycle (register -> curve -> buy -> metrics -> sell)
- Slope decrease for poor performers
- Solvency check blocks dangerous slope increases
- Multi-agent ecosystem (3 agents, metrics, trading)
- Deactivated agent tokens still tradable
- Zero slope flat pricing
- Edge cases (empty arrays, long strings, non-existent agents)

### CI Profile

```toml
[profile.ci]
fuzz.runs = 10000
invariant.runs = 512
invariant.depth = 25
```

## Gas Report

| Contract | Function | Min | Avg | Median | Max |
|----------|----------|-----|-----|--------|-----|
| **AgentBondingCurve** | | | | | |
| | `buy()` | 26,536 | 118,290 | 130,181 | 135,109 |
| | `sell()` | 26,722 | 45,521 | 46,996 | 55,945 |
| | `adjustSlope()` | 23,687 | 30,201 | 32,185 | 32,699 |
| | `currentPrice()` | 6,842 | 6,842 | 6,842 | 6,842 |
| | `setCurveAdjuster()` | 23,822 | 46,598 | 47,510 | 47,510 |
| **AgentMetrics** | | | | | |
| | `updateMetrics()` | 24,583 | 209,254 | 253,548 | 271,008 |
| | `getMetrics()` | 15,661 | 15,661 | 15,661 | 15,661 |
| | `getBatchMetrics()` | 768 | 32,012 | 47,634 | 47,634 |
| | `setAuthorizedWriter()` | 23,763 | 46,204 | 47,451 | 47,451 |
| **AgentRegistry** | | | | | |
| | `registerAgent()` | 23,563 | 251,306 | 250,845 | 980,709 |
| | `deactivateAgent()` | 23,676 | 25,067 | 25,263 | 25,870 |
| | `getActiveAgentIds()` | 12,139 | 12,139 | 12,139 | 12,139 |
| **BondingCurveFactory** | | | | | |
| | `createCurve()` | 25,192 | 1,203,912 | 1,293,000 | 1,293,072 |
| | `getAllAgentIds()` | 9,423 | 9,423 | 9,423 | 9,423 |

**Deployment Costs:**

| Contract | Gas | Size |
|----------|-----|------|
| AgentBondingCurve | 1,312,362 | 6,448 bytes |
| AgentMetrics | 661,319 | 2,852 bytes |
| AgentRegistry | 886,339 | 3,882 bytes |
| BondingCurveFactory | 1,817,596 | 8,203 bytes |

## Bonding Curve Math

Linear bonding curve with CRE-adjustable slope:

```
currentPrice = basePrice + slope * supply

buyCost(tokens) = basePrice * tokens + slope * tokens * (2 * supply + tokens) / 2

sellRefund(tokens) = basePrice * tokens + slope * tokens * (2 * newSupply + tokens) / 2
```

- **basePrice**: Floor price (0.0001 ETH default)
- **slope**: Price sensitivity, adjusted by CRE based on agent performance
- **Solvency invariant**: `reserveBalance >= sellRefund(totalSupply)` always holds

When CRE detects strong agent performance, it increases the slope (tokens appreciate faster). When performance degrades, slope decreases (tokens depreciate). Slope increases are blocked if they would violate the solvency invariant.

## Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Tenderly account (for Virtual TestNet deployment)

### Build & Test

```bash
forge build
forge test
forge test --gas-report
```

### Deploy to Tenderly

```bash
# 1. Create .env
cp .env.example .env
# Set PRIVATE_KEY and TENDERLY_VNET_RPC

# 2. Fund deployer (Tenderly faucet auto-funds, or use tenderly_setBalance)

# 3. Deploy
forge script script/Deploy.s.sol --rpc-url $TENDERLY_VNET_RPC --broadcast --slow

# 4. Copy BONDING_CURVE_FACTORY from output to .env

# 5. Run on-chain E2E simulation
forge script script/SimulateTrades.s.sol --rpc-url $TENDERLY_VNET_RPC --broadcast --slow
```

### Project Structure

```
smart-contracts/
  src/
    AgentBondingCurve.sol    # ERC-20 bonding curve token
    AgentMetrics.sol         # CRE-verified performance data
    AgentRegistry.sol        # Agent identity registry
    BondingCurveFactory.sol  # Deploys curves per agent
  test/
    AgentBondingCurve.t.sol          # Unit tests (18)
    AgentBondingCurve.fuzz.t.sol     # Fuzz tests (9)
    AgentBondingCurve.invariant.t.sol# Invariant tests (5)
    AgentMetrics.t.sol               # Unit tests (9)
    AgentRegistry.t.sol              # Unit tests (10)
    BondingCurveFactory.t.sol        # Unit tests (6)
    Integration.t.sol                # E2E tests (9)
  script/
    Deploy.s.sol             # Full deploy + seed demo data
    SimulateTrades.s.sol     # On-chain E2E simulation
```

## Tech Stack

- **Solidity 0.8.24** with custom errors
- **OpenZeppelin 5.5.0** (ERC20, Ownable, ReentrancyGuard, Address)
- **Foundry** (Forge, Cast, Anvil)
- **Chainlink CRE** for off-chain performance verification
- **Tenderly Virtual TestNet** for deployment and simulation

## Author

**Hitesh (vyqno)** 
