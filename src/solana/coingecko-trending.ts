/**
 * CoinGecko trending tokens and top gainers.
 * Adapted from solana-agent-kit plugin-misc (Apache-2.0).
 */

const CG_FREE_API = "https://api.coingecko.com/api/v3";
const CG_PRO_API = "https://pro-api.coingecko.com/api/v3";

export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string;
  price_btc: number;
  score: number;
}

export interface TrendingResult {
  coins: Array<{ item: TrendingCoin }>;
  nfts: unknown[];
  categories: unknown[];
}

export interface TopGainer {
  id: string;
  symbol: string;
  name: string;
  image: string;
  market_cap_rank: number | null;
  usd: number;
  usd_24h_vol: number;
  usd_24h_change: number;
}

export type GainerDuration = "1h" | "24h" | "7d" | "14d" | "30d" | "60d" | "1y";

function getHeaders(apiKey?: string, isPro?: boolean): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    if (isPro) {
      headers["x-cg-pro-api-key"] = apiKey;
    } else {
      headers["x-cg-demo-api-key"] = apiKey;
    }
  }
  return headers;
}

/**
 * Get trending tokens from CoinGecko.
 * Works with both free and pro API keys.
 */
export async function getTrendingTokens(apiKey?: string): Promise<TrendingResult> {
  const isPro = apiKey && apiKey.startsWith("CG-");
  const baseUrl = isPro ? CG_PRO_API : CG_FREE_API;

  const res = await fetch(`${baseUrl}/search/trending`, {
    headers: getHeaders(apiKey, !!isPro),
  });

  if (!res.ok) {
    throw new Error(`CoinGecko trending failed (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as TrendingResult;
}

/**
 * Get top gainers/losers from CoinGecko.
 * Requires a Pro API key.
 */
export async function getTopGainers(
  proApiKey: string,
  opts?: { duration?: GainerDuration; topCoins?: 300 | 500 | 1000 | "all" },
): Promise<unknown> {
  const duration = opts?.duration ?? "24h";
  const topCoins = opts?.topCoins ?? "all";

  const url = `${CG_PRO_API}/coins/top_gainers_losers?vs_currency=usd&duration=${duration}&top_coins=${topCoins}`;
  const res = await fetch(url, {
    headers: getHeaders(proApiKey, true),
  });

  if (!res.ok) {
    throw new Error(`CoinGecko top gainers failed (${res.status}): ${await res.text()}`);
  }

  return await res.json();
}

/**
 * Get trending Solana pools from CoinGecko on-chain API.
 * Requires a Pro API key.
 */
export async function getTrendingSolanaPools(
  proApiKey: string,
  duration: "5m" | "1h" | "6h" | "24h" = "24h",
): Promise<unknown> {
  const url = `${CG_PRO_API}/onchain/networks/solana/trending_pools?duration=${duration}`;
  const res = await fetch(url, {
    headers: getHeaders(proApiKey, true),
  });

  if (!res.ok) {
    throw new Error(`CoinGecko trending pools failed (${res.status}): ${await res.text()}`);
  }

  return await res.json();
}

/**
 * Get the latest Solana pools from CoinGecko on-chain API.
 * Requires a Pro API key.
 */
export async function getLatestSolanaPools(proApiKey: string): Promise<unknown> {
  const url = `${CG_PRO_API}/onchain/networks/solana/new_pools`;
  const res = await fetch(url, {
    headers: getHeaders(proApiKey, true),
  });

  if (!res.ok) {
    throw new Error(`CoinGecko latest pools failed (${res.status}): ${await res.text()}`);
  }

  return await res.json();
}
