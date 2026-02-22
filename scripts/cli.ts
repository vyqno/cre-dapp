#!/usr/bin/env node
/**
 * AgentIndex Protocol CLI
 *
 * Merged from scripts/cli.ts (TypeScript + live on-chain status) and
 * smart-contracts/cli/cli.mjs (pre-flight, simulate-trades, purple branding,
 * state-aware menu checkmarks, per-step "continue?" prompts).
 *
 * Usage:
 *   npx tsx cli.ts                 # interactive menu
 *   npx tsx cli.ts deploy          # deploy all contracts
 *   npx tsx cli.ts setup           # CRE auth + seed metrics
 *   npx tsx cli.ts trades          # simulate bonding curve trades
 *   npx tsx cli.ts simulate [-c]   # CRE simulation (one-shot or continuous)
 *   npx tsx cli.ts status          # live on-chain data
 *   npx tsx cli.ts full            # full 4-step pipeline
 */

import { Command }             from "commander";
import inquirer                from "inquirer";
import chalk                   from "chalk";
import { createPublicClient, http, formatEther } from "viem";
import { sepolia }             from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import { loadEnvConfig, reloadEnvConfig } from "./lib/config.js";
import { loadState, saveState, createFreshState, stateFromEnv } from "./lib/state.js";
import { runForgeScript, buildScriptEnv, type ParsedContract } from "./lib/forge.js";
import {
  printBanner,
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printStep,
  printContractsTable,
  printAgentsTable,
  printMarketsTable,
  printPipelineStatus,
  printEnvBlock,
  spinner,
} from "./lib/display.js";
import { fetchStatus } from "./lib/status.js";

// ── Branding ──────────────────────────────────────────────────────────
const brand = chalk.hex("#7C3AED");   // vivid purple

// ── Helpers ───────────────────────────────────────────────────────────

function getAccount() {
  return privateKeyToAccount(loadEnvConfig().privateKey);
}

function applyContractsToState(
  contracts: ParsedContract[],
  state: ReturnType<typeof createFreshState>,
  now = new Date().toISOString(),
) {
  for (const c of contracts) {
    const rec = { address: c.address, txHash: c.txHash, deployedAt: now };
    if (c.name.includes("AgentRegistry"))       state.contracts.AgentRegistry       = rec;
    if (c.name.includes("AgentMetrics"))        state.contracts.AgentMetrics        = rec;
    if (c.name.includes("BondingCurveFactory")) state.contracts.BondingCurveFactory = rec;
    if (c.name.includes("PredictionMarket"))    state.contracts.PredictionMarket    = rec;
  }
}

/** Fetch wallet balance, gas price, and latest block — used in pre-flight. */
async function fetchPreflightInfo() {
  const cfg     = loadEnvConfig();
  const account = getAccount();
  const client  = createPublicClient({ chain: sepolia, transport: http(cfg.sepoliaRpcUrl) });

  const [balanceWei, gasPrice, blockNumber] = await Promise.all([
    client.getBalance({ address: account.address }),
    client.getGasPrice(),
    client.getBlockNumber(),
  ]);

  return {
    address:      account.address,
    balanceEth:   Number(formatEther(balanceWei)),
    gasPriceGwei: Number(gasPrice) / 1e9,
    blockNumber:  Number(blockNumber),
    rpcLabel:     cfg.sepoliaRpcUrl.includes("alchemy") ? "Alchemy" : "Custom RPC",
  };
}

async function askContinue(msg: string): Promise<boolean> {
  const { ok } = await inquirer.prompt([
    { type: "confirm", name: "ok", message: msg, default: false },
  ]);
  return ok;
}

function adoptState() {
  const cfg     = loadEnvConfig();
  const account = getAccount();
  return stateFromEnv(account.address, {
    agentRegistry:       cfg.agentRegistry,
    agentMetrics:        cfg.agentMetrics,
    bondingCurveFactory: cfg.bondingCurveFactory,
    predictionMarket:    cfg.predictionMarket,
  });
}

// ── Command: deploy ───────────────────────────────────────────────────

