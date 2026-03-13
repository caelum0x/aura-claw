/**
 * Pyth oracle integration for on-chain verified price feeds.
 * Adapted from solana-agent-kit (Apache-2.0).
 */

const PYTH_HERMES_API = "https://hermes.pyth.network/v2";

export interface PythPriceFeed {
  id: string;
  attributes: {
    asset_type: string;
    base: string;
    quote_currency: string;
    symbol: string;
  };
}

export interface PythPrice {
  feedId: string;
  price: number;
  confidence: number;
  publishTime: number;
}

/**
 * Look up a Pyth price feed ID by token symbol.
 */
export async function fetchPythPriceFeedId(tokenSymbol: string): Promise<string | null> {
  const res = await fetch(
    `${PYTH_HERMES_API}/price_feeds?query=${encodeURIComponent(tokenSymbol)}&asset_type=crypto`,
  );
  if (!res.ok) {
    return null;
  }

  const feeds = (await res.json()) as PythPriceFeed[];
  if (feeds.length === 0) {
    return null;
  }

  // Prefer exact symbol match with USD quote
  const exact = feeds.find(
    (f) =>
      f.attributes.base.toUpperCase() === tokenSymbol.toUpperCase() &&
      f.attributes.quote_currency === "USD",
  );
  return exact?.id ?? feeds[0].id;
}

/**
 * Fetch the latest price from Pyth Hermes for a given feed ID.
 */
export async function fetchPythPrice(feedId: string): Promise<PythPrice | null> {
  const res = await fetch(`${PYTH_HERMES_API}/updates/price/latest?ids[]=${feedId}`);
  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as {
    parsed?: Array<{
      id: string;
      price: { price: string; expo: number; conf: string; publish_time: number };
    }>;
  };

  const parsed = data.parsed?.[0];
  if (!parsed) {
    return null;
  }

  const rawPrice = Number(parsed.price.price);
  const exponent = parsed.price.expo;
  const price = rawPrice * Math.pow(10, exponent);
  const confidence = Number(parsed.price.conf) * Math.pow(10, exponent);

  return {
    feedId: parsed.id,
    price,
    confidence,
    publishTime: parsed.price.publish_time,
  };
}

/**
 * Get the current USD price of a token via Pyth oracle.
 * Returns null if the feed is not available.
 */
export async function getPythTokenPrice(tokenSymbol: string): Promise<number | null> {
  const feedId = await fetchPythPriceFeedId(tokenSymbol);
  if (!feedId) {
    return null;
  }
  const priceData = await fetchPythPrice(feedId);
  return priceData?.price ?? null;
}
