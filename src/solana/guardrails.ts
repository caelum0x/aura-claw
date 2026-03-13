/**
 * Transaction guardrails: per-tx caps, daily limits, hourly rate limits, recipient allowlists.
 * In-memory tracker — resets on process restart (acceptable for hackathon scope).
 */

export interface GuardrailConfig {
  maxTxAmountUsd: number;
  dailySpendLimitUsd: number;
  maxTxPerHour: number;
  confirmationThresholdUsd: number;
  recipientAllowlist: string[];
}

export interface TxRecord {
  timestamp: number;
  amountUsd: number;
  recipient: string;
  action: string;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
}

const DEFAULT_CONFIG: GuardrailConfig = {
  maxTxAmountUsd: 100,
  dailySpendLimitUsd: 500,
  maxTxPerHour: 20,
  confirmationThresholdUsd: 25,
  recipientAllowlist: [],
};

export class SpendTracker {
  private records: TxRecord[] = [];
  private config: GuardrailConfig;

  constructor(config?: Partial<GuardrailConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Validate a proposed transaction against all guardrails. */
  validate(amountUsd: number, recipient: string, _action: string): ValidationResult {
    // 1. Per-tx cap
    if (amountUsd > this.config.maxTxAmountUsd) {
      return {
        allowed: false,
        reason: `Amount $${amountUsd.toFixed(2)} exceeds per-transaction limit of $${this.config.maxTxAmountUsd}`,
      };
    }

    // 2. Daily spend limit
    const dailySpent = this.getDailySpend();
    if (dailySpent + amountUsd > this.config.dailySpendLimitUsd) {
      return {
        allowed: false,
        reason: `Would exceed daily limit: $${dailySpent.toFixed(2)} spent + $${amountUsd.toFixed(2)} = $${(dailySpent + amountUsd).toFixed(2)} > $${this.config.dailySpendLimitUsd} limit`,
      };
    }

    // 3. Hourly rate limit
    const hourlyCount = this.getHourlyTxCount();
    if (hourlyCount >= this.config.maxTxPerHour) {
      return {
        allowed: false,
        reason: `Hourly transaction limit reached: ${hourlyCount}/${this.config.maxTxPerHour} transactions`,
      };
    }

    // 4. Recipient allowlist
    if (
      this.config.recipientAllowlist.length > 0 &&
      !this.config.recipientAllowlist.includes(recipient)
    ) {
      return {
        allowed: false,
        reason: `Recipient ${recipient} not in allowlist`,
      };
    }

    // 5. Confirmation threshold
    const requiresConfirmation = amountUsd >= this.config.confirmationThresholdUsd;

    return { allowed: true, requiresConfirmation };
  }

  /** Record a completed transaction. */
  record(amountUsd: number, recipient: string, action: string): void {
    this.records.push({
      timestamp: Date.now(),
      amountUsd,
      recipient,
      action,
    });
    // Prune records older than 24h to prevent unbounded growth
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.records = this.records.filter((r) => r.timestamp >= cutoff);
  }

  /** Get total USD spent in the current 24h window. */
  getDailySpend(): number {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return this.records
      .filter((r) => r.timestamp >= cutoff)
      .reduce((sum, r) => sum + r.amountUsd, 0);
  }

  /** Get transaction count in the current 1h window. */
  getHourlyTxCount(): number {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return this.records.filter((r) => r.timestamp >= cutoff).length;
  }

  /** Get guardrails status summary. */
  getStatus(): {
    dailySpent: number;
    dailyLimit: number;
    dailyRemaining: number;
    hourlyTxCount: number;
    hourlyTxLimit: number;
    maxTxAmountUsd: number;
    confirmationThresholdUsd: number;
    recipientAllowlistSize: number;
    recentTransactions: TxRecord[];
  } {
    const dailySpent = this.getDailySpend();
    return {
      dailySpent,
      dailyLimit: this.config.dailySpendLimitUsd,
      dailyRemaining: Math.max(0, this.config.dailySpendLimitUsd - dailySpent),
      hourlyTxCount: this.getHourlyTxCount(),
      hourlyTxLimit: this.config.maxTxPerHour,
      maxTxAmountUsd: this.config.maxTxAmountUsd,
      confirmationThresholdUsd: this.config.confirmationThresholdUsd,
      recipientAllowlistSize: this.config.recipientAllowlist.length,
      recentTransactions: this.records.slice(-10),
    };
  }

  /** Update config at runtime (e.g. from config reload). */
  updateConfig(config: Partial<GuardrailConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Estimate USD value of a transaction amount.
 * Uses CoinGecko simple price API with a short cache.
 */
let priceCache: { prices: Record<string, number>; fetchedAt: number } | null = null;
const PRICE_CACHE_TTL = 60_000; // 1 minute

export async function estimateUsdValue(amount: number, tokenSymbol: string): Promise<number> {
  const symbol = tokenSymbol.toUpperCase();
  // stablecoins ~ $1
  if (symbol === "USDC" || symbol === "USDT") {
    return amount;
  }

  const now = Date.now();
  if (priceCache && now - priceCache.fetchedAt < PRICE_CACHE_TTL) {
    const price = priceCache.prices[symbol];
    if (price !== undefined) {
      return amount * price;
    }
  }

  try {
    const ids = "solana,bonk,jupiter-exchange-solana";
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    );
    if (res.ok) {
      const data = (await res.json()) as Record<string, { usd?: number }>;
      const prices: Record<string, number> = {};
      if (data.solana?.usd) {
        prices.SOL = data.solana.usd;
      }
      if (data.bonk?.usd) {
        prices.BONK = data.bonk.usd;
      }
      if (data["jupiter-exchange-solana"]?.usd) {
        prices.JUP = data["jupiter-exchange-solana"].usd;
      }
      priceCache = { prices, fetchedAt: now };

      const price = prices[symbol];
      if (price !== undefined) {
        return amount * price;
      }
    }
  } catch {
    // Fall through — return a conservative estimate
  }

  // AURA or unknown token: use Jupiter quote as fallback (amount in USDC terms)
  // For hackathon, return 0 for unknown tokens to avoid blocking
  return 0;
}