async function cmdDeploy(opts: {
  force?: boolean;
  noVerify?: boolean;
  /** suppress header/summary (used inside cmdFull) */
  silent?: boolean;
}): Promise<boolean> {
  if (!opts.silent) printHeader("Deploy Contracts");

  const cfg   = loadEnvConfig();
  let   state = loadState() ?? createFreshState(getAccount().address);

  // ── Core contracts ───────────────────────────────────────────────────
  if (!state.steps.coreDeployed || opts.force) {
    printStep(1, 2, "Core contracts (Registry · Metrics · Factory)…");
    const spin = spinner("forge script/Deploy.s.sol").start();

    const result = runForgeScript({
      script: "script/Deploy.s.sol", rpcUrl: cfg.sepoliaRpcUrl,
      broadcast: true, verify: !opts.noVerify, slow: true,
    });

    if (!result.success) {
      spin.fail("Core deploy failed");
      printError(result.stderr.slice(0, 500));
      return false;
    }
    spin.succeed("Core contracts deployed");
    applyContractsToState(result.contracts, state);
    state.steps.coreDeployed = true;
    saveState(state);
    printContractsTable(result.contracts.map((c) => ({ name: c.name, address: c.address, txHash: c.txHash })));
  } else {
    printSuccess("Core contracts already deployed (--force to redeploy)");
  }

  // ── PredictionMarket ─────────────────────────────────────────────────
  if (!state.steps.predictionMarketDeployed || opts.force) {
    printStep(2, 2, "PredictionMarket…");
    const spin = spinner("forge script/DeployPredictionMarket.s.sol").start();

    const metricsAddr = state.contracts.AgentMetrics?.address ?? cfg.agentMetrics;
    if (!metricsAddr) {
      spin.fail("AgentMetrics address unknown — deploy core first");
      return false;
    }

    const result = runForgeScript({
      script: "script/DeployPredictionMarket.s.sol", rpcUrl: cfg.sepoliaRpcUrl,
      broadcast: true, verify: !opts.noVerify, slow: true,
      extraEnv: buildScriptEnv({ agentMetrics: metricsAddr }),
    });

    if (!result.success) {
      spin.fail("PredictionMarket deploy failed");
      printError(result.stderr.slice(0, 500));
      return false;
    }
    spin.succeed("PredictionMarket deployed");
    applyContractsToState(result.contracts, state);
    state.steps.predictionMarketDeployed = true;
    saveState(state);
    printContractsTable(result.contracts.map((c) => ({ name: c.name, address: c.address, txHash: c.txHash })));
  } else {
    printSuccess("PredictionMarket already deployed (--force to redeploy)");
  }

  if (!opts.silent) {
    printPipelineStatus(state.steps);
    printEnvBlock({
      AgentRegistry:       state.contracts.AgentRegistry?.address       ?? "",
      AgentMetrics:        state.contracts.AgentMetrics?.address        ?? "",
      BondingCurveFactory: state.contracts.BondingCurveFactory?.address ?? "",
      PredictionMarket:    state.contracts.PredictionMarket?.address    ?? "",
    });
  }
  return true;
}

// ── Command: setup ────────────────────────────────────────────────────

async function cmdSetup(opts: { force?: boolean; silent?: boolean } = {}): Promise<boolean> {
  if (!opts.silent) printHeader("Setup CRE Pipeline");

  const cfg   = loadEnvConfig();
  let   state = loadState() ?? adoptState();

  if (!state.steps.coreDeployed) {
    printWarning("Core contracts not deployed — run `deploy` first.");
    return false;
  }

  if (state.steps.creSetupComplete && !opts.force) {
    printSuccess("CRE already configured (--force to redo)");
    return true;
  }

  printStep(1, 1, "SetupCRE.s.sol (authorize writer · seed metrics)…");
  const spin = spinner("forge script/SetupCRE.s.sol").start();

  const result = runForgeScript({
    script: "script/SetupCRE.s.sol", rpcUrl: cfg.sepoliaRpcUrl,
    broadcast: true, verify: false, slow: true,
    extraEnv: buildScriptEnv({
      agentMetrics:        state.contracts.AgentMetrics?.address        ?? cfg.agentMetrics,
      bondingCurveFactory: state.contracts.BondingCurveFactory?.address ?? cfg.bondingCurveFactory,
      predictionMarket:    state.contracts.PredictionMarket?.address    ?? cfg.predictionMarket,
    }),
  });

  if (!result.success) {
    spin.fail("Setup failed");
    printError(result.stderr.slice(0, 500));
    return false;
  }
  spin.succeed("CRE pipeline configured");
  state.steps.creSetupComplete = true;
  state.steps.metricsSeeded    = true;
  saveState(state);
  if (!opts.silent) printPipelineStatus(state.steps);
  return true;
}

