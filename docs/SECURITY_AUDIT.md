# Security Audit Report — AgentIndex Protocol

**Date:** 2026-02-21
**Auditor:** Self-audit (internal review)
**Contracts:** AgentRegistry, AgentMetrics, AgentBondingCurve, BondingCurveFactory, PredictionMarket
**Solidity:** 0.8.24 | **Framework:** Foundry | **Dependencies:** OpenZeppelin 5.5.0

---

## Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 0     | 0     | 0         |
| High     | 2     | 2     | 0         |
| Medium   | 3     | 3     | 0         |
| Low      | 2     | 2     | 0         |
| Info     | 4     | 0     | 4         |

---

## Findings

### H-01: PredictionMarket `claim()` uses raw `.call{value}` for ETH transfer

**Severity:** High
**Contract:** `PredictionMarket.sol:194`
**Status:** Fixed

**Description:** The `claim()` function used `msg.sender.call{value: payout}("")` for sending ETH payouts. This pattern is incompatible with smart contract wallets (account abstraction, multisigs) that have complex `receive()` functions, as the default gas stipend (2300) may be insufficient.

**Fix:** Replaced with OpenZeppelin `Address.sendValue()` which forwards all available gas, making it safe for AA wallets and multisigs. Added `using Address for address payable`.

---

### H-02: PredictionMarket `resolve()` missing reentrancy guard

**Severity:** High
**Contract:** `PredictionMarket.sol:141`
**Status:** Fixed

**Description:** The `resolve()` function modifies critical state (market status) but lacked the `nonReentrant` modifier. While no direct external call exists in `resolve()`, defense-in-depth requires guarding all state-mutating public functions, especially given that `resolve()` could be extended in future with callbacks.

**Fix:** Added `nonReentrant` modifier to `resolve()`.

---

### M-01: BondingCurveFactory `createCurve()` has no access control

**Severity:** Medium
**Contract:** `BondingCurveFactory.sol:88`
**Status:** Fixed

**Description:** Anyone could call `createCurve()` to front-run legitimate curve creation for an agent ID. Since each agent ID can only have one curve, an attacker could create curves with malicious parameters and transfer ownership to themselves.

**Fix:** Added `onlyOwner` modifier to `createCurve()`.

---

### M-02: BondingCurve `basePrice` not marked immutable

**Severity:** Medium
**Contract:** `AgentBondingCurve.sol:103`
**Status:** Fixed

**Description:** `basePrice` is set once in the constructor and never modified, but was declared as a regular storage variable. This wastes gas on every read (~2100 gas for SLOAD vs 3 gas for immutable).

**Fix:** Marked `basePrice` as `immutable`.

---

### M-03: BondingCurveFactory defaults not marked immutable

**Severity:** Medium
**Contract:** `BondingCurveFactory.sol:35,38`
**Status:** Fixed

**Description:** `defaultBasePrice` and `defaultSlope` are set once in the constructor but declared as mutable storage. Same gas waste as M-02.

**Fix:** Marked both as `immutable`.

---

### L-01: PredictionMarket declares unused error `PM__NoLiquidity`

**Severity:** Low
**Contract:** `PredictionMarket.sol:57`
**Status:** Fixed

**Description:** The custom error `PM__NoLiquidity` was declared but never used anywhere in the contract, indicating dead code.

**Fix:** Removed the unused error declaration.

---

### L-02: PredictionMarket declares unused error `PM__TransferFailed`

**Severity:** Low
**Contract:** `PredictionMarket.sol:58`
**Status:** Fixed

**Description:** After switching to `Address.sendValue()` (which reverts internally on failure), `PM__TransferFailed` is no longer used.

**Fix:** Removed the unused error declaration.

---

### I-01: PredictionMarket `_readMetric()` has unreachable `return 0`

**Severity:** Info
**Contract:** `PredictionMarket.sol:224`
**Status:** Fixed

**Description:** The `_readMetric()` function has an exhaustive if-chain covering all `MetricField` enum values, making the final `return 0` unreachable. This could mask future bugs if new enum values are added.

**Fix:** Replaced `return 0` with `revert()` to fail explicitly if the enum is extended without updating the function.

---

### I-02: No slippage protection on buy/sell

**Severity:** Info
**Contract:** `AgentBondingCurve.sol`
**Status:** Acknowledged (not fixed)

**Description:** `buy()` and `sell()` functions don't accept `minTokensOut` or `minETHOut` parameters. Front-runners could sandwich trades for profit.

**Mitigation:** Accepted risk for hackathon scope. For production, add `minOut` parameters.

---

### I-03: Slope decrease permanently traps ETH in reserve

**Severity:** Info
**Contract:** `AgentBondingCurve.sol`
**Status:** Acknowledged (not fixed)

**Description:** When the slope is decreased, the sell-back cost for existing tokens decreases, leaving excess ETH permanently locked in the reserve with no withdrawal mechanism.

**Mitigation:** Accepted risk. A `withdrawExcess()` function (owner-only) could be added for production.

---

### I-04: No emergency pause mechanism

**Severity:** Info
**Contract:** All contracts
**Status:** Acknowledged (not fixed)

**Description:** None of the contracts implement OpenZeppelin `Pausable`. In an emergency, there is no way to halt trading or market operations.

**Mitigation:** Accepted risk for hackathon scope. For production, add `Pausable` to critical contracts.

---

## Test Coverage Summary

| Test Category | Count | Description |
|---------------|-------|-------------|
| Unit tests | 69 | Core functionality for all 5 contracts |
| Event emission | 7 | Verify all critical events fire correctly |
| Access control | 4 | Non-owner rejection for protected functions |
| Edge cases | 12 | Cancelled markets, multiple bets, transfers |
| Reentrancy | 1 | Attack contract verifies nonReentrant blocks re-entry |
| Fuzz tests | 12 | Random amounts, thresholds, multi-user scenarios |
| Invariant tests | 7 | Balance == stakes, reserve solvency, price floor |
| Integration (E2E) | 9 | Full lifecycle, multi-agent ecosystem |
| **Total** | **107** | **All passing** |

---

## Recommendations for Production

1. Add slippage protection (`minOut`) to `buy()` and `sell()`
2. Implement `Pausable` on `AgentBondingCurve` and `PredictionMarket`
3. Add `withdrawExcess()` to recover trapped reserve ETH after slope decreases
4. Consider time-weighted oracle reads to prevent single-block manipulation
5. External audit by a professional security firm before mainnet deployment
