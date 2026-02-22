#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  AgentIndex — Agent CLI
//  Deploy, manage, and trade autonomous AI agents from your terminal
// ═══════════════════════════════════════════════════════════════════

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  encodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  getAddress,
} from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load env from smart-contracts/.env ─────────────────────────
dotenv.config({ path: resolve(__dirname, '../smart-contracts/.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.SEPOLIA_RPC_URL || process.env.TENDERLY_VNET_RPC;
const AGENT_REGISTRY = process.env.AGENT_REGISTRY;
const BONDING_CURVE_FACTORY = process.env.BONDING_CURVE_FACTORY;
const AGENT_METRICS = process.env.AGENT_METRICS;

// ── State file for running agents ──────────────────────────────
const STATE_FILE = resolve(__dirname, '.agents-state.json');

function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── ABIs (minimal, from deployed contracts) ────────────────────
const AgentRegistryABI = [
  {
    type: 'function', name: 'registerAgent', stateMutability: 'nonpayable',
    inputs: [
      { name: 'wallet', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'strategyType', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'capabilities', type: 'string[]' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'getAgent', stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{
      name: '', type: 'tuple',
      components: [
        { name: 'id', type: 'uint256' },
        { name: 'wallet', type: 'address' },
        { name: 'creator', type: 'address' },
        { name: 'name', type: 'string' },
        { name: 'strategyType', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'capabilities', type: 'string[]' },
        { name: 'isActive', type: 'bool' },
        { name: 'registeredAt', type: 'uint256' },
      ],
    }],
  },
  {
    type: 'function', name: 'totalAgents', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'getActiveAgentIds', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function', name: 'deactivateAgent', stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [],
  },
  {
    type: 'event', name: 'AgentRegistered', anonymous: false,
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'strategyType', type: 'string', indexed: false },
    ],
  },
];

const BondingCurveFactoryABI = [
  {
    type: 'function', name: 'createCurve', stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'getCurve', stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'event', name: 'CurveCreated', anonymous: false,
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'curveAddress', type: 'address', indexed: false },
    ],
  },
];

const BondingCurveABI = [
  { type: 'function', name: 'buy', stateMutability: 'payable', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'sell', stateMutability: 'nonpayable', inputs: [{ name: 'tokenAmount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'currentPrice', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'reserveBalance', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'slope', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'getBuyPrice', stateMutability: 'view', inputs: [{ name: 'tokenAmount', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'getSellRefund', stateMutability: 'view', inputs: [{ name: 'tokenAmount', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'event', name: 'TokensBought', anonymous: false,
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'cost', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event', name: 'TokensSold', anonymous: false,
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'refund', type: 'uint256', indexed: false },
    ],
  },
];

const AgentMetricsABI = [
  {
    type: 'function', name: 'getMetrics', stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{
      name: '', type: 'tuple',
      components: [
        { name: 'roiBps', type: 'int256' },
        { name: 'winRateBps', type: 'uint256' },
        { name: 'maxDrawdownBps', type: 'uint256' },
        { name: 'sharpeRatioScaled', type: 'int256' },
        { name: 'tvlManaged', type: 'uint256' },
        { name: 'totalTrades', type: 'uint256' },
        { name: 'lastUpdated', type: 'uint256' },
      ],
    }],
  },
];

// ── Available skills map ───────────────────────────────────────
const AVAILABLE_SKILLS = {
  'wallet':     { name: 'Wallet (balances, transfers)', pkg: 'walletActionProvider' },
  'erc20':      { name: 'ERC-20 Tokens (transfer, approve)', pkg: 'erc20ActionProvider' },
  'weth':       { name: 'WETH (wrap/unwrap ETH)', pkg: 'wethActionProvider' },
  'pyth':       { name: 'Pyth Price Feeds', pkg: 'pythActionProvider' },
  'defillama':  { name: 'DefiLlama (TVL, yields)', pkg: 'defillamaActionProvider' },
  'sushi':      { name: 'SushiSwap (token swaps)', pkg: 'sushiRouterActionProvider' },
  'enso':       { name: 'Enso (DeFi aggregator)', pkg: 'ensoActionProvider' },
  'compound':   { name: 'Compound (lending/borrowing)', pkg: 'compoundActionProvider' },
  'moonwell':   { name: 'Moonwell (lending)', pkg: 'moonwellActionProvider' },
  'morpho':     { name: 'Morpho (lending)', pkg: 'morphoActionProvider' },
  'across':     { name: 'Across (cross-chain bridge)', pkg: 'acrossActionProvider' },
  'erc721':     { name: 'ERC-721 NFTs', pkg: 'erc721ActionProvider' },
  'zerion':     { name: 'Zerion (portfolio data)', pkg: 'zerionActionProvider' },
};

// ── Pretty print helpers ───────────────────────────────────────
const banner = () => {
  console.log('');
  console.log(chalk.cyan('  ╭──────────────────────────────────────╮'));
  console.log(chalk.cyan('  │') + chalk.bold.white('    AgentIndex — Agent Deploy CLI     ') + chalk.cyan('│'));
  console.log(chalk.cyan('  │') + chalk.dim('    Deploy real on-chain AI agents     ') + chalk.cyan('│'));
  console.log(chalk.cyan('  ╰──────────────────────────────────────╯'));
  console.log('');
};