// ── Command: trades ───────────────────────────────────────────────────

async function cmdTrades(opts: { silent?: boolean } = {}): Promise<boolean> {
  if (!opts.silent) printHeader("Simulate Trades");

  const cfg   = loadEnvConfig();
  const state = loadState() ?? adoptState();

  const spin = spinner("forge script/SimulateTrades.s.sol").start();
  const result = runForgeScript({
    script: "script/SimulateTrades.s.sol", rpcUrl: cfg.sepoliaRpcUrl,
    broadcast: true, verify: false, slow: false,
    extraEnv: buildScriptEnv({
      agentMetrics:        state.contracts.AgentMetrics?.address        ?? cfg.agentMetrics,
      bondingCurveFactory: state.contracts.BondingCurveFactory?.address ?? cfg.bondingCurveFactory,
    }),
  });

  if (!result.success) {
    spin.fail("Trade simulation failed");
    printError(result.stderr.slice(0, 500));
    return false;
  }
  spin.succeed("Trade simulation complete");
  printInfo("Buy/sell transactions executed on bonding curves");
  return true;
}

// ── Command: simulate ─────────────────────────────────────────────────

async function cmdSimulate(opts: { continuous?: boolean; silent?: boolean } = {}): Promise<boolean> {
  if (opts.continuous) {
    printHeader("Continuous CRE Simulation");
    printInfo("Starting simulate-cre.ts — Ctrl+C to stop.");
    console.log();
    await import("./simulate-cre.js");
    return true;
  }

  if (!opts.silent) printHeader("One-shot CRE Simulation");

  const cfg   = loadEnvConfig();
  const state = loadState() ?? adoptState();

  const spin = spinner("forge script/SimulateCRE.s.sol").start();
  const result = runForgeScript({
    script: "script/SimulateCRE.s.sol", rpcUrl: cfg.sepoliaRpcUrl,
    broadcast: true, verify: false, slow: false,
    extraEnv: buildScriptEnv({
      agentMetrics:        state.contracts.AgentMetrics?.address        ?? cfg.agentMetrics,
      bondingCurveFactory: state.contracts.BondingCurveFactory?.address ?? cfg.bondingCurveFactory,
      predictionMarket:    state.contracts.PredictionMarket?.address    ?? cfg.predictionMarket,
    }),
  });

  if (!result.success) {
    spin.fail("Simulation failed");
    printError(result.stderr.slice(0, 500));
    return false;
  }
  spin.succeed("One-shot simulation complete");
  printInfo("Metrics updated · Slopes adjusted · Expired markets resolved");
  return true;
}

// ── Command: status ───────────────────────────────────────────────────

async function cmdStatus() {
  printHeader("Protocol Status");

  const spin = spinner("Querying Sepolia…").start();
  let data;
  try {
    data = await fetchStatus();
    spin.succeed("Data fetched");
  } catch (err: any) {
    spin.fail("Failed to fetch on-chain data");
    printError(err.message ?? String(err));
    process.exit(1);
  }

  printInfo(`Deployer: ${chalk.cyan(data.deployer)}  (${chalk.yellow(data.deployerBalance + " ETH")})`);
  printInfo(`CRE Authorized Writer: ${chalk.dim(data.authorizedWriter)}`);
  console.log();

  printContractsTable(
    Object.entries(data.contracts)
      .filter(([, v]) => v.deployed)
      .map(([name, v]) => ({ name, address: v.address })),
  );

  if (data.agents.length > 0) {
    printHeader(`Agents (${data.totalAgents} registered)`);
    printAgentsTable(data.agents);
  } else {
    printInfo("No agents registered yet.");
  }

  if (data.markets.length > 0) {
    printHeader(`Prediction Markets (${data.marketCount} total)`);
    printMarketsTable(data.markets);
  } else {
    printInfo("No prediction markets found.");
  }
}

// ── Command: full pipeline ────────────────────────────────────────────

