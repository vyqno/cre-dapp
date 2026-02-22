/**
 * Forge — wraps `forge script` execution and parses output.
 *
 * Strategy for extracting deployed addresses (in priority order):
 *   1. Read broadcast/<ScriptName>/<chainId>/run-latest.json (most reliable)
 *   2. Regex-parse forge stdout console.log output (fallback / dry-run)
 */

import { execSync, type ExecSyncOptionsWithStringEncoding } from "child_process";
import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { BROADCAST_DIR, SEPOLIA_CHAIN_ID, SMART_CONTRACTS } from "./config.js";

// ── Types ────────────────────────────────────────────────────────────

export interface ParsedContract {
  name:    string;
  address: string;
  txHash?: string;
}

export interface ForgeResult {
  success:   boolean;
  stdout:    string;
  stderr:    string;
  contracts: ParsedContract[];
  exitCode:  number;
}

export interface ForgeScriptOptions {
  /** Path relative to smart-contracts/, e.g. "script/Deploy.s.sol" */
  script:    string;
  rpcUrl:    string;
  broadcast: boolean;
  verify:    boolean;
  slow?:     boolean;
  /** Additional env vars passed to the forge subprocess */
  extraEnv?: Record<string, string>;
}

// ── Core executor ────────────────────────────────────────────────────

export function runForgeScript(opts: ForgeScriptOptions): ForgeResult {
  const args: string[] = [
    "forge", "script", opts.script,
    "--rpc-url",    opts.rpcUrl,
    "--private-key", process.env.PRIVATE_KEY ?? "",
  ];
  if (opts.broadcast) args.push("--broadcast");
  if (opts.verify)    args.push("--verify", "--etherscan-api-key", process.env.ETHERSCAN_API_KEY ?? "");
  if (opts.slow)      args.push("--slow");

  const execOpts: ExecSyncOptionsWithStringEncoding = {
    cwd:      SMART_CONTRACTS,
    encoding: "utf-8",
    timeout:  600_000, // 10 min — verification can be slow
    env: {
      ...process.env,
      ...opts.extraEnv,
    },
    // Don't inherit stdio — we capture and format it ourselves
    stdio: ["pipe", "pipe", "pipe"],
  };

  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    stdout = execSync(args.join(" "), execOpts) as unknown as string;
  } catch (err: any) {
    stdout   = err.stdout  ?? "";
    stderr   = err.stderr  ?? err.message ?? "";
    exitCode = err.status  ?? 1;
  }

  // Extract addresses — broadcast JSON first, then stdout fallback
  const contracts = opts.broadcast
    ? parseBroadcastJson(opts.script)
    : parseStdout(stdout);

  // If broadcast JSON had nothing, try stdout anyway
  const finalContracts = contracts.length > 0 ? contracts : parseStdout(stdout);

  return { success: exitCode === 0, stdout, stderr, contracts: finalContracts, exitCode };
}

// ── Broadcast JSON parser ────────────────────────────────────────────

/**
 * Read the broadcast run-latest.json written by `forge script --broadcast`
 * and extract all CREATE transactions as ParsedContract entries.
 *
 * Broadcast JSON structure (relevant fields):
 * {
 *   "transactions": [{
 *     "transactionType": "CREATE" | "CALL",
 *     "contractName": "AgentRegistry",
 *     "contractAddress": "0x...",
 *     "hash": "0x...",
 *     "additionalContracts": [{ "address": "0x...", ... }]
 *   }]
 * }
 */
export function parseBroadcastJson(scriptPath: string): ParsedContract[] {
  // Derive JSON path from script name:  "script/Deploy.s.sol" → "Deploy.s.sol"
  const scriptFile = basename(scriptPath);
  const jsonPath   = join(BROADCAST_DIR, scriptFile, String(SEPOLIA_CHAIN_ID), "run-latest.json");

  if (!existsSync(jsonPath)) return [];

  let broadcast: any;
  try {
    broadcast = JSON.parse(readFileSync(jsonPath, "utf-8"));
  } catch {
    return [];
  }

  const contracts: ParsedContract[] = [];
  const seen = new Set<string>();

  for (const tx of broadcast.transactions ?? []) {
    if (tx.transactionType !== "CREATE") continue;

    const addr = tx.contractAddress as string | undefined;
    const name = tx.contractName   as string | undefined;
    const hash = tx.hash           as string | undefined;

    if (addr && !seen.has(addr.toLowerCase())) {
      seen.add(addr.toLowerCase());
      contracts.push({ name: name ?? "Unknown", address: addr, txHash: hash });
    }

    // Factory-created contracts appear in additionalContracts
    for (const extra of tx.additionalContracts ?? []) {
      const ea = extra.address as string | undefined;
      if (ea && !seen.has(ea.toLowerCase())) {
        seen.add(ea.toLowerCase());
        contracts.push({ name: "AgentBondingCurve", address: ea });
      }
    }
  }

  return contracts;
}

// ── Stdout fallback parser ───────────────────────────────────────────

/**
 * Extract addresses from forge console.log output.
 * Handles patterns like:
 *   "  AgentRegistry: 0xabc..."
 *   "  Agent 1 (AYS): 0xabc..."
 *   "  AGENT_REGISTRY= 0xabc..."
 */
export function parseStdout(stdout: string): ParsedContract[] {
  const contracts: ParsedContract[] = [];
  const seen = new Set<string>();

  // Match "SomeName: 0x..." or "SOME_KEY= 0x..."
  const re = /([A-Za-z0-9_\s()]+?)[:=]\s*(0x[0-9a-fA-F]{40})\b/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(stdout)) !== null) {
    const name    = m[1].trim();
    const address = m[2];
    if (!seen.has(address.toLowerCase())) {
      seen.add(address.toLowerCase());
      contracts.push({ name, address });
    }
  }

  return contracts;
}

// ── Env-var builder for sub-scripts ─────────────────────────────────

/** Build the extra env vars needed for SetupCRE / SimulateCRE / etc. */
export function buildScriptEnv(args: {
  agentMetrics?:        string;
  bondingCurveFactory?: string;
  predictionMarket?:    string;
  creWriter?:           string;
}): Record<string, string> {
  const env: Record<string, string> = {};
  if (args.agentMetrics)        env["AGENT_METRICS"]         = args.agentMetrics;
  if (args.bondingCurveFactory) env["BONDING_CURVE_FACTORY"] = args.bondingCurveFactory;
  if (args.predictionMarket)    env["PREDICTION_MARKET"]     = args.predictionMarket;
  if (args.creWriter)           env["CRE_WRITER_ADDRESS"]    = args.creWriter;
  return env;
}
