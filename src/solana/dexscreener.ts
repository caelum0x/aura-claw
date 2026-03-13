/**
 * DexScreener integration for token discovery and market data.
 * Adapted from solana-agent-kit (Apache-2.0).
 */

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";
const JUPITER_TOKEN_API = "https://tokens.jup.ag/token";

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  volume: { h24: number };
  priceChange: { h24: number };
  liquidity: { usd: number };
  fdv: number;
}

export interface JupiterTokenData {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  tags: string[];
  logoURI: string;
  daily_volume: number;
  freeze_authority: string | null;
  mint_authority: string | null;
  extensions: { coingeckoId?: string };
}

/**
 * Get token metadata from Jupiter by mint address.
 */
export async function getTokenDataByAddress(mint: string): Promise<JupiterTokenData | null> {
  const res = await fetch(`${JUPITER_TOKEN_API}/${mint}`);
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as JupiterTokenData;
}

/**
 * Search DexScreener for a token by ticker symbol.
 * Returns the mint address of the highest-FDV Solana token matching the ticker.
 */
export async function getTokenAddressFromTicker(ticker: string): Promise<string | null> {
  const res = await fetch(`${DEXSCREENER_API}/search?q=${encodeURIComponent(ticker)}`);
  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { pairs?: DexScreenerPair[] };
  if (!data.pairs || data.pairs.length === 0) {
    return null;
  }

  // Filter to Solana pairs, sort by FDV descending
  const solanaPairs = data.pairs
    .filter((p) => p.chainId === "solana")
    .toSorted((a, b) => (b.fdv ?? 0) - (a.fdv ?? 0));

  if (solanaPairs.length === 0) {
    return null;
  }

  return solanaPairs[0].baseToken.address;
}

/**
 * Get full token data by ticker: resolves address via DexScreener, then fetches Jupiter metadata.
 */
export async function getTokenDataByTicker(ticker: string): Promise<JupiterTokenData | null> {
  const address = await getTokenAddressFromTicker(ticker);
  if (!address) {
    return null;
  }
  return getTokenDataByAddress(address);
}

/**
 * Get DexScreener pairs for a token mint address.
 */
export async function getDexScreenerPairs(mint: string): Promise<DexScreenerPair[]> {
  const res = await fetch(`${DEXSCREENER_API}/tokens/${mint}`);
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as { pairs?: DexScreenerPair[] };
  return data.pairs ?? [];
}
