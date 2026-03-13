import { PublicKey } from "@solana/web3.js";

export interface TokenInfo {
  symbol: string;
  name: string;
  mint: PublicKey;
  decimals: number;
  coingeckoId?: string;
}

// Well-known Solana token mints (AURA is lazy-resolved)
const STATIC_TOKENS: Record<string, TokenInfo> = {
  SOL: {
    symbol: "SOL",
    name: "Solana",
    mint: new PublicKey("So11111111111111111111111111111111111111112"),
    decimals: 9,
    coingeckoId: "solana",
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  USDT: {
    symbol: "USDT",
    name: "Tether",
    mint: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    decimals: 6,
    coingeckoId: "tether",
  },
  BONK: {
    symbol: "BONK",
    name: "Bonk",
    mint: new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"),
    decimals: 5,
    coingeckoId: "bonk",
  },
  JUP: {
    symbol: "JUP",
    name: "Jupiter",
    mint: new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"),
    decimals: 6,
    coingeckoId: "jupiter-exchange-solana",
  },
};

let configuredAuraMint: string | undefined;

/** Set the AURA mint address from config (call once at startup). */
export function setAuraMint(mint: string): void {
  configuredAuraMint = mint;
}

/** Lazy-resolve the AURA token using configured mint, env, or placeholder. */
function resolveAuraToken(): TokenInfo {
  const mint =
    configuredAuraMint || process.env.AURA_MINT || "AURAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  return {
    symbol: "AURA",
    name: "DeAura",
    mint: new PublicKey(mint),
    decimals: 9,
  };
}

export function getTokenBySymbol(symbol: string): TokenInfo | undefined {
  const upper = symbol.toUpperCase();
  if (upper === "AURA") {
    return resolveAuraToken();
  }
  return STATIC_TOKENS[upper];
}

export function getTokenByMint(mint: string): TokenInfo | undefined {
  const aura = resolveAuraToken();
  if (aura.mint.toBase58() === mint) {
    return aura;
  }
  return Object.values(STATIC_TOKENS).find((t) => t.mint.toBase58() === mint);
}

export function getAllTokens(): TokenInfo[] {
  return [...Object.values(STATIC_TOKENS), resolveAuraToken()];
}
