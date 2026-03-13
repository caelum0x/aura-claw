/**
 * Token sniper — monitors Pump.fun for new launches, auto-rugchecks,
 * and executes real buys via Jupiter when conditions are met.
 */

import type { Keypair } from "@solana/web3.js";

export interface SniperTarget {
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  usdMarketCap: number;
  complete: boolean;
  createdAt: number;
  rugcheckScore: number | null;
  riskLevel: "safe" | "caution" | "warning" | "danger" | "unknown";
  bought: boolean;
  buySignature: string | null;
  buyAmountSol: number | null;
}

export interface SniperConfig {
  maxRiskLevel: "safe" | "caution";
  minMarketCap: number;
  maxMarketCap: number;
  buyAmountSol: number;
  maxSlippageBps: number;
  autoBuy: boolean;
  maxResults: number;
}

const DEFAULT_CONFIG: SniperConfig = {
  maxRiskLevel: "caution",
  minMarketCap: 5000,
  maxMarketCap: 500_000,
  buyAmountSol: 0.1,
  maxSlippageBps: 500,
  autoBuy: false,
  maxResults: 20,
};

const RISK_ORDER: Record<string, number> = {
  safe: 0,
  caution: 1,
  warning: 2,
  danger: 3,
  unknown: 4,
};

export class TokenSniper {
  private config: SniperConfig;
  private watchlist: Map<string, SniperTarget> = new Map();
  private lastScan: number | null = null;
  private keypairLoader: (() => Promise<Keypair>) | null = null;
  private rpcUrl: string | undefined;
  private network: "devnet" | "testnet" | "mainnet-beta" | undefined;

  constructor(config?: Partial<SniperConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  configure(opts: {
    keypairLoader: () => Promise<Keypair>;
    rpcUrl?: string;
    network?: "devnet" | "testnet" | "mainnet-beta";
  }): void {
    this.keypairLoader = opts.keypairLoader;
    this.rpcUrl = opts.rpcUrl;
    this.network = opts.network;
  }

  updateConfig(config: Partial<SniperConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Scan Pump.fun for new tokens, rugcheck each, and optionally buy safe ones.
   */
  async scan(): Promise<SniperTarget[]> {
    const newTargets: SniperTarget[] = [];

    const res = await fetch(
      "https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false",
    );
    if (!res.ok) {
      throw new Error(`Pump.fun API failed: ${res.status}`);
    }

    const coins = (await res.json()) as Array<{
      mint: string;
      name: string;
      symbol: string;
      creator: string;
      usd_market_cap: number;
      complete: boolean;
      created_timestamp: number;
    }>;

    for (const coin of coins) {
      if (this.watchlist.has(coin.mint)) {
        continue;
      }
      if (coin.usd_market_cap < this.config.minMarketCap) {
        continue;
      }
      if (coin.usd_market_cap > this.config.maxMarketCap) {
        continue;
      }

      const target: SniperTarget = {
        mint: coin.mint,
        name: coin.name,
        symbol: coin.symbol,
        creator: coin.creator,
        usdMarketCap: coin.usd_market_cap,
        complete: coin.complete,
        createdAt: coin.created_timestamp,
        rugcheckScore: null,
        riskLevel: "unknown",
        bought: false,
        buySignature: null,
        buyAmountSol: null,
      };

      // Run rugcheck
      try {
        const { fetchTokenReportSummary, assessRisk } = await import("./rugcheck.js");
        const report = await fetchTokenReportSummary(coin.mint);
        const assessment = assessRisk(report);
        target.rugcheckScore = report.score;
        target.riskLevel = assessment.riskLevel;
      } catch {
        target.riskLevel = "unknown";
      }

      this.watchlist.set(coin.mint, target);

      // Auto-buy if risk is acceptable and autoBuy is enabled
      const maxAllowed = RISK_ORDER[this.config.maxRiskLevel] ?? 1;
      const tokenRisk = RISK_ORDER[target.riskLevel] ?? 4;

      if (this.config.autoBuy && tokenRisk <= maxAllowed && this.keypairLoader) {
        try {
          const sig = await this.buyToken(target.mint);
          target.bought = true;
          target.buySignature = sig;
          target.buyAmountSol = this.config.buyAmountSol;
        } catch {
          // Buy failure is non-fatal during scan
        }
      }

      newTargets.push(target);
    }

    this.lastScan = Date.now();
    return newTargets;
  }

  /**
   * Buy a specific token using SOL via Jupiter swap.
   */
  async buyToken(mint: string): Promise<string> {
    if (!this.keypairLoader) {
      throw new Error("Wallet not configured — call configure() first");
    }

    const { getSwapQuote, buildSwapTransaction, deserializeSwapTransaction } =
      await import("./jupiter.js");

    const quote = await getSwapQuote({
      inputSymbol: "SOL",
      outputSymbol: "unknown",
      amount: this.config.buyAmountSol,
      slippageBps: this.config.maxSlippageBps,
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: mint,
    });

    const keypair = await this.keypairLoader();
    const swapTx = await buildSwapTransaction({
      quoteResponse: quote.raw,
      userPublicKey: keypair.publicKey.toBase58(),
    });

    const { signAndSendTransaction } = await import("./wallet.js");
    const tx = await deserializeSwapTransaction(swapTx.swapTransaction, this.rpcUrl);
    const result = await signAndSendTransaction(tx, keypair, {
      rpcUrl: this.rpcUrl,
      network: this.network,
      confirm: true,
    });

    // Update watchlist
    const target = this.watchlist.get(mint);
    if (target) {
      target.bought = true;
      target.buySignature = result.signature;
      target.buyAmountSol = this.config.buyAmountSol;
    }

    return result.signature;
  }

  getFilteredTargets(): SniperTarget[] {
    const maxAllowed = RISK_ORDER[this.config.maxRiskLevel] ?? 1;
    return [...this.watchlist.values()]
      .filter((t) => {
        const risk = RISK_ORDER[t.riskLevel] ?? 4;
        return risk <= maxAllowed;
      })
      .toSorted((a, b) => b.usdMarketCap - a.usdMarketCap)
      .slice(0, this.config.maxResults);
  }

  getAllTargets(): SniperTarget[] {
    return [...this.watchlist.values()].toSorted((a, b) => b.createdAt - a.createdAt);
  }

  getStatus(): {
    totalScanned: number;
    safeTargets: number;
    boughtTargets: number;
    lastScan: number | null;
    config: SniperConfig;
  } {
    const targets = [...this.watchlist.values()];
    const maxAllowed = RISK_ORDER[this.config.maxRiskLevel] ?? 1;
    return {
      totalScanned: targets.length,
      safeTargets: targets.filter((t) => (RISK_ORDER[t.riskLevel] ?? 4) <= maxAllowed).length,
      boughtTargets: targets.filter((t) => t.bought).length,
      lastScan: this.lastScan,
      config: { ...this.config },
    };
  }

  clearWatchlist(): void {
    this.watchlist.clear();
  }
}

let sniper: TokenSniper | null = null;

export function getTokenSniper(config?: Partial<SniperConfig>): TokenSniper {
  if (!sniper) {
    sniper = new TokenSniper(config);
  }
  return sniper;
}
