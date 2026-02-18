// Mock data for demo — replace with on-chain reads after deployment

export interface AgentData {
  id: number;
  name: string;
  wallet: string;
  strategyType: string;
  description: string;
  isActive: boolean;
  registeredAt: number;
}

export interface MetricsData {
  roiBps: number;
  winRateBps: number;
  maxDrawdownBps: number;
  sharpeRatioScaled: number;
  tvlManaged: number;
  totalTrades: number;
  lastUpdated: number;
}

export interface AgentWithMetrics extends AgentData {
  metrics: MetricsData;
  curveAddress: string;
  tokenPrice: number; // in wei
  totalSupply: number; // in wei
  reserveBalance: number; // in wei
}

export const MOCK_AGENTS: AgentWithMetrics[] = [
  {
    id: 1,
    name: "AlphaYield Bot",
    wallet: "0x1234567890abcdef1234567890abcdef12345678",
    strategyType: "DeFi Yield",
    description: "Multi-protocol yield optimization across Aave, Compound, and Uniswap v4",
    isActive: true,
    registeredAt: 1739500000,
    metrics: {
      roiBps: 152500,
      winRateBps: 7500,
      maxDrawdownBps: 3200,
      sharpeRatioScaled: 18500,
      tvlManaged: 1_000_000_000_000, // 1M USDC (6 decimals)
      totalTrades: 847,
      lastUpdated: Date.now() / 1000 - 120,
    },
    curveAddress: "0xaaaa111122223333444455556666777788889999",
    tokenPrice: 250000000000000, // 0.00025 ETH
    totalSupply: 50000000000000000000000, // 50k tokens
    reserveBalance: 5000000000000000000, // 5 ETH
  },
  {
    id: 2,
    name: "MomentumTrader",
    wallet: "0xabcdef1234567890abcdef1234567890abcdef12",
    strategyType: "DEX Trading",
    description: "Cross-DEX momentum trading with MEV protection via Flashbots",
    isActive: true,
    registeredAt: 1739400000,
    metrics: {
      roiBps: 89200,
      winRateBps: 6200,
      maxDrawdownBps: 5800,
      sharpeRatioScaled: 14200,
      tvlManaged: 500_000_000_000, // 500K USDC
      totalTrades: 2341,
      lastUpdated: Date.now() / 1000 - 60,
    },
    curveAddress: "0xbbbb111122223333444455556666777788889999",
    tokenPrice: 180000000000000, // 0.00018 ETH
    totalSupply: 35000000000000000000000, // 35k tokens
    reserveBalance: 3200000000000000000, // 3.2 ETH
  },
  {
    id: 3,
    name: "StableHarvester",
    wallet: "0x9876543210fedcba9876543210fedcba98765432",
    strategyType: "Stablecoin Farming",
    description: "Conservative stablecoin farming across blue-chip protocols",
    isActive: true,
    registeredAt: 1739300000,
    metrics: {
      roiBps: 24500,
      winRateBps: 9200,
      maxDrawdownBps: 800,
      sharpeRatioScaled: 32000,
      tvlManaged: 2_500_000_000_000, // 2.5M USDC
      totalTrades: 156,
      lastUpdated: Date.now() / 1000 - 300,
    },
    curveAddress: "0xcccc111122223333444455556666777788889999",
    tokenPrice: 150000000000000, // 0.00015 ETH
    totalSupply: 80000000000000000000000, // 80k tokens
    reserveBalance: 8000000000000000000, // 8 ETH
  },
  {
    id: 4,
    name: "DeltaNeutral-v2",
    wallet: "0xfedcba9876543210fedcba9876543210fedcba98",
    strategyType: "Delta Neutral",
    description: "Market-neutral strategies using perpetuals and spot hedging",
    isActive: true,
    registeredAt: 1739200000,
    metrics: {
      roiBps: 35800,
      winRateBps: 8100,
      maxDrawdownBps: 1500,
      sharpeRatioScaled: 25000,
      tvlManaged: 750_000_000_000, // 750K USDC
      totalTrades: 512,
      lastUpdated: Date.now() / 1000 - 180,
    },
    curveAddress: "0xdddd111122223333444455556666777788889999",
    tokenPrice: 200000000000000, // 0.0002 ETH
    totalSupply: 42000000000000000000000, // 42k tokens
    reserveBalance: 4500000000000000000, // 4.5 ETH
  },
  {
    id: 5,
    name: "LiquiditySniper",
    wallet: "0x1111222233334444555566667777888899990000",
    strategyType: "Liquidity Provision",
    description: "Concentrated liquidity management on Uniswap v4 with dynamic rebalancing",
    isActive: true,
    registeredAt: 1739100000,
    metrics: {
      roiBps: -12300,
      winRateBps: 4500,
      maxDrawdownBps: 8200,
      sharpeRatioScaled: 8000,
      tvlManaged: 200_000_000_000, // 200K USDC
      totalTrades: 1893,
      lastUpdated: Date.now() / 1000 - 600,
    },
    curveAddress: "0xeeee111122223333444455556666777788889999",
    tokenPrice: 80000000000000, // 0.00008 ETH
    totalSupply: 15000000000000000000000, // 15k tokens
    reserveBalance: 800000000000000000, // 0.8 ETH
  },
  {
    id: 6,
    name: "ArbitrageKing",
    wallet: "0xaaaa0000bbbb1111cccc2222dddd3333eeee4444",
    strategyType: "Cross-Chain Arb",
    description: "Cross-chain arbitrage exploiting price discrepancies via CCIP bridges",
    isActive: true,
    registeredAt: 1739000000,
    metrics: {
      roiBps: 67400,
      winRateBps: 5800,
      maxDrawdownBps: 4100,
      sharpeRatioScaled: 16000,
      tvlManaged: 350_000_000_000, // 350K USDC
      totalTrades: 4521,
      lastUpdated: Date.now() / 1000 - 90,
    },
    curveAddress: "0xffff111122223333444455556666777788889999",
    tokenPrice: 220000000000000, // 0.00022 ETH
    totalSupply: 28000000000000000000000, // 28k tokens
    reserveBalance: 3800000000000000000, // 3.8 ETH
  },
];

// Price history mock (last 30 days)
export function generatePriceHistory(basePrice: number, volatility: number) {
  const points = [];
  let price = basePrice * 0.6;
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    price += (Math.random() - 0.4) * volatility;
    if (price < basePrice * 0.1) price = basePrice * 0.1;
    points.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: Number((price / 1e14).toFixed(4)),
    });
  }
  return points;
}