async function cmdFull() {
  console.log();
  console.log(brand("  ══════════════════════════════════════════════════"));
  console.log(brand("  ║") + chalk.bold.white("  Full Deployment Pipeline — 4 Steps            ") + brand("║"));
  console.log(brand("  ══════════════════════════════════════════════════"));

  // ── Pre-flight ───────────────────────────────────────────────────────
  const pfSpin = spinner("Fetching wallet info…").start();
  let preflight;
  try {
    preflight = await fetchPreflightInfo();
    pfSpin.stop();
  } catch {
    pfSpin.stop();
  }

  if (preflight) {
    const balColor = preflight.balanceEth >= 0.1
      ? chalk.green : preflight.balanceEth > 0.01
      ? chalk.yellow : chalk.red;
    console.log();
    printInfo(`Deployer:   ${chalk.cyan(preflight.address)}`);
    printInfo(`Balance:    ${balColor(preflight.balanceEth.toFixed(6) + " ETH")}`);
    printInfo(`Gas Price:  ${chalk.dim(preflight.gasPriceGwei.toFixed(3) + " gwei")}`);
    printInfo(`Block:      ${chalk.dim("#" + preflight.blockNumber.toLocaleString())}`);
    printInfo(`Network:    ${chalk.cyan("Sepolia (" + preflight.rpcLabel + ")")}`);
    console.log();

    if (preflight.balanceEth < 0.01) {
      printWarning("Low balance — you may run out of gas mid-pipeline.");
      const cont = await askContinue("Continue anyway?");
      if (!cont) { printInfo("Pipeline cancelled."); return; }
    }
  }

  console.log(chalk.dim("  Steps:"));
  console.log(chalk.dim("    1.  Deploy contracts      (Registry · Metrics · Factory · PM)"));
  console.log(chalk.dim("    2.  Setup CRE             (authorize writer · seed metrics)"));
  console.log(chalk.dim("    3.  Simulate Trades       (buy/sell on bonding curves)"));
  console.log(chalk.dim("    4.  Simulate CRE          (metrics · slopes · markets)"));
  console.log();

  const { proceed } = await inquirer.prompt([
    { type: "confirm", name: "proceed", message: "Start the full pipeline?", default: true },
  ]);
  if (!proceed) { printInfo("Pipeline cancelled."); return; }

  const t0 = Date.now();
  const log: Array<[string, boolean]> = [];

  const step = async (n: number, label: string, fn: () => Promise<boolean>) => {
    console.log();
    console.log(brand(`  ── Step ${n}/4: ${label} ──`));
    const ok = await fn();
    log.push([label, ok]);
    if (!ok) {
      const cont = await askContinue(`Step ${n} failed. Continue anyway?`);
      if (!cont) return false;
    }
    return true;
  };

  if (!await step(1, "Deploy Contracts", () => cmdDeploy({ silent: true }))) {
    return printPipelineSummary(log, t0);
  }
  if (!await step(2, "Setup CRE",        () => cmdSetup({ silent: true })))  {
    return printPipelineSummary(log, t0);
  }
  if (!await step(3, "Simulate Trades",  () => cmdTrades({ silent: true }))) {
    return printPipelineSummary(log, t0);
  }
  await step(4, "Simulate CRE", () => cmdSimulate({ silent: true }));

  printPipelineSummary(log, t0);

  const state = loadState();
  const cfg   = reloadEnvConfig();
  if (state) {
    printEnvBlock({
      AgentRegistry:       state.contracts.AgentRegistry?.address       ?? cfg.agentRegistry       ?? "",
      AgentMetrics:        state.contracts.AgentMetrics?.address        ?? cfg.agentMetrics        ?? "",
      BondingCurveFactory: state.contracts.BondingCurveFactory?.address ?? cfg.bondingCurveFactory ?? "",
      PredictionMarket:    state.contracts.PredictionMarket?.address    ?? cfg.predictionMarket    ?? "",
    });
  }
}

function printPipelineSummary(results: Array<[string, boolean]>, t0: number) {
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const allOk   = results.every(([, ok]) => ok);
  console.log();
  console.log(brand("  " + "═".repeat(50)));
  console.log(
    "  " + (allOk
      ? chalk.bold.green("✔  PIPELINE COMPLETE")
      : chalk.bold.yellow("⚠  FINISHED WITH ERRORS")),
  );
  console.log(chalk.dim(`     Elapsed: ${elapsed}s`));
  console.log(brand("  " + "═".repeat(50)));
  console.log();
  for (const [name, ok] of results) {
    console.log(`  ${ok ? chalk.green("✔") : chalk.red("✖")}  ${name}`);
  }
  console.log();
}

