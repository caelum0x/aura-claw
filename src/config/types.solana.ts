export interface SolanaConfig {
  /** Solana RPC URL (defaults to devnet) */
  rpcUrl?: string;
  /** Path to wallet keypair JSON file */
  walletPath?: string;
  /** Network: devnet | testnet | mainnet-beta */
  network?: "devnet" | "testnet" | "mainnet-beta";
  /** Default slippage in basis points (default: 50 = 0.5%) */
  slippageBps?: number;
  /** AURA token mint address */
  auraMint?: string;
  /** OpenRouter API key for AI signals */
  openRouterApiKey?: string;
  /** Helius API key for enhanced TX parsing, priority fees, and DAS API */
  heliusApiKey?: string;
  /** Base58-encoded private key (env fallback: SOLANA_PRIVATE_KEY) */
  privateKey?: string;
  /** Max single transaction amount in USD (default: 100) */
  maxTxAmountUsd?: number;
  /** Daily cumulative spend limit in USD (default: 500) */
  dailySpendLimitUsd?: number;
  /** Max transactions per hour (default: 20) */
  maxTxPerHour?: number;
  /** USD threshold above which user confirmation is required (default: 25) */
  confirmationThresholdUsd?: number;
  /** Allowlist of recipient wallet addresses. Empty = allow all. */
  recipientAllowlist?: string[];
  /** CoinGecko API key (free or pro) for trending/market data */
  coingeckoApiKey?: string;
}

export const DEFAULT_SOLANA_CONFIG: SolanaConfig = {
  rpcUrl: undefined,
  walletPath: undefined,
  network: "devnet",
  slippageBps: 50,
  auraMint: undefined,
  openRouterApiKey: undefined,
  heliusApiKey: undefined,
  privateKey: undefined,
  maxTxAmountUsd: 100,
  dailySpendLimitUsd: 500,
  maxTxPerHour: 20,
  confirmationThresholdUsd: 25,
  recipientAllowlist: [],
};
