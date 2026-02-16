<div align="center">

# AgentIndex

### Verified Performance Analytics for On-Chain AI Agents

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.5.0-4E5EE4?logo=openzeppelin)](https://openzeppelin.com/)
[![Foundry](https://img.shields.io/badge/Foundry-Forge-DEA584)](https://book.getfoundry.sh/)
[![Chainlink CRE](https://img.shields.io/badge/Chainlink-CRE-375BD2?logo=chainlink)](https://chain.link/)
[![Tests](https://img.shields.io/badge/Tests-66%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/License-MIT-blue)]()

**40,000+ AI agents operate on-chain. Nobody can tell you which ones are good.**

AgentIndex fixes that. We track what agents *actually do* — not what they claim.

---

> **Note:** This project is under active development for the Chainlink Convergence Hackathon (Feb 6 - Mar 1, 2026). Expect frequent changes across all modules.

---

</div>

## TODO

- [x] Project setup (Foundry, OpenZeppelin 5.5.0, Tenderly Virtual TestNet)
- [x] `AgentRegistry` — on-chain agent identity, unique IDs, wallet mapping
- [x] `AgentMetrics` — CRE-verified performance storage (ROI, win rate, drawdown, Sharpe, TVL)
- [x] `AgentBondingCurve` — ERC-20 linear bonding curve with CRE-adjustable slope
- [x] `BondingCurveFactory` — deploys one curve per agent, enforces uniqueness
- [x] Custom errors across all 4 contracts (gas-efficient reverts)
- [x] OpenZeppelin `Address.sendValue()` for ETH transfers (AA/multisig safe)
- [x] CEI pattern, ReentrancyGuard, constructor validation, input bounds
- [x] Reserve solvency invariant + solvency-checked slope adjustment
- [x] Unit tests — 18 (AgentBondingCurve) + 10 (Registry) + 9 (Metrics) + 6 (Factory)
- [x] Fuzz tests — 9 tests, 1,000 runs each
- [x] Invariant tests — 5 invariants, 256 runs, 15 depth
- [x] Integration / E2E tests — 9 tests (full agent lifecycle)
- [x] Deploy to Tenderly Sepolia Virtual TestNet
- [x] On-chain E2E simulation (real transactions, assertions on deployed contracts)
- [ ] Security audit (partial — self-audited, 6 issues found and fixed, no external audit)
- [ ] CRE workflow — performance tracker (scaffolded, not wired to live contracts yet)
- [ ] CRE workflow — bonding curve slope adjuster (not started)
- [ ] Frontend — leaderboard, agent detail, portfolio pages (scaffolded, using mock data)
- [ ] Frontend — wire to real deployed contracts (currently mock)
- [ ] Prediction markets (not started)
- [ ] x402 paywalled API (not started)
- [ ] Demo video
- [ ] Final submission

## Deployed Contracts

**Network:** Tenderly Sepolia Virtual TestNet (Chain ID: 11155111)

```
AgentRegistry:       0xdBfD38820686b738fc80E7aD26566F4B77c1B92D
AgentMetrics:        0xF37DA4260891042bEF41e9434e1c1dEf811b5412
BondingCurveFactory: 0x5Db2bEB5465Cdd6794f6AF404cd5d4b19a0f9570
Curve 1 (AYS):       0x2216b6fed45De015c17969E6de540350D74Fc00c
Curve 2 (MTS):       0xE15d1bD9413F8c5b58a230ca1c90418092fF4E9b
Curve 3 (SHS):       0x40bfF11cE143c739dF976a2ACB109fFd9457B1b1
```

## Test Suite (66/66 passing)

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
+--------------------------------+--------+--------+---------+
| TOTAL                          | 66     | 0      | 0       |
+--------------------------------+--------+--------+---------+
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24, OpenZeppelin 5.5.0, Foundry |
| Oracle / Compute | Chainlink CRE |
| Frontend | Next.js, thirdweb SDK, Recharts, TailwindCSS |
| Testnet | Tenderly Virtual TestNet (Sepolia fork) |

---

<div align="center">

**Built for the Chainlink Convergence Hackathon 2026**

by **Hitesh (vyqno)**

</div>
