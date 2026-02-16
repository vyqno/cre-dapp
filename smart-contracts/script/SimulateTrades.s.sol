// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentBondingCurve} from "../src/AgentBondingCurve.sol";
import {BondingCurveFactory} from "../src/BondingCurveFactory.sol";

/**
 * @title SimulateTrades
 * @author Hitesh (vyqno)
 * @notice Post-deploy on-chain E2E: buys, sells, and verifies state on the
 *         REAL Tenderly testnet. This is NOT a local Foundry test — it executes
 *         actual transactions and checks deployed contract behavior.
 *
 * @dev Usage:
 *      forge script script/SimulateTrades.s.sol \
 *        --rpc-url $TENDERLY_VNET_RPC \
 *        --broadcast \
 *        --slow
 *
 *      Required env:
 *        PRIVATE_KEY            — Funded wallet
 *        BONDING_CURVE_FACTORY  — Factory address from Deploy output
 */
contract SimulateTrades is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address factoryAddr = vm.envAddress("BONDING_CURVE_FACTORY");
        address trader = vm.addr(pk);

        BondingCurveFactory factory = BondingCurveFactory(factoryAddr);

        console.log("===========================================");
        console.log("  AgentIndex - On-Chain E2E Simulation");
        console.log("===========================================");
        console.log("Trader:", trader);
        console.log("Balance:", trader.balance / 1e18, "ETH");
        console.log("");

        vm.startBroadcast(pk);

        // ─── Agent 1: Buy twice, verify price increase ──
        address curve1Addr = factory.getCurve(1);
        require(curve1Addr != address(0), "Agent 1 curve not found - run Deploy first");
        AgentBondingCurve curve1 = AgentBondingCurve(curve1Addr);

        console.log("--- Agent 1 (AlphaYield) ---");
        uint256 price1Before = curve1.currentPrice();
        console.log("  Price before:", price1Before);

        uint256 tokens1a = curve1.buy{value: 0.5 ether}();
        console.log("  Bought", tokens1a / 1e18, "tokens for 0.5 ETH");

        uint256 price1Mid = curve1.currentPrice();
        require(price1Mid > price1Before, "E2E FAIL: price did not increase after buy");
        console.log("  Price after 1st buy:", price1Mid, "(increased)");

        uint256 tokens1b = curve1.buy{value: 0.3 ether}();
        console.log("  Bought", tokens1b / 1e18, "more tokens for 0.3 ETH");

        uint256 price1After = curve1.currentPrice();
        require(price1After > price1Mid, "E2E FAIL: price did not increase after 2nd buy");
        console.log("  Price after 2nd buy:", price1After, "(increased)");
        console.log("  Reserve:", curve1.reserveBalance());

        // ─── Agent 2: Buy then sell, verify solvency ──
        address curve2Addr = factory.getCurve(2);
        if (curve2Addr != address(0)) {
            AgentBondingCurve curve2 = AgentBondingCurve(curve2Addr);
            console.log("");
            console.log("--- Agent 2 (MomentumTrader) ---");

            uint256 tokens2 = curve2.buy{value: 0.2 ether}();
            console.log("  Bought", tokens2 / 1e18, "tokens for 0.2 ETH");

            // Sell half
            uint256 sellAmount = (tokens2 / 2 / 1e18) * 1e18;
            if (sellAmount >= 1e18) {
                uint256 reserveBefore = curve2.reserveBalance();
                curve2.sell(sellAmount);
                uint256 reserveAfter = curve2.reserveBalance();
                require(reserveAfter < reserveBefore, "E2E FAIL: reserve did not decrease on sell");
                console.log("  Sold", sellAmount / 1e18, "tokens");
                console.log("  Reserve after sell:", reserveAfter, "(decreased)");
            }

            // Verify remaining tokens are backed
            uint256 remaining = curve2.totalSupply();
            if (remaining > 0) {
                uint256 sellBackCost = curve2.getSellRefund(remaining);
                require(
                    curve2.reserveBalance() >= sellBackCost,
                    "E2E FAIL: reserve does not cover remaining tokens"
                );
                console.log("  Solvency check: PASS (reserve covers all tokens)");
            }
        }

        // ─── Agent 3: Large buy, verify whole-token granularity ──
        address curve3Addr = factory.getCurve(3);
        if (curve3Addr != address(0)) {
            AgentBondingCurve curve3 = AgentBondingCurve(curve3Addr);
            console.log("");
            console.log("--- Agent 3 (StableHarvester) ---");

            uint256 tokens3 = curve3.buy{value: 1 ether}();
            require(tokens3 % 1e18 == 0, "E2E FAIL: tokens not whole-token multiple");
            console.log("  Bought", tokens3 / 1e18, "tokens for 1 ETH");
            console.log("  Whole-token check: PASS");
            console.log("  Price:", curve3.currentPrice());
            console.log("  Reserve:", curve3.reserveBalance());
        }

        vm.stopBroadcast();

        console.log("");
        console.log("===========================================");
        console.log("  ALL ON-CHAIN E2E CHECKS PASSED");
        console.log("===========================================");
        console.log("Remaining balance:", trader.balance / 1e18, "ETH");
    }
}