function shortAddr(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function bpsToPercent(bps) {
  return (Number(bps) / 100).toFixed(2) + '%';
}

// ── Viem clients ───────────────────────────────────────────────
function getClients() {
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY not found in smart-contracts/.env');
  if (!RPC_URL) throw new Error('No RPC URL found (SEPOLIA_RPC_URL or TENDERLY_VNET_RPC)');

  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });
  return { account, publicClient, walletClient };
}

// ═══════════════════════════════════════════════════════════════
//  Command: list-agents
// ═══════════════════════════════════════════════════════════════
async function listAgents() {
  const spinner = ora('Reading agents from on-chain registry...').start();
  try {
    const { publicClient } = getClients();

    const totalAgents = await publicClient.readContract({
      address: AGENT_REGISTRY, abi: AgentRegistryABI, functionName: 'totalAgents',
    });

    if (totalAgents === 0n) {
      spinner.info('No agents registered yet.');
      return;
    }

    spinner.text = `Found ${totalAgents} agents, loading details...`;

    const agents = [];
    for (let i = 1n; i <= totalAgents; i++) {
      const agent = await publicClient.readContract({
        address: AGENT_REGISTRY, abi: AgentRegistryABI, functionName: 'getAgent', args: [i],
      });
      // Get curve address
      let curveAddress = null;
      let tokenPrice = 0n;
      try {
        curveAddress = await publicClient.readContract({
          address: BONDING_CURVE_FACTORY, abi: BondingCurveFactoryABI, functionName: 'getCurve', args: [i],
        });
        if (curveAddress && curveAddress !== '0x0000000000000000000000000000000000000000') {
          tokenPrice = await publicClient.readContract({
            address: curveAddress, abi: BondingCurveABI, functionName: 'currentPrice',
          });
        }
      } catch {}
      agents.push({ ...agent, curveAddress, tokenPrice });
    }

    spinner.stop();

    console.log(chalk.bold('\n  On-Chain Agents\n'));
    console.log(chalk.dim('  ──────────────────────────────────────────────────────────────'));

    for (const agent of agents) {
      const status = agent.isActive ? chalk.green('● ACTIVE') : chalk.red('● INACTIVE');
      const price = agent.tokenPrice > 0n ? formatEther(agent.tokenPrice) + ' ETH' : '—';
      console.log(`  ${chalk.bold(`#${agent.id}`)}  ${chalk.white(agent.name)}  ${status}`);
      console.log(`     ${chalk.dim('Wallet:')} ${shortAddr(agent.wallet)}  ${chalk.dim('Strategy:')} ${agent.strategyType}`);
      console.log(`     ${chalk.dim('Token Price:')} ${chalk.yellow(price)}  ${chalk.dim('Curve:')} ${shortAddr(agent.curveAddress)}`);
      if (agent.capabilities?.length > 0) {
        console.log(`     ${chalk.dim('Skills:')} ${agent.capabilities.join(', ')}`);
      }
      console.log(chalk.dim('  ──────────────────────────────────────────────────────────────'));
    }

    // Show state info for locally running agents
    const state = loadState();
    const running = Object.keys(state).filter(id => state[id].running);
    if (running.length > 0) {
      console.log(chalk.bold.green(`\n  ${running.length} agent(s) running locally`) + chalk.dim(` (IDs: ${running.join(', ')})`));
    }
  } catch (e) {
    spinner.fail(`Failed: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Command: agent-status
// ═══════════════════════════════════════════════════════════════
async function agentStatus(agentId) {
  const spinner = ora(`Loading agent #${agentId}...`).start();
  try {
    const { publicClient } = getClients();
    const id = BigInt(agentId);

    const agent = await publicClient.readContract({
      address: AGENT_REGISTRY, abi: AgentRegistryABI, functionName: 'getAgent', args: [id],
    });

    if (!agent.name) {
      spinner.fail(`Agent #${agentId} not found`);
      return;
    }

    // Read metrics
    let metrics = null;
    try {
      metrics = await publicClient.readContract({
        address: AGENT_METRICS, abi: AgentMetricsABI, functionName: 'getMetrics', args: [id],
      });
    } catch {}

    // Read curve data
    let curveData = null;
    try {
      const curveAddr = await publicClient.readContract({
        address: BONDING_CURVE_FACTORY, abi: BondingCurveFactoryABI, functionName: 'getCurve', args: [id],
      });
      if (curveAddr && curveAddr !== '0x0000000000000000000000000000000000000000') {
        const [price, supply, reserve, slopeVal, tokenName, tokenSymbol] = await Promise.all([
          publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'currentPrice' }),
          publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'totalSupply' }),
          publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'reserveBalance' }),
          publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'slope' }),
          publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'name' }),
          publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'symbol' }),
        ]);
        curveData = { address: curveAddr, price, supply, reserve, slope: slopeVal, tokenName, tokenSymbol };
      }
    } catch {}

    // Read wallet balance on-chain
    let balance = 0n;
    try {
      balance = await publicClient.getBalance({ address: agent.wallet });
    } catch {}

    spinner.stop();

    const status = agent.isActive ? chalk.green('● ACTIVE') : chalk.red('● INACTIVE');

    console.log(chalk.bold(`\n  Agent #${agent.id} — ${agent.name}  ${status}\n`));
    console.log(`  ${chalk.dim('Wallet:')}       ${agent.wallet}`);
    console.log(`  ${chalk.dim('Balance:')}      ${chalk.yellow(formatEther(balance) + ' ETH')}`);
    console.log(`  ${chalk.dim('Creator:')}      ${shortAddr(agent.creator)}`);
    console.log(`  ${chalk.dim('Strategy:')}     ${agent.strategyType}`);
    console.log(`  ${chalk.dim('Description:')}  ${agent.description}`);
    console.log(`  ${chalk.dim('Skills:')}       ${(agent.capabilities || []).join(', ') || '—'}`);
    console.log(`  ${chalk.dim('Registered:')}   ${new Date(Number(agent.registeredAt) * 1000).toLocaleString()}`);

    if (curveData) {
      console.log(chalk.bold(`\n  Token: ${curveData.tokenName} (${curveData.tokenSymbol})`));
      console.log(`  ${chalk.dim('Curve:')}        ${curveData.address}`);
      console.log(`  ${chalk.dim('Price:')}        ${chalk.yellow(formatEther(curveData.price) + ' ETH')}`);
      console.log(`  ${chalk.dim('Supply:')}       ${formatEther(curveData.supply)} tokens`);
      console.log(`  ${chalk.dim('Reserve:')}      ${formatEther(curveData.reserve)} ETH`);
    }

    if (metrics && metrics.lastUpdated > 0n) {
      console.log(chalk.bold('\n  CRE-Verified Metrics'));
      console.log(`  ${chalk.dim('ROI:')}          ${bpsToPercent(metrics.roiBps)}`);
      console.log(`  ${chalk.dim('Win Rate:')}     ${bpsToPercent(metrics.winRateBps)}`);
      console.log(`  ${chalk.dim('Drawdown:')}     ${bpsToPercent(metrics.maxDrawdownBps)}`);
      console.log(`  ${chalk.dim('Sharpe:')}       ${(Number(metrics.sharpeRatioScaled) / 100).toFixed(2)}`);
      console.log(`  ${chalk.dim('TVL:')}          $${Number(metrics.tvlManaged).toLocaleString()}`);
      console.log(`  ${chalk.dim('Total Trades:')} ${Number(metrics.totalTrades)}`);
      console.log(`  ${chalk.dim('Last Updated:')} ${new Date(Number(metrics.lastUpdated) * 1000).toLocaleString()}`);
    }

    // Check local state
    const state = loadState();
    if (state[agentId]?.running) {
      console.log(chalk.bold.green('\n  ▸ Agent is running locally'));
      console.log(`  ${chalk.dim('Started:')}      ${state[agentId].startedAt}`);
      console.log(`  ${chalk.dim('LLM:')}          ${state[agentId].llmProvider}`);
    }

    console.log('');
  } catch (e) {
    spinner.fail(`Failed: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Command: create-agent
// ═══════════════════════════════════════════════════════════════
async function createAgent() {
  console.log(chalk.bold('\n  Create a New AI Agent\n'));

  // Step 1: Agent identity
  const identity = await inquirer.prompt([
    { type: 'input', name: 'name', message: 'Agent Name:', validate: v => v.length > 0 || 'Required' },
    {
      type: 'list', name: 'strategyType', message: 'Strategy Type:',
      choices: ['momentum-trader', 'mean-reversion', 'yield-farmer', 'arbitrageur', 'custom'],
    },
    { type: 'input', name: 'description', message: 'Description (what should this agent do?):' },
  ]);

  // Step 2: Strategy prompt
  const { strategyPrompt } = await inquirer.prompt([{
    type: 'editor', name: 'strategyPrompt',
    message: 'Strategy instructions (what the AI should do — opens editor):',
    default: `You are "${identity.name}", an autonomous AI trading agent on Sepolia testnet.

Your strategy is ${identity.strategyType}.
${identity.description}

Rules:
- Check token prices before making trades
- Start with small positions
- Never risk more than 20% of your balance on a single trade
- Log your reasoning for each action
- Monitor your portfolio regularly`,
  }]);

  // Step 3: LLM provider
  const llm = await inquirer.prompt([
    {
      type: 'list', name: 'provider', message: 'LLM Provider:',
      choices: [
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI (GPT-4)', value: 'openai' },
        { name: 'Groq Cloud (Llama / Mixtral)', value: 'groq' },
        { name: 'Google (Gemini)', value: 'google' },
        { name: 'OpenAI-Compatible (Qwen, Kimi, etc.)', value: 'openai-compatible' },
      ],
    },
    { type: 'password', name: 'apiKey', message: 'API Key:', mask: '*', validate: v => v.length > 5 || 'Required' },
    {
      type: 'input', name: 'baseURL', message: 'Base URL (API endpoint):',
      when: (answers) => answers.provider === 'openai-compatible',
      default: 'https://api.moonshot.cn/v1',
    },
    {
      type: 'input', name: 'model', message: 'Model name:',
      default: (answers) => {
        if (answers.provider === 'anthropic') return 'claude-sonnet-4-20250514';
        if (answers.provider === 'openai') return 'gpt-4o';
        if (answers.provider === 'groq') return 'openai/gpt-oss-20b';
        if (answers.provider === 'openai-compatible') return 'moonshot-v1-8k';
        return 'gemini-2.0-flash';
      },
    },
  ]);

  // Step 4: Skills
  const { skills } = await inquirer.prompt([{
    type: 'checkbox', name: 'skills', message: 'Enable Skills:',
    choices: Object.entries(AVAILABLE_SKILLS).map(([key, val]) => ({
      name: val.name, value: key,
      checked: ['wallet', 'erc20', 'weth', 'pyth'].includes(key),
    })),
    validate: v => v.length > 0 || 'Select at least one skill',
  }]);

  // Step 5: Funding
  const { fundAmount } = await inquirer.prompt([{
    type: 'input', name: 'fundAmount', message: 'ETH to fund the agent with:',
    default: '0.01',
    validate: v => !isNaN(parseFloat(v)) && parseFloat(v) > 0 || 'Must be a positive number',
  }]);

  // Token config
  const tokenSymbol = identity.name.replace(/[^A-Z]/gi, '').slice(0, 4).toUpperCase() || 'AGNT';
  const tokenName = `${identity.name} Token`;

  // ── Confirm ──
  console.log(chalk.bold('\n  Review'));
  console.log(`  ${chalk.dim('Name:')}       ${identity.name}`);
  console.log(`  ${chalk.dim('Strategy:')}   ${identity.strategyType}`);
  console.log(`  ${chalk.dim('LLM:')}        ${llm.provider} (${llm.model})`);
  console.log(`  ${chalk.dim('Skills:')}     ${skills.join(', ')}`);
  console.log(`  ${chalk.dim('Funding:')}    ${fundAmount} ETH`);
  console.log(`  ${chalk.dim('Token:')}      ${tokenName} (${tokenSymbol})`);
  console.log('');

  const { confirm } = await inquirer.prompt([{
    type: 'confirm', name: 'confirm', message: 'Deploy this agent?', default: true,
  }]);

  if (!confirm) {
    console.log(chalk.yellow('  Cancelled.'));
    return;
  }

  // ═══════════ DEPLOYMENT ═══════════
  const { account, publicClient, walletClient } = getClients();
  let spinner;

  // Step 1: Generate agent wallet
  spinner = ora('Generating agent wallet...').start();
  const agentPrivateKey = generatePrivateKey();
  const agentAccount = privateKeyToAccount(agentPrivateKey);
  const agentAddress = agentAccount.address;
  spinner.succeed(`Agent wallet: ${chalk.cyan(agentAddress)}`);

  // Step 2: Fund the agent wallet
  spinner = ora(`Funding agent with ${fundAmount} ETH...`).start();
  try {
    const fundTx = await walletClient.sendTransaction({
      to: agentAddress,
      value: parseEther(fundAmount),
    });
    await publicClient.waitForTransactionReceipt({ hash: fundTx });
    spinner.succeed(`Funded: ${chalk.yellow(fundAmount + ' ETH')} → ${shortAddr(agentAddress)} (tx: ${shortAddr(fundTx)})`);
  } catch (e) {
    spinner.fail(`Funding failed: ${e.message}`);
    return;
  }

  // Step 3: Register on-chain
  spinner = ora('Registering agent on-chain...').start();
  let agentId;
  try {
    const regTx = await walletClient.writeContract({
      address: AGENT_REGISTRY,
      abi: AgentRegistryABI,
      functionName: 'registerAgent',
      args: [agentAddress, identity.name, identity.strategyType, identity.description, skills],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: regTx });

    // Parse AgentRegistered event to get the ID
    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({ abi: AgentRegistryABI, data: log.data, topics: log.topics });
        if (event.eventName === 'AgentRegistered') {
          agentId = Number(event.args.agentId);
          break;
        }
      } catch {}
    }

    if (!agentId) {
      // Fallback: read totalAgents
      const total = await publicClient.readContract({
        address: AGENT_REGISTRY, abi: AgentRegistryABI, functionName: 'totalAgents',
      });
      agentId = Number(total);
    }

    spinner.succeed(`Registered on-chain: Agent #${chalk.bold(agentId)} (tx: ${shortAddr(regTx)})`);
  } catch (e) {
    spinner.fail(`Registration failed: ${e.message}`);
    return;
  }

  // Step 4: Create bonding curve token
  spinner = ora('Creating bonding curve token...').start();
  let curveAddress;
  try {
    const curveTx = await walletClient.writeContract({
      address: BONDING_CURVE_FACTORY,
      abi: BondingCurveFactoryABI,
      functionName: 'createCurve',
      args: [BigInt(agentId), tokenName, tokenSymbol],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: curveTx });

    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({ abi: BondingCurveFactoryABI, data: log.data, topics: log.topics });
        if (event.eventName === 'CurveCreated') {
          curveAddress = event.args.curveAddress;
          break;
        }
      } catch {}
    }

    if (!curveAddress) {
      curveAddress = await publicClient.readContract({
        address: BONDING_CURVE_FACTORY, abi: BondingCurveFactoryABI, functionName: 'getCurve', args: [BigInt(agentId)],
      });
    }

    spinner.succeed(`Token deployed: ${chalk.cyan(tokenName)} at ${shortAddr(curveAddress)} (tx: ${shortAddr(curveTx)})`);
  } catch (e) {
    spinner.fail(`Curve creation failed: ${e.message}`);
    console.log(chalk.dim('  Agent was registered but token creation failed. You can retry later.'));
    return;
  }

  // Step 5: Start the agent loop
  spinner = ora('Starting autonomous agent loop...').start();
  try {
    await startAgentLoop({
      agentId,
      agentPrivateKey,
      agentAddress,
      name: identity.name,
      strategyPrompt,
      llmProvider: llm.provider,
      llmModel: llm.model,
      apiKey: llm.apiKey,
      skills,
      curveAddress,
    });
    spinner.succeed(chalk.bold.green('Agent is LIVE!'));
  } catch (e) {
    spinner.warn(`Agent registered but loop failed to start: ${e.message}`);
    console.log(chalk.dim('  The agent is registered on-chain. You can restart it manually.'));
  }

  // ── Summary ──
  console.log(chalk.bold('\n  ═══════════════════════════════════════'));
  console.log(chalk.bold.green(`  ✓ Agent #${agentId} deployed successfully!`));
  console.log(chalk.bold('  ═══════════════════════════════════════'));
  console.log(`  ${chalk.dim('Agent ID:')}      ${agentId}`);
  console.log(`  ${chalk.dim('Wallet:')}        ${agentAddress}`);
  console.log(`  ${chalk.dim('Private Key:')}   ${chalk.red(agentPrivateKey)} ${chalk.dim('(save this!)')}`);
  console.log(`  ${chalk.dim('Token:')}         ${tokenName} (${tokenSymbol})`);
  console.log(`  ${chalk.dim('Curve:')}         ${curveAddress}`);
  console.log('');
  console.log(`  ${chalk.dim('Buy tokens:')}    node cli.mjs buy-token ${agentId}`);
  console.log(`  ${chalk.dim('Check status:')}  node cli.mjs agent-status ${agentId}`);
  console.log(`  ${chalk.dim('Stop agent:')}    node cli.mjs stop-agent ${agentId}`);
  console.log('');

  // Save state
  const state = loadState();
  state[agentId] = {
    running: true,
    agentPrivateKey,
    agentAddress,
    name: identity.name,
    strategyPrompt,
    llmProvider: llm.provider,
    llmModel: llm.model,
    apiKey: llm.apiKey,
    baseURL: llm.baseURL || null,
    skills,
    curveAddress,
    startedAt: new Date().toISOString(),
  };
  saveState(state);
}

