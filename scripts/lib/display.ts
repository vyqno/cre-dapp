/**
 * Display — chalk/ora formatting, tables, Etherscan links.
 *
 * Centralises all visual output so the rest of the CLI stays clean.
 */

import chalk from "chalk";
import ora, { type Ora } from "ora";
import { ETHERSCAN_BASE } from "./config.js";

// ── Link helpers ─────────────────────────────────────────────────────

export const txLink      = (hash: string)    => `${ETHERSCAN_BASE}/tx/${hash}`;
export const addressLink = (address: string) => `${ETHERSCAN_BASE}/address/${address}`;

// ── Spinners ─────────────────────────────────────────────────────────

export function spinner(text: string): Ora {
  return ora({ text, color: "cyan" });
}

// ── Structural output ─────────────────────────────────────────────────

export function printBanner() {
  console.log();
  console.log(chalk.bold.cyan("  ╔══════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("  ║") + chalk.bold.white("     AgentIndex Protocol CLI  v1.0        ") + chalk.bold.cyan("║"));
  console.log(chalk.bold.cyan("  ║") + chalk.dim("     Sepolia · Alchemy · Foundry          ") + chalk.bold.cyan("║"));
  console.log(chalk.bold.cyan("  ╚══════════════════════════════════════════╝"));
  console.log();
}

export function printHeader(title: string) {
  console.log();
  console.log(chalk.bold.white(`  ── ${title} ──`));
  console.log();
}

export function printSuccess(msg: string) {
  console.log(chalk.green(`  ✔ ${msg}`));
}

export function printError(msg: string) {
  console.log(chalk.red(`  ✖ ${msg}`));
}

export function printWarning(msg: string) {
  console.log(chalk.yellow(`  ⚠ ${msg}`));
}

export function printInfo(msg: string) {
  console.log(chalk.dim(`  · ${msg}`));
}

export function printStep(n: number, total: number, msg: string) {
  const tag = chalk.bold.cyan(`[${n}/${total}]`);
  console.log(`  ${tag} ${msg}`);
}

// ── Tables ────────────────────────────────────────────────────────────

interface ContractRow {
  name:    string;
  address: string;
  txHash?: string;
}

export function printContractsTable(rows: ContractRow[]) {
  if (rows.length === 0) { printWarning("No contracts to display."); return; }

  const nameW = Math.max(20, ...rows.map((r) => r.name.length)) + 2;

  // Header
  console.log(
    "  " +
    chalk.bold.dim("Contract".padEnd(nameW)) +
    chalk.bold.dim("Address".padEnd(44)) +
    chalk.bold.dim("Etherscan")
  );
  console.log("  " + chalk.dim("─".repeat(nameW + 44 + 40)));

  for (const row of rows) {
    const link = `${ETHERSCAN_BASE}/address/${row.address}`;
    console.log(
      "  " +
      chalk.cyan(row.name.padEnd(nameW)) +
      chalk.white(row.address.padEnd(44)) +
      chalk.dim.underline(link)
    );
    if (row.txHash) {
      console.log("  " + " ".repeat(nameW) + chalk.dim(`tx: ${txLink(row.txHash)}`));
    }
  }
  console.log();
}

interface AgentRow {
  id:       number;
  name:     string;
  curve:    string;
  price:    string;
  supply:   string;
  reserve:  string;
  slope:    string;
  roiBps?:  string;
}

export function printAgentsTable(rows: AgentRow[]) {
  if (rows.length === 0) { printInfo("No agents found."); return; }

  console.log(
    "  " +
    chalk.bold.dim("ID".padEnd(4)) +
    chalk.bold.dim("Name".padEnd(22)) +
    chalk.bold.dim("Curve Addr".padEnd(44)) +
    chalk.bold.dim("Price (ETH)".padEnd(14)) +
    chalk.bold.dim("Supply".padEnd(12)) +
    chalk.bold.dim("Reserve".padEnd(14)) +
    chalk.bold.dim("ROI")
  );
  console.log("  " + chalk.dim("─".repeat(120)));

  for (const r of rows) {
    const roi = r.roiBps
      ? chalk.green(`+${(Number(r.roiBps) / 10000).toFixed(2)}%`)
      : chalk.dim("n/a");
    console.log(
      "  " +
      chalk.cyan(String(r.id).padEnd(4)) +
      chalk.white(r.name.padEnd(22)) +
      chalk.dim(r.curve.slice(0, 10) + "..." + r.curve.slice(-8)).padEnd(44) +
      chalk.yellow(r.price.padEnd(14)) +
      chalk.white(r.supply.padEnd(12)) +
      chalk.white(r.reserve.padEnd(14)) +
      roi
    );
  }
  console.log();
}

interface MarketRow {
  id:         number;
  agentId:    number;
  metric:     string;
  comparison: string;
  threshold:  string;
  status:     string;
  totalYes:   string;
  totalNo:    string;
}

export function printMarketsTable(rows: MarketRow[]) {
  if (rows.length === 0) { printInfo("No prediction markets found."); return; }

  const STATUS_COLOR: Record<string, chalk.Chalk> = {
    OPEN:          chalk.cyan,
    RESOLVED_YES:  chalk.green,
    RESOLVED_NO:   chalk.red,
    CANCELLED:     chalk.yellow,
  };

  console.log(
    "  " +
    chalk.bold.dim("ID".padEnd(5)) +
    chalk.bold.dim("Agent".padEnd(7)) +
    chalk.bold.dim("Metric".padEnd(12)) +
    chalk.bold.dim("Comparison".padEnd(12)) +
    chalk.bold.dim("Threshold".padEnd(16)) +
    chalk.bold.dim("YES".padEnd(12)) +
    chalk.bold.dim("NO".padEnd(12)) +
    chalk.bold.dim("Status")
  );
  console.log("  " + chalk.dim("─".repeat(100)));

  for (const r of rows) {
    const colorFn = STATUS_COLOR[r.status] ?? chalk.white;
    console.log(
      "  " +
      chalk.cyan(String(r.id).padEnd(5)) +
      chalk.white(String(r.agentId).padEnd(7)) +
      chalk.white(r.metric.padEnd(12)) +
      chalk.dim(r.comparison.padEnd(12)) +
      chalk.white(r.threshold.padEnd(16)) +
      chalk.green(r.totalYes.padEnd(12)) +
      chalk.red(r.totalNo.padEnd(12)) +
      colorFn(r.status)
    );
  }
  console.log();
}

// ── Pipeline status checklist ─────────────────────────────────────────

export function printPipelineStatus(steps: Record<string, boolean>) {
  console.log(chalk.bold.white("  Pipeline Steps:"));
  const labels: Record<string, string> = {
    coreDeployed:             "Core contracts deployed (Registry, Metrics, Factory)",
    predictionMarketDeployed: "PredictionMarket deployed",
    creSetupComplete:         "CRE authorization configured",
    metricsSeeded:            "Initial metrics seeded",
  };
  for (const [key, done] of Object.entries(steps)) {
    const icon = done ? chalk.green("✔") : chalk.red("✖");
    const label = labels[key] ?? key;
    console.log(`  ${icon}  ${done ? chalk.white(label) : chalk.dim(label)}`);
  }
  console.log();
}

// ── Env block ─────────────────────────────────────────────────────────

/** Print a copyable env block for frontend/.env.local */
export function printEnvBlock(contracts: Record<string, string>) {
  console.log(chalk.bold.white("  Copy these to your frontend/.env.local:"));
  console.log(chalk.dim("  ─────────────────────────────────────────────"));
  const keys: Record<string, string> = {
    AgentRegistry:       "NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS",
    AgentMetrics:        "NEXT_PUBLIC_AGENT_METRICS_ADDRESS",
    BondingCurveFactory: "NEXT_PUBLIC_BONDING_CURVE_FACTORY_ADDRESS",
    PredictionMarket:    "NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS",
  };
  for (const [name, envKey] of Object.entries(keys)) {
    const addr = contracts[name];
    if (addr) console.log(chalk.yellow(`  ${envKey}`) + chalk.dim("=") + chalk.white(addr));
  }
  console.log(chalk.dim("  ─────────────────────────────────────────────"));
  console.log();
}
