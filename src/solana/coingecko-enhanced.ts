/**
 * Enhanced CoinGecko service with retry, caching, and rate-limit handling.
 * Patterns adapted from solana-app-kit coingeckoService.ts (Apache-2.0).
 */

const CG_API = "https://api.coingecko.com/api/v3";
const CG_PRO_API = "https://pro-api.coingecko.com/api/v3";

const CACHE_TTL_MS = 60_000; // 1 minute
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 10_000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = MAX_RETRIES,
): Promise<unknown> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, { headers, signal: controller.signal });

      if (res.status === 429) {
        // Rate limited — wait and retry
        const retryAfter = Number(res.headers.get("retry-after") || "2");
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (!res.ok) {
        throw new Error(`CoinGecko API error (${res.status}): ${await res.text()}`);
      }

      return await res.json();
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("CoinGecko request failed after retries");
}

function getBaseUrl(apiKey?: string): string {
  return apiKey?.startsWith("CG-") ? CG_PRO_API : CG_API;
}

function getHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    if (apiKey.startsWith("CG-")) {
      headers["x-cg-pro-api-key"] = apiKey;
    } else {
      headers["x-cg-demo-api-key"] = apiKey;
    }
  }
  return headers;
}

// ── Public API ─────────────────────────────────────────────────────────

export interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  price_change_percentage_24h: number;
  market_cap_rank: number | null;
}

/**
 * Get market data for a specific coin (with caching).
 */
export async function getCoinMarketData(
  coinId: string,
  apiKey?: string,
): Promise<CoinMarketData | null> {
  const cacheKey = `market:${coinId}`;
  const cached = getCached<CoinMarketData[]>(cacheKey);
  if (cached && cached.length > 0) {
    return cached[0];
  }

  const baseUrl = getBaseUrl(apiKey);
  const url = `${baseUrl}/coins/markets?vs_currency=usd&ids=${coinId}`;
  const data = (await fetchWithRetry(url, getHeaders(apiKey))) as CoinMarketData[];

  if (data.length > 0) {
    setCache(cacheKey, data);
    return data[0];
  }

  return null;
}

/**
 * Batch fetch market data for multiple coins.
 */
export async function getBatchCoinMarkets(
  coinIds: string[],
  apiKey?: string,
): Promise<CoinMarketData[]> {
  const cacheKey = `batch:${coinIds.toSorted().join(",")}`;
  const cached = getCached<CoinMarketData[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const baseUrl = getBaseUrl(apiKey);
  const ids = coinIds.join(",");
  const url = `${baseUrl}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=100`;
  const data = (await fetchWithRetry(url, getHeaders(apiKey))) as CoinMarketData[];

  setCache(cacheKey, data);
  return data;
}

/**
 * Get simple price data for multiple coins.
 */
export async function getSimplePrices(
  coinIds: string[],
  apiKey?: string,
): Promise<Record<string, { usd: number; usd_24h_change?: number; usd_24h_vol?: number }>> {
  const cacheKey = `prices:${coinIds.toSorted().join(",")}`;
  const cached = getCached<Record<string, Record<string, number>>>(cacheKey);
  if (cached) {
    return cached as Record<string, { usd: number; usd_24h_change?: number; usd_24h_vol?: number }>;
  }

  const baseUrl = getBaseUrl(apiKey);
  const ids = coinIds.join(",");
  const url = `${baseUrl}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
  const data = (await fetchWithRetry(url, getHeaders(apiKey))) as Record<
    string,
    Record<string, number>
  >;

  setCache(cacheKey, data);
  return data as Record<string, { usd: number; usd_24h_change?: number; usd_24h_vol?: number }>;
}

/**
 * Search CoinGecko for a coin by query string.
 */
export async function searchCoins(
  query: string,
  apiKey?: string,
): Promise<Array<{ id: string; name: string; symbol: string; market_cap_rank: number | null }>> {
  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = getCached<{
    coins: Array<{ id: string; name: string; symbol: string; market_cap_rank: number | null }>;
  }>(cacheKey);
  if (cached) {
    return cached.coins;
  }

  const baseUrl = getBaseUrl(apiKey);
  const url = `${baseUrl}/search?query=${encodeURIComponent(query)}`;
  const data = (await fetchWithRetry(url, getHeaders(apiKey))) as {
    coins: Array<{ id: string; name: string; symbol: string; market_cap_rank: number | null }>;
  };

  setCache(cacheKey, data);
  return data.coins;
}

/**
 * Clear the CoinGecko cache.
 */
export function clearCache(): void {
  cache.clear();
}