// ═══════════════════════════════════════════════════════════════
//  Agent Loop — Autonomous agent using AgentKit + Vercel AI SDK
// ═══════════════════════════════════════════════════════════════
async function startAgentLoop(config) {
  const { agentPrivateKey, strategyPrompt, llmProvider, llmModel, apiKey, skills } = config;

  // Dynamic imports for AgentKit + AI SDK
  const { AgentKit } = await import('@coinbase/agentkit');
  const { getVercelAITools } = await import('@coinbase/agentkit-vercel-ai-sdk');
  const { generateText } = await import('ai');

  // Create wallet client for the agent
  const agentAccount = privateKeyToAccount(agentPrivateKey);
  const agentWalletClient = createWalletClient({
    account: agentAccount,
    chain: sepolia,
    transport: http(RPC_URL),
  });

  // Import ViemWalletProvider
  const { ViemWalletProvider } = await import('@coinbase/agentkit');
  const walletProvider = new ViemWalletProvider(agentWalletClient, { rpcUrl: RPC_URL });

  // Build action providers from selected skills
  const actionProviders = [];
  for (const skill of skills) {
    const info = AVAILABLE_SKILLS[skill];
    if (!info) continue;
    try {
      const mod = await import('@coinbase/agentkit');
      if (mod[info.pkg]) {
        actionProviders.push(mod[info.pkg]());
      }
    } catch (e) {
      console.log(chalk.dim(`  Skipping skill "${skill}": ${e.message}`));
    }
  }

  // Initialize AgentKit
  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders,
  });

  // Get tools for the AI
  const tools = getVercelAITools(agentkit);

  // Get the LLM model
  let model;
  if (llmProvider === 'anthropic') {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    const anthropic = createAnthropic({ apiKey });
    model = anthropic(llmModel);
  } else if (llmProvider === 'openai') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openai = createOpenAI({ apiKey });
    model = openai(llmModel);
  } else if (llmProvider === 'groq') {
    const { createGroq } = await import('@ai-sdk/groq');
    const groq = createGroq({ apiKey });
    model = groq(llmModel);
  } else if (llmProvider === 'openai-compatible') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const provider = createOpenAI({ apiKey, baseURL: config.baseURL });
    model = provider(llmModel);
  } else {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    const google = createGoogleGenerativeAI({ apiKey });
    model = google(llmModel);
  }

  console.log(chalk.dim(`  Agent has ${Object.keys(tools).length} tools available`));

  // Run the agent loop
  let iteration = 0;
  let consecutiveErrors = 0;
  const intervalMs = 90_000; // Run every 90 seconds (rate-limit friendly)

  const runOnce = async () => {
    iteration++;
    try {
      console.log(chalk.dim(`  [Agent #${config.agentId}] Iteration ${iteration} starting...`));

      const result = await generateText({
        model,
        tools,
        maxSteps: 5,
        system: strategyPrompt,
        prompt: `This is iteration ${iteration}. Current time: ${new Date().toISOString()}. 
Check your wallet balance and the current state of your positions. 
Based on your strategy, decide what actions to take.
If this is your first iteration, start by checking prices and your balance.`,
      });

      consecutiveErrors = 0; // Reset on success
      console.log(chalk.dim(`  [Agent #${config.agentId}] Iteration ${iteration} complete: ${result.text?.slice(0, 100) || 'no text'}...`));

      // Log tool calls
      if (result.steps) {
        for (const step of result.steps) {
          if (step.toolCalls) {
            for (const tc of step.toolCalls) {
              console.log(chalk.cyan(`    ↳ ${tc.toolName}(${JSON.stringify(tc.args).slice(0, 80)})`));
            }
          }
        }
      }
    } catch (e) {
      consecutiveErrors++;
      const backoff = Math.min(consecutiveErrors * 10_000, 120_000); // 10s, 20s, ... up to 2min
      console.log(chalk.yellow(`  [Agent #${config.agentId}] Error in iteration ${iteration}: ${e.message}`));
      console.log(chalk.dim(`  Backing off ${backoff / 1000}s before next iteration...`));
      await new Promise(r => setTimeout(r, backoff));
    }
  };

  // Run first iteration immediately
  await runOnce();

  // Schedule subsequent runs
  const intervalId = setInterval(runOnce, intervalMs);

  // Store for cleanup
  if (!global.__agentIntervals) global.__agentIntervals = {};
  global.__agentIntervals[config.agentId] = intervalId;
}

