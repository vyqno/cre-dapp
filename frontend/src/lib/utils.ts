import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Format a bigint wei value to a human-readable ETH string */
export function formatEth(wei: bigint, decimals: number = 4): string {
  const whole = wei / BigInt(1e18);
  const frac = wei % BigInt(1e18);
  const fracStr = frac.toString().padStart(18, "0").slice(0, decimals);
  return `${whole}.${fracStr}`;
}

export function explorerTxUrl(txHash: string): string {
  return `${process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL}/address/${address}`;
}

/** Format a prediction market metric threshold for display */
export function formatThreshold(metric: number, threshold: bigint): string {
  switch (metric) {
    case 0: // ROI (bps x 100)
      return `${(Number(threshold) / 10000).toFixed(2)}%`;
    case 1: // WIN_RATE (bps)
      return `${(Number(threshold) / 100).toFixed(2)}%`;
    case 2: // SHARPE (scaled x 10000)
      return `${(Number(threshold) / 10000).toFixed(2)}`;
    case 3: // TVL (raw token decimals, USDC = 6)
      return `$${(Number(threshold) / 1e6).toLocaleString()}`;
    case 4: // TRADES (absolute)
      return Number(threshold).toLocaleString();
    case 5: // DRAWDOWN (bps)
      return `${(Number(threshold) / 100).toFixed(2)}%`;
    default:
      return Number(threshold).toString();
  }
}

/** Format milliseconds remaining as human-readable countdown */
export function formatTimeLeft(ms: number): string {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}
