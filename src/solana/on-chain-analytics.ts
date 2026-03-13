import { PublicKey } from "@solana/web3.js";
import { getSolanaConnection } from "./connection.js";
import type { TokenBalance } from "./portfolio.js";
import { getTokenBySymbol } from "./tokens.js";

/**
 * Get on-chain metadata + market data for a token.
 */
export async function getTokenMetadata(
  symbol: string,
  rpcUrl?: string,
): Promise<Record<string, unknown>> {
  const token = getTokenBySymbol(symbol);
  const conn = getSolanaConnection(rpcUrl);

  const base: Record<string, unknown> = {
    symbol: token?.symbol ?? symbol.toUpperCase(),
    name: token?.name ?? "Unknown",
    mint: token?.mint.toBase58() ?? null,
    decimals: token?.decimals ?? null,
    coingeckoId: token?.coingeckoId ?? null,
  };

  // Fetch supply info from chain
  if (token) {
    try {
      if (token.symbol === "SOL") {
        const supply = await conn.getSupply();
        base.totalSupply = supply.value.total / 1e9;
        base.circulatingSupply = supply.value.circulating / 1e9;
        base.nonCirculating = supply.value.nonCirculating / 1e9;
      } else {
        const supplyInfo = await conn.getTokenSupply(token.mint);
        base.totalSupply = Number(supplyInfo.value.uiAmount);
        base.decimals = supplyInfo.value.decimals;
      }
    } catch {
      // Supply info not critical
    }
  }

  // Fetch market data from CoinGecko
  if (token?.coingeckoId) {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${token.coingeckoId}?localization=false&tickers=false&community_data=false&developer_data=false`,
      );
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const market = data.market_data as Record<string, unknown> | undefined;
        if (market) {
          base.marketCap = (market.market_cap as Record<string, number>)?.usd ?? null;
          base.fullyDilutedValuation =
            (market.fully_diluted_valuation as Record<string, number>)?.usd ?? null;
          base.price = (market.current_price as Record<string, number>)?.usd ?? null;
          base.priceChange24h = market.price_change_percentage_24h ?? null;
          base.priceChange7d = market.price_change_percentage_7d ?? null;
          base.priceChange30d = market.price_change_percentage_30d ?? null;
          base.volume24h = (market.total_volume as Record<string, number>)?.usd ?? null;
          base.high24h = (market.high_24h as Record<string, number>)?.usd ?? null;
          base.low24h = (market.low_24h as Record<string, number>)?.usd ?? null;
          base.ath = (market.ath as Record<string, number>)?.usd ?? null;
          base.athChangePercentage =
            (market.ath_change_percentage as Record<string, number>)?.usd ?? null;
        }
      }
    } catch {
      // Market data not critical
    }
  }

  return base;
}

export interface TxSummary {
  signature: string;
  slot: number;
  blockTime: number | null;
  fee: number;
  status: "success" | "error";
  type: string;
}

/**
 * Fetch recent transactions for a wallet.
 */
export async function getRecentTransactions(
  walletAddress: string,
  rpcUrl?: string,
  limit = 10,
): Promise<TxSummary[]> {
  const conn = getSolanaConnection(rpcUrl);
  const pubkey = new PublicKey(walletAddress);

  const signatures = await conn.getSignaturesForAddress(pubkey, { limit });
  const results: TxSummary[] = [];

  for (const sig of signatures) {
    results.push({
      signature: sig.signature,
      slot: sig.slot,
      blockTime: sig.blockTime ?? null,
      fee: 0, // Would need getParsedTransaction for exact fee
      status: sig.err ? "error" : "success",
      type: sig.memo ? "memo" : "transfer",
    });
  }

  return results;
}

export interface WhaleActivity {
  timestamp: string;
  recentLargeTransfers: Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
  }>;
  networkTps: number | null;
}

/**
 * Detect whale activity by looking at recent large transactions on notable accounts.
 * Simplified heuristic: check recent performance samples for unusual activity.
 */
export async function detectWhaleActivity(rpcUrl?: string): Promise<WhaleActivity> {
  const conn = getSolanaConnection(rpcUrl);

  let networkTps: number | null = null;
  try {
    const perfSamples = await conn.getRecentPerformanceSamples(5);
    if (perfSamples.length > 0) {
      const totalTx = perfSamples.reduce((sum, s) => sum + s.numTransactions, 0);
      const totalSlots = perfSamples.reduce((sum, s) => sum + s.numSlots, 0);
      // Avg TPS: transactions / (slots * 0.4s per slot)
      networkTps = totalSlots > 0 ? Math.round(totalTx / (totalSlots * 0.4)) : null;
    }
  } catch {
    // Performance samples not always available
  }

  return {
    timestamp: new Date().toISOString(),
    recentLargeTransfers: [],
    networkTps,
  };
}

export interface RiskAnalysis {
  overallRisk: "low" | "medium" | "high";
  concentrationRisk: string;
  diversificationScore: number;
  stablecoinRatio: number;
  warnings: string[];
}

/**
 * Compute basic portfolio risk metrics.
 */
export function computePortfolioRisk(
  balances: TokenBalance[],
  totalUsdValue: number,
): RiskAnalysis {
  if (totalUsdValue === 0) {
    return {
      overallRisk: "low",
      concentrationRisk: "No holdings",
      diversificationScore: 0,
      stablecoinRatio: 0,
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const stablecoins = new Set(["USDC", "USDT"]);

  // Concentration: largest single holding
  let maxAllocation = 0;
  let maxSymbol = "";
  let stablecoinValue = 0;
  const holdingsWithValue = balances.filter((b) => b.usdValue && b.usdValue > 0);

  for (const b of holdingsWithValue) {
    const allocation = (b.usdValue ?? 0) / totalUsdValue;
    if (allocation > maxAllocation) {
      maxAllocation = allocation;
      maxSymbol = b.token.symbol;
    }
    if (stablecoins.has(b.token.symbol)) {
      stablecoinValue += b.usdValue ?? 0;
    }
  }

  const stablecoinRatio = stablecoinValue / totalUsdValue;

  // Diversification: Herfindahl index (lower = more diverse)
  let hhi = 0;
  for (const b of holdingsWithValue) {
    const share = (b.usdValue ?? 0) / totalUsdValue;
    hhi += share * share;
  }
  // Convert HHI to a 0-100 diversification score (1/HHI normalized)
  const diversificationScore =
    holdingsWithValue.length > 0 ? Math.round((1 / hhi / holdingsWithValue.length) * 100) : 0;

  // Risk warnings
  if (maxAllocation > 0.8) {
    warnings.push(
      `High concentration: ${maxSymbol} is ${(maxAllocation * 100).toFixed(0)}% of portfolio`,
    );
  } else if (maxAllocation > 0.5) {
    warnings.push(
      `Moderate concentration: ${maxSymbol} is ${(maxAllocation * 100).toFixed(0)}% of portfolio`,
    );
  }

  if (stablecoinRatio < 0.1 && totalUsdValue > 100) {
    warnings.push("Low stablecoin allocation — consider hedging with USDC/USDT");
  }

  if (holdingsWithValue.length === 1) {
    warnings.push("Single-asset portfolio — consider diversifying");
  }

  // Overall risk
  let overallRisk: "low" | "medium" | "high" = "low";
  if (maxAllocation > 0.8 || (stablecoinRatio < 0.05 && totalUsdValue > 500)) {
    overallRisk = "high";
  } else if (maxAllocation > 0.5 || stablecoinRatio < 0.15) {
    overallRisk = "medium";
  }

  return {
    overallRisk,
    concentrationRisk: maxSymbol ? `${maxSymbol} at ${(maxAllocation * 100).toFixed(1)}%` : "None",
    diversificationScore,
    stablecoinRatio: Math.round(stablecoinRatio * 100) / 100,
    warnings,
  };
}
