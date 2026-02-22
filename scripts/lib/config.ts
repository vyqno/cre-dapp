/**
 * Config — environment loading, path resolution, chain constants.
 *
 * Reads from smart-contracts/.env which is the single source of truth
 * for both Forge scripts and this Node.js CLI.
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

// ── Paths ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SCRIPTS_DIR      = resolve(__dirname, "..");
export const PROJECT_ROOT     = resolve(SCRIPTS_DIR, "..");
export const SMART_CONTRACTS  = join(PROJECT_ROOT, "smart-contracts");
export const BROADCAST_DIR    = join(SMART_CONTRACTS, "broadcast");
export const DEPLOYMENTS_DIR  = join(SMART_CONTRACTS, "deployments");
export const DEPLOYMENTS_FILE = join(DEPLOYMENTS_DIR, "sepolia.json");
export const ENV_FILE         = join(SMART_CONTRACTS, ".env");
export const WORKFLOWS_ABI    = join(PROJECT_ROOT, "workflows", "contracts", "abi");

// ── Chain ───────────────────────────────────────────────────────────

export const SEPOLIA_CHAIN_ID = 11155111;
export const ETHERSCAN_BASE   = "https://sepolia.etherscan.io";

// ── Env ─────────────────────────────────────────────────────────────

export interface EnvConfig {
  privateKey: `0x${string}`;
  sepoliaRpcUrl: string;
  etherscanApiKey: string;
  // Optional — filled after deploy
  agentRegistry?:       string;
  agentMetrics?:        string;
  bondingCurveFactory?: string;
  predictionMarket?:    string;
  creWriterAddress?:    string;
}

/** Parse a KEY=VALUE .env file (skips comments and blank lines). */
function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const lines = readFileSync(filePath, "utf-8").split("\n");
  const result: Record<string, string> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    result[key] = val;
  }
  return result;
}

let _cached: EnvConfig | null = null;

export function loadEnvConfig(): EnvConfig {
  if (_cached) return _cached;

  // Merge .env file into process.env so Forge picks it up too
  const file = parseEnvFile(ENV_FILE);
  for (const [k, v] of Object.entries(file)) {
    if (!process.env[k]) process.env[k] = v;
  }

  const get = (key: string) => process.env[key] ?? file[key];

  const privateKey = get("PRIVATE_KEY");
  const sepoliaRpcUrl = get("SEPOLIA_RPC_URL");
  const etherscanApiKey = get("ETHERSCAN_API_KEY");

  if (!privateKey)     throw new Error("PRIVATE_KEY missing from .env");
  if (!sepoliaRpcUrl)  throw new Error("SEPOLIA_RPC_URL missing from .env");
  if (!etherscanApiKey) throw new Error("ETHERSCAN_API_KEY missing from .env");

  _cached = {
    privateKey:           privateKey as `0x${string}`,
    sepoliaRpcUrl,
    etherscanApiKey,
    agentRegistry:        get("AGENT_REGISTRY"),
    agentMetrics:         get("AGENT_METRICS"),
    bondingCurveFactory:  get("BONDING_CURVE_FACTORY"),
    predictionMarket:     get("PREDICTION_MARKET"),
    creWriterAddress:     get("CRE_WRITER_ADDRESS"),
  };

  return _cached;
}

/** Force reload (use after writing new addresses to .env). */
export function reloadEnvConfig(): EnvConfig {
  _cached = null;
  return loadEnvConfig();
}
