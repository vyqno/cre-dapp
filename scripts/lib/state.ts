/**
 * State — read/write deployment state to deployments/sepolia.json.
 *
 * This file acts as the persistent memory for the CLI — which contracts
 * have been deployed, their addresses, and which pipeline steps are done.
 * Enables recovery from partial deployments without re-deploying everything.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { DEPLOYMENTS_DIR, DEPLOYMENTS_FILE, SEPOLIA_CHAIN_ID } from "./config.js";

// ── Types ────────────────────────────────────────────────────────────

export interface ContractRecord {
  address: string;
  txHash?:      string;
  blockNumber?: number;
  deployedAt?:  string;
  verified?:    boolean;
}

export interface BondingCurveRecord {
  address: string;
  name:    string;
  symbol:  string;
  agentId: number;
  txHash?: string;
}

export interface PipelineSteps {
  coreDeployed:             boolean;
  predictionMarketDeployed: boolean;
  creSetupComplete:         boolean;
  metricsSeeded:            boolean;
}

export interface DeploymentState {
  chainId:     number;
  chainName:   string;
  deployer:    string;
  deployedAt:  string;
  lastUpdated: string;
  contracts: {
    AgentRegistry?:       ContractRecord;
    AgentMetrics?:        ContractRecord;
    BondingCurveFactory?: ContractRecord;
    PredictionMarket?:    ContractRecord;
  };
  bondingCurves: Record<string, BondingCurveRecord>;
  steps: PipelineSteps;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function loadState(): DeploymentState | null {
  if (!existsSync(DEPLOYMENTS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(DEPLOYMENTS_FILE, "utf-8")) as DeploymentState;
  } catch {
    return null;
  }
}

export function saveState(state: DeploymentState): void {
  if (!existsSync(DEPLOYMENTS_DIR)) mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  state.lastUpdated = new Date().toISOString();
  writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/** Create a fresh state skeleton (used when starting a new deployment). */
export function createFreshState(deployerAddress: string): DeploymentState {
  return {
    chainId:     SEPOLIA_CHAIN_ID,
    chainName:   "Sepolia",
    deployer:    deployerAddress,
    deployedAt:  new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    contracts:   {},
    bondingCurves: {},
    steps: {
      coreDeployed:             false,
      predictionMarketDeployed: false,
      creSetupComplete:         false,
      metricsSeeded:            false,
    },
  };
}

/**
 * Build state from already-deployed addresses in .env.
 * Used when contracts exist but no state file was created by this CLI.
 * The caller must derive and pass the deployer address (avoids ESM/CJS issues).
 */
export function stateFromEnv(
  deployer: string,
  env: {
    agentRegistry?:       string;
    agentMetrics?:        string;
    bondingCurveFactory?: string;
    predictionMarket?:    string;
  },
): DeploymentState {
  const s = createFreshState(deployer);
  if (env.agentRegistry)       s.contracts.AgentRegistry       = { address: env.agentRegistry };
  if (env.agentMetrics)        s.contracts.AgentMetrics        = { address: env.agentMetrics };
  if (env.bondingCurveFactory) s.contracts.BondingCurveFactory = { address: env.bondingCurveFactory };
  if (env.predictionMarket)    s.contracts.PredictionMarket    = { address: env.predictionMarket };

  s.steps.coreDeployed             = !!(env.agentRegistry && env.agentMetrics && env.bondingCurveFactory);
  s.steps.predictionMarketDeployed = !!env.predictionMarket;

  return s;
}