// ═══════════════════════════════════════════════════════════════
//  Command: buy-token
// ═══════════════════════════════════════════════════════════════
async function buyToken(agentId) {
  const spinner = ora('Loading curve info...').start();
  try {
    const { publicClient, walletClient, account } = getClients();
    const id = BigInt(agentId);

    const curveAddr = await publicClient.readContract({
      address: BONDING_CURVE_FACTORY, abi: BondingCurveFactoryABI, functionName: 'getCurve', args: [id],
    });

    if (!curveAddr || curveAddr === '0x0000000000000000000000000000000000000000') {
      spinner.fail('No bonding curve found for this agent');
      return;
    }

    const [price, name, symbol] = await Promise.all([
      publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'currentPrice' }),
      publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'name' }),
      publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'symbol' }),
    ]);

    spinner.stop();
    console.log(`\n  ${chalk.bold(name)} (${symbol}) — Current Price: ${chalk.yellow(formatEther(price) + ' ETH')}`);

    const { ethAmount } = await inquirer.prompt([{
      type: 'input', name: 'ethAmount', message: 'ETH to spend:',
      default: '0.001',
      validate: v => !isNaN(parseFloat(v)) && parseFloat(v) > 0 || 'Must be positive',
    }]);

    const buySpinner = ora(`Buying ${symbol} with ${ethAmount} ETH...`).start();

    const tx = await walletClient.writeContract({
      address: curveAddr,
      abi: BondingCurveABI,
      functionName: 'buy',
      value: parseEther(ethAmount),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

    // Parse TokensBought event
    let tokensBought = '?';
    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({ abi: BondingCurveABI, data: log.data, topics: log.topics });
        if (event.eventName === 'TokensBought') {
          tokensBought = formatEther(event.args.amount);
          break;
        }
      } catch {}
    }

    buySpinner.succeed(`Bought ${chalk.green(tokensBought + ' ' + symbol)} for ${ethAmount} ETH (tx: ${shortAddr(tx)})`);

    // Show new price
    const newPrice = await publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'currentPrice' });
    console.log(`  New price: ${chalk.yellow(formatEther(newPrice) + ' ETH')}`);
    console.log('');
  } catch (e) {
    spinner.fail(`Buy failed: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Command: sell-token
// ═══════════════════════════════════════════════════════════════
async function sellToken(agentId) {
  const spinner = ora('Loading curve info...').start();
  try {
    const { publicClient, walletClient, account } = getClients();
    const id = BigInt(agentId);

    const curveAddr = await publicClient.readContract({
      address: BONDING_CURVE_FACTORY, abi: BondingCurveFactoryABI, functionName: 'getCurve', args: [id],
    });

    if (!curveAddr || curveAddr === '0x0000000000000000000000000000000000000000') {
      spinner.fail('No bonding curve found for this agent');
      return;
    }

    const [price, name, symbol, balance] = await Promise.all([
      publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'currentPrice' }),
      publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'name' }),
      publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'symbol' }),
      publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'balanceOf', args: [account.address] }),
    ]);

    spinner.stop();

    if (balance === 0n) {
      console.log(chalk.yellow(`\n  You don't own any ${symbol} tokens.`));
      return;
    }

    console.log(`\n  ${chalk.bold(name)} (${symbol})`);
    console.log(`  ${chalk.dim('Price:')}    ${formatEther(price)} ETH`);
    console.log(`  ${chalk.dim('Balance:')}  ${formatEther(balance)} ${symbol}`);

    const { tokenAmount } = await inquirer.prompt([{
      type: 'input', name: 'tokenAmount', message: `Tokens to sell (max ${formatEther(balance)}):`,
      default: formatEther(balance),
      validate: v => !isNaN(parseFloat(v)) && parseFloat(v) > 0 || 'Must be positive',
    }]);

    const sellSpinner = ora(`Selling ${tokenAmount} ${symbol}...`).start();

    const tx = await walletClient.writeContract({
      address: curveAddr,
      abi: BondingCurveABI,
      functionName: 'sell',
      args: [parseEther(tokenAmount)],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

    let refund = '?';
    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({ abi: BondingCurveABI, data: log.data, topics: log.topics });
        if (event.eventName === 'TokensSold') {
          refund = formatEther(event.args.refund);
          break;
        }
      } catch {}
    }

    sellSpinner.succeed(`Sold ${chalk.red(tokenAmount + ' ' + symbol)} → received ${chalk.green(refund + ' ETH')} (tx: ${shortAddr(tx)})`);

    const newPrice = await publicClient.readContract({ address: curveAddr, abi: BondingCurveABI, functionName: 'currentPrice' });
    console.log(`  New price: ${chalk.yellow(formatEther(newPrice) + ' ETH')}`);
    console.log('');
  } catch (e) {
    spinner.fail(`Sell failed: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Command: stop-agent
// ═══════════════════════════════════════════════════════════════
async function stopAgent(agentId) {
  const spinner = ora(`Stopping agent #${agentId}...`).start();

  // Stop local loop
  if (global.__agentIntervals?.[agentId]) {
    clearInterval(global.__agentIntervals[agentId]);
    delete global.__agentIntervals[agentId];
  }

  // Update state
  const state = loadState();
  if (state[agentId]) {
    state[agentId].running = false;
    state[agentId].stoppedAt = new Date().toISOString();
    saveState(state);
  }

  // Optionally deactivate on-chain
  try {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm', name: 'confirm',
      message: 'Also deactivate on-chain? (cannot be undone)',
      default: false,
    }]);

    if (confirm) {
      const { walletClient, publicClient } = getClients();
      const tx = await walletClient.writeContract({
        address: AGENT_REGISTRY,
        abi: AgentRegistryABI,
        functionName: 'deactivateAgent',
        args: [BigInt(agentId)],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      spinner.succeed(`Agent #${agentId} stopped and deactivated on-chain (tx: ${shortAddr(tx)})`);
    } else {
      spinner.succeed(`Agent #${agentId} stopped locally (still active on-chain)`);
    }
  } catch (e) {
    spinner.warn(`Agent stopped locally, but on-chain deactivation failed: ${e.message}`);
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════
//  Command: restart-agent
// ═══════════════════════════════════════════════════════════════
async function restartAgent(agentId) {
  const state = loadState();
  const agentState = state[agentId];

  if (!agentState) {
    console.log(chalk.red(`\n  ✗ No saved state for agent #${agentId}`));
    console.log(chalk.dim('  Only agents deployed from this CLI can be restarted.'));
    return;
  }

  if (agentState.running && global.__agentIntervals?.[agentId]) {
    console.log(chalk.yellow(`\n  Agent #${agentId} is already running.`));
    return;
  }

  // Ask if user wants to reconfigure LLM
  const { reconfigure } = await inquirer.prompt([{
    type: 'confirm', name: 'reconfigure',
    message: `Current LLM: ${agentState.llmProvider} (${agentState.llmModel}). Reconfigure?`,
    default: false,
  }]);

  let llmProvider = agentState.llmProvider;
  let llmModel = agentState.llmModel;
  let apiKey = agentState.apiKey;
  let baseURL = agentState.baseURL || null;

  if (reconfigure) {
    const llm = await inquirer.prompt([
      {
        type: 'list', name: 'provider', message: 'LLM Provider:',
        choices: [
          { name: 'Anthropic (Claude)', value: 'anthropic' },
          { name: 'OpenAI (GPT-4)', value: 'openai' },
          { name: 'Groq Cloud (Llama / Mixtral)', value: 'groq' },
          { name: 'Google (Gemini)', value: 'google' },
          { name: 'OpenAI-Compatible (Qwen, Kimi, etc.)', value: 'openai-compatible' },
        ],
      },
      { type: 'password', name: 'apiKey', message: 'API Key:', mask: '*', validate: v => v.length > 5 || 'Required' },
      {
        type: 'input', name: 'baseURL', message: 'Base URL (API endpoint):',
        when: (answers) => answers.provider === 'openai-compatible',
        default: 'https://api.moonshot.cn/v1',
      },
      {
        type: 'input', name: 'model', message: 'Model name:',
        default: (answers) => {
          if (answers.provider === 'anthropic') return 'claude-sonnet-4-20250514';
          if (answers.provider === 'openai') return 'gpt-4o';
          if (answers.provider === 'groq') return 'openai/gpt-oss-20b';
          if (answers.provider === 'openai-compatible') return 'moonshot-v1-8k';
          return 'gemini-2.0-flash';
        },
      },
    ]);
    llmProvider = llm.provider;
    llmModel = llm.model;
    apiKey = llm.apiKey;
    baseURL = llm.baseURL || null;
  }

  // Prompt for API key if not available
  if (!apiKey) {
    const { key } = await inquirer.prompt([{
      type: 'password', name: 'key', message: `API Key for ${llmProvider}:`, mask: '*',
      validate: v => v.length > 5 || 'Required',
    }]);
    apiKey = key;
  }

  console.log(chalk.bold(`\n  Restarting Agent #${agentId} — ${agentState.name}\n`));
  console.log(`  ${chalk.dim('LLM:')}     ${llmProvider} (${llmModel})`);
  console.log(`  ${chalk.dim('Skills:')}  ${(agentState.skills || []).join(', ')}`);
  console.log(`  ${chalk.dim('Wallet:')}  ${agentState.agentAddress}`);
  console.log('');

  const spinner = ora('Starting autonomous agent loop...').start();
  try {
    await startAgentLoop({
      agentId,
      agentPrivateKey: agentState.agentPrivateKey,
      agentAddress: agentState.agentAddress,
      name: agentState.name,
      strategyPrompt: agentState.strategyPrompt,
      llmProvider,
      llmModel,
      apiKey,
      baseURL,
      skills: agentState.skills,
      curveAddress: agentState.curveAddress,
    });
    spinner.succeed(chalk.bold.green('Agent is LIVE!'));

    // Update state with new LLM config
    state[agentId].running = true;
    state[agentId].llmProvider = llmProvider;
    state[agentId].llmModel = llmModel;
    state[agentId].apiKey = apiKey;
    state[agentId].baseURL = baseURL;
    state[agentId].startedAt = new Date().toISOString();
    saveState(state);
  } catch (e) {
    spinner.fail(`Failed to restart: ${e.message}`);
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════
//  Main — CLI Router
// ═══════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Check env
  if (!AGENT_REGISTRY || !BONDING_CURVE_FACTORY) {
    console.log(chalk.red('\n  ✗ Missing contract addresses in smart-contracts/.env'));
    console.log(chalk.dim('  Run the deploy CLI first: cd smart-contracts/cli && node cli.mjs pipeline'));
    process.exit(1);
  }

  if (command) {
    // Flag-based mode
    switch (command) {
      case 'create-agent':
        banner();
        await createAgent();
        break;
      case 'list-agents':
      case 'list':
        banner();
        await listAgents();
        break;
      case 'agent-status':
      case 'status':
        if (!args[1]) { console.log(chalk.red('  Usage: node cli.mjs agent-status <id>')); return; }
        banner();
        await agentStatus(args[1]);
        break;
      case 'buy-token':
      case 'buy':
        if (!args[1]) { console.log(chalk.red('  Usage: node cli.mjs buy-token <id>')); return; }
        banner();
        await buyToken(args[1]);
        break;
      case 'sell-token':
      case 'sell':
        if (!args[1]) { console.log(chalk.red('  Usage: node cli.mjs sell-token <id>')); return; }
        banner();
        await sellToken(args[1]);
        break;
      case 'stop-agent':
      case 'stop':
        if (!args[1]) { console.log(chalk.red('  Usage: node cli.mjs stop-agent <id>')); return; }
        banner();
        await stopAgent(args[1]);
        break;
      case 'restart-agent':
      case 'restart':
        if (!args[1]) { console.log(chalk.red('  Usage: node cli.mjs restart-agent <id>')); return; }
        banner();
        await restartAgent(args[1]);
        break;
      default:
        console.log(chalk.red(`  Unknown command: ${command}`));
        printUsage();
    }
  } else {
    // Interactive menu mode
    banner();
    const { choice } = await inquirer.prompt([{
      type: 'list', name: 'choice', message: 'What would you like to do?',
      choices: [
        { name: '🚀  Create Agent — deploy a new autonomous AI agent', value: 'create' },
        { name: '📋  List Agents — view all on-chain agents', value: 'list' },
        { name: '📊  Agent Status — check a specific agent', value: 'status' },
        { name: '💰  Buy Token — buy agent tokens on bonding curve', value: 'buy' },
        { name: '💸  Sell Token — sell agent tokens back', value: 'sell' },
        { name: '⏹️   Stop Agent — stop a running agent', value: 'stop' },
        { name: '🔄  Restart Agent — restart a stopped agent loop', value: 'restart' },
        new inquirer.Separator(),
        { name: '❌  Exit', value: 'exit' },
      ],
    }]);

    switch (choice) {
      case 'create':
        await createAgent();
        break;
      case 'list':
        await listAgents();
        break;
      case 'status': {
        const { id } = await inquirer.prompt([{ type: 'input', name: 'id', message: 'Agent ID:' }]);
        await agentStatus(id);
        break;
      }
      case 'buy': {
        const { id } = await inquirer.prompt([{ type: 'input', name: 'id', message: 'Agent ID:' }]);
        await buyToken(id);
        break;
      }
      case 'sell': {
        const { id } = await inquirer.prompt([{ type: 'input', name: 'id', message: 'Agent ID:' }]);
        await sellToken(id);
        break;
      }
      case 'stop': {
        const { id } = await inquirer.prompt([{ type: 'input', name: 'id', message: 'Agent ID:' }]);
        await stopAgent(id);
        break;
      }
      case 'restart': {
        const { id } = await inquirer.prompt([{ type: 'input', name: 'id', message: 'Agent ID:' }]);
        await restartAgent(id);
        break;
      }
      case 'exit':
        process.exit(0);
    }
  }
}

function printUsage() {
  console.log(chalk.bold('\n  Usage:'));
  console.log(`  ${chalk.cyan('node cli.mjs')}                     Interactive menu`);
  console.log(`  ${chalk.cyan('node cli.mjs create-agent')}         Deploy a new AI agent`);
  console.log(`  ${chalk.cyan('node cli.mjs list-agents')}          List all on-chain agents`);
  console.log(`  ${chalk.cyan('node cli.mjs agent-status <id>')}    Check agent details`);
  console.log(`  ${chalk.cyan('node cli.mjs buy-token <id>')}       Buy agent tokens`);
  console.log(`  ${chalk.cyan('node cli.mjs sell-token <id>')}      Sell agent tokens`);
  console.log(`  ${chalk.cyan('node cli.mjs stop-agent <id>')}      Stop a running agent`);
  console.log(`  ${chalk.cyan('node cli.mjs restart-agent <id>')}   Restart a stopped agent`);
  console.log('');
}

main().catch(e => {
  console.error(chalk.red(`\n  Fatal error: ${e.message}`));
  process.exit(1);
});