// ── Interactive menu ──────────────────────────────────────────────────

async function interactiveMenu() {
  const cfg   = loadEnvConfig();
  const state = loadState() ?? adoptState();

  const ck = (done: boolean) => done ? chalk.green("✔") : chalk.dim("○");
  const hasCore = state.steps.coreDeployed;
  const hasPM   = state.steps.predictionMarketDeployed;
  const hasCRE  = state.steps.creSetupComplete;

  console.log();
  printInfo(`Network:  ${chalk.cyan(cfg.sepoliaRpcUrl.includes("alchemy") ? "Alchemy Sepolia" : "Custom RPC")}`);
  printInfo(`Core:     ${hasCore ? chalk.green("Deployed") : chalk.dim("Not deployed")}`);
  printInfo(`PredMkt:  ${hasPM   ? chalk.green("Deployed") : chalk.dim("Not deployed")}`);
  printInfo(`CRE:      ${hasCRE  ? chalk.green("Configured") : chalk.dim("Not configured")}`);
  console.log();

  const { action } = await inquirer.prompt([{
    type: "list", name: "action",
    message: "What would you like to do?",
    choices: [
      { name: `${brand("⬡")}  Full Pipeline       ${chalk.dim("— all steps in sequence")}`,          value: "full" },
      new inquirer.Separator(chalk.dim("  ─── Individual Steps ───")),
      { name: `${ck(hasCore && hasPM)}  Deploy             ${chalk.dim("— contracts to Sepolia")}`,   value: "deploy" },
      { name: `${ck(hasCRE)}  Setup CRE           ${chalk.dim("— auth + seed metrics")}`,             value: "setup" },
      { name: `   Simulate Trades   ${chalk.dim("— buy/sell on bonding curves")}`,                     value: "trades" },
      { name: `   Simulate CRE      ${chalk.dim("— one-shot (metrics/slopes/markets)")}`,             value: "simulate" },
      { name: `   Simulate CRE      ${chalk.dim("— continuous 30 s loop")}`,                          value: "simulate-c" },
      new inquirer.Separator(chalk.dim("  ─── Info ───")),
      { name: `   Status            ${chalk.dim("— live on-chain data")}`,                            value: "status" },
      { name: chalk.dim("   Exit"),                                                                    value: "exit" },
    ],
  }]);

  switch (action) {
    case "full":       return cmdFull();
    case "deploy":     return cmdDeploy({});
    case "setup":      return cmdSetup();
    case "trades":     return cmdTrades();
    case "simulate":   return cmdSimulate();
    case "simulate-c": return cmdSimulate({ continuous: true });
    case "status":     return cmdStatus();
    case "exit":       process.exit(0);
  }
}

// ── Commander subcommands ─────────────────────────────────────────────

const program = new Command()
  .name("agentindex")
  .description("AgentIndex Protocol CLI — deploy, setup, and monitor on Sepolia")
  .version("1.0.0");

program.command("deploy")
  .description("Deploy all contracts to Sepolia via Alchemy")
  .option("--force",     "Re-deploy even if already done")
  .option("--no-verify", "Skip Etherscan verification")
  .action((o) => cmdDeploy({ force: o.force, noVerify: !o.verify }));

program.command("setup")
  .description("Authorize CRE writer and seed initial metrics")
  .option("--force", "Re-run even if already done")
  .action((o) => cmdSetup({ force: o.force }));

program.command("trades")
  .description("Simulate buy/sell trades on bonding curves")
  .action(() => cmdTrades());

program.command("simulate")
  .description("Run CRE simulation (one-shot by default)")
  .option("-c, --continuous", "Start continuous 30 s simulation loop")
  .action((o) => cmdSimulate({ continuous: o.continuous }));

program.command("status")
  .description("Print live on-chain protocol status")
  .action(() => cmdStatus());

program.command("full")
  .description("Run the full 4-step pipeline")
  .action(() => cmdFull());

// ── Entry ─────────────────────────────────────────────────────────────

(async () => {
  printBanner();
  if (process.argv.length <= 2) {
    await interactiveMenu();
    return;
  }
  await program.parseAsync(process.argv);
})().catch((err) => {
  printError(err.message ?? String(err));
  process.exit(1);
});
