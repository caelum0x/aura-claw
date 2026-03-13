/**
 * Autopilot trading engine — AI-driven autonomous trading.
 * Uses OpenRouter AI to analyze market data, then executes real swaps
 * via Jupiter + wallet signing when confidence is high enough.
 */

import type { Keypair } from "@solana/web3.js";

export type AutopilotStrategy =
  | "conservative"
  | "balanced"
  | "aggressive"
  | "dip_buyer"
  | "momentum";

export interface AutopilotConfig {
  strategy: AutopilotStrategy;
  maxTradeAmountUsd: number;
  checkIntervalMs: number;
  tokens: string[];
  enabled: boolean;
  minConfidence: number;
  slippageBps: number;
}

export interface AutopilotSignal {
  token: string;
  action: "buy" | "sell" | "hold";
  confidence: number;
  reason: string;
  timestamp: number;
  price: number;
  change24h: number;
}

export interface AutopilotTrade {
  token: string;
  action: "buy" | "sell";
  inputToken: string;
  outputToken: string;
  amount: number;
  price: number;
  signature: string;
  timestamp: number;
  outputAmount: string;
  priceImpact: string;
}

const DEFAULT_CONFIG: AutopilotConfig = {
  strategy: "balanced",
  maxTradeAmountUsd: 25,
  checkIntervalMs: 60_000,
  tokens: ["SOL", "BONK", "JUP"],
  enabled: false,
  minConfidence: 0.6,
  slippageBps: 100,
};

export class AutopilotEngine {
  private config: AutopilotConfig;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private signals: AutopilotSignal[] = [];
  private trades: AutopilotTrade[] = [];
  private startedAt: number | null = null;
  private lastCheck: number | null = null;
  private keypairLoader: (() => Promise<Keypair>) | null = null;
  private rpcUrl: string | undefined;
  private network: "devnet" | "testnet" | "mainnet-beta" | undefined;
  private openRouterApiKey: string | undefined;

  constructor(config?: Partial<AutopilotConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  configure(opts: {
    keypairLoader: () => Promise<Keypair>;
    rpcUrl?: string;
    network?: "devnet" | "testnet" | "mainnet-beta";
    openRouterApiKey?: string;
  }): void {
    this.keypairLoader = opts.keypairLoader;
    this.rpcUrl = opts.rpcUrl;
    this.network = opts.network;
    this.openRouterApiKey = opts.openRouterApiKey ?? process.env.OPENROUTER_API_KEY;
  }

  start(): void {
    if (this.running) {
      return;
    }
    if (!this.keypairLoader) {
      throw new Error("Wallet not configured — call configure() first");
    }
    this.running = true;
    this.config.enabled = true;
    this.startedAt = Date.now();

    void this.runCycle();
    this.timer = setInterval(() => void this.runCycle(), this.config.checkIntervalMs);
  }

  stop(): void {
    this.running = false;
    this.config.enabled = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  updateConfig(config: Partial<AutopilotConfig>): void {
    const wasRunning = this.running;
    if (wasRunning) {
      this.stop();
    }
    Object.assign(this.config, config);
    if (wasRunning && config.enabled !== false) {
      this.start();
    }
  }

  /**
   * Single autopilot cycle: gather market data → AI analysis → execute trades.
   */
  private async runCycle(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      // 1. Gather market data for all tracked tokens
      const marketData = await this.gatherMarketData();

      // 2. Ask AI for trading signals
      const aiSignals = await this.getAiSignals(marketData);
      this.signals = aiSignals;
      this.lastCheck = Date.now();

      // 3. Execute trades for high-confidence signals
      for (const signal of aiSignals) {
        if (signal.action === "hold" || signal.confidence < this.config.minConfidence) {
          continue;
        }
        try {
          const trade = await this.executeTrade(signal);
          if (trade) {
            this.trades.push(trade);
          }
        } catch {
          // Individual trade failures don't stop the cycle
        }
      }

      // Keep trades list bounded
      if (this.trades.length > 200) {
        this.trades = this.trades.slice(-200);
      }
    } catch {
      // Cycle errors are non-fatal
    }
  }

  /**
   * Fetch live prices and 24h changes for tracked tokens.
   */
  private async gatherMarketData(): Promise<
    Array<{ token: string; price: number; change24h: number; volume24h: number }>
  > {
    const results: Array<{
      token: string;
      price: number;
      change24h: number;
      volume24h: number;
    }> = [];

    for (const token of this.config.tokens) {
      try {
        const { getPythTokenPrice } = await import("./pyth.js");
        const price = await getPythTokenPrice(token);
        if (price === null) {
          continue;
        }

        let change24h = 0;
        let volume24h = 0;

        try {
          const { getTokenAddressFromTicker, getDexScreenerPairs } =
            await import("./dexscreener.js");
          const address = await getTokenAddressFromTicker(token);
          if (address) {
            const pairs = await getDexScreenerPairs(address);
            if (pairs.length > 0) {
              change24h = pairs[0].priceChange?.h24 ?? 0;
              volume24h = pairs[0].volume?.h24 ?? 0;
            }
          }
        } catch {
          // DexScreener not critical
        }

        results.push({ token, price, change24h, volume24h });
      } catch {
        // Skip tokens with price fetch errors
      }
    }

    return results;
  }

  /**
   * Call OpenRouter AI to generate trading signals from market data.
   */
  private async getAiSignals(
    marketData: Array<{
      token: string;
      price: number;
      change24h: number;
      volume24h: number;
    }>,
  ): Promise<AutopilotSignal[]> {
    const apiKey = this.openRouterApiKey;
    if (!apiKey || marketData.length === 0) {
      // Fallback: simple rule-based signals if no AI key
      return this.getRuleBasedSignals(marketData);
    }

    const prompt = `You are an autonomous Solana DeFi trading agent using the "${this.config.strategy}" strategy.
Max trade size: $${this.config.maxTradeAmountUsd} USD.

Current market data:
${JSON.stringify(marketData, null, 2)}

For each token, respond with a JSON array of trading signals:
[{"token": "SOL", "action": "buy"|"sell"|"hold", "confidence": 0.0-1.0, "reason": "brief explanation"}]

Strategy rules:
- conservative: only trade on large dips (>5%) or rallies (>8%), low confidence
- balanced: moderate thresholds (3% dip, 5% rally)
- aggressive: trade on small moves (2%+), higher confidence
- dip_buyer: only buy on significant dips (>8%), never sell on dips
- momentum: buy when trending up (>2%), sell when trending down

Respond ONLY with the JSON array, no other text.`;

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/claude-sonnet-4-20250514",
          messages: [
            {
              role: "system",
              content:
                "You are a DeFi trading signal generator. Output only valid JSON arrays. Be decisive — give clear buy/sell/hold with confidence scores.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 500,
        }),
      });

      if (!res.ok) {
        return this.getRuleBasedSignals(marketData);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        return this.getRuleBasedSignals(marketData);
      }

      // Parse AI response — extract JSON array
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return this.getRuleBasedSignals(marketData);
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        token: string;
        action: "buy" | "sell" | "hold";
        confidence: number;
        reason: string;
      }>;

      // Match back to market data for prices
      return parsed.map((s) => {
        const md = marketData.find((m) => m.token === s.token);
        return {
          token: s.token,
          action: s.action,
          confidence: Math.min(1, Math.max(0, s.confidence)),
          reason: s.reason,
          timestamp: Date.now(),
          price: md?.price ?? 0,
          change24h: md?.change24h ?? 0,
        };
      });
    } catch {
      return this.getRuleBasedSignals(marketData);
    }
  }

  /**
   * Fallback rule-based signals when AI is unavailable.
   */
  private getRuleBasedSignals(
    marketData: Array<{
      token: string;
      price: number;
      change24h: number;
      volume24h: number;
    }>,
  ): AutopilotSignal[] {
    const thresholds: Record<AutopilotStrategy, { buy: number; sell: number }> = {
      conservative: { buy: -5, sell: 8 },
      balanced: { buy: -3, sell: 5 },
      aggressive: { buy: -2, sell: 3 },
      dip_buyer: { buy: -8, sell: 15 },
      momentum: { buy: 2, sell: -2 },
    };

    const t = thresholds[this.config.strategy];

    return marketData.map((md) => {
      let action: "buy" | "sell" | "hold" = "hold";
      let confidence = 0;
      let reason = "No clear signal";

      if (this.config.strategy === "momentum") {
        if (md.change24h >= t.buy) {
          action = "buy";
          confidence = Math.min(0.85, md.change24h / 10);
          reason = `Upward momentum: +${md.change24h.toFixed(1)}%`;
        } else if (md.change24h <= t.sell) {
          action = "sell";
          confidence = Math.min(0.85, Math.abs(md.change24h) / 10);
          reason = `Downward momentum: ${md.change24h.toFixed(1)}%`;
        }
      } else {
        if (md.change24h <= t.buy) {
          action = "buy";
          confidence = Math.min(0.85, Math.abs(md.change24h) / 15);
          reason = `Dip detected: ${md.change24h.toFixed(1)}% (threshold: ${t.buy}%)`;
        } else if (md.change24h >= t.sell) {
          action = "sell";
          confidence = Math.min(0.85, md.change24h / 15);
          reason = `Rally: +${md.change24h.toFixed(1)}% (threshold: +${t.sell}%)`;
        }
      }

      return {
        token: md.token,
        action,
        confidence,
        reason,
        timestamp: Date.now(),
        price: md.price,
        change24h: md.change24h,
      };
    });
  }

  /**
   * Execute a real trade via Jupiter swap.
   */
  private async executeTrade(signal: AutopilotSignal): Promise<AutopilotTrade | null> {
    if (!this.keypairLoader) {
      return null;
    }

    // Determine swap direction
    const inputToken = signal.action === "buy" ? "USDC" : signal.token;
    const outputToken = signal.action === "buy" ? signal.token : "USDC";

    // Calculate amount — use maxTradeAmountUsd as the USD cap
    let amount: number;
    if (signal.action === "buy") {
      // Buying: spend USDC
      amount = this.config.maxTradeAmountUsd * signal.confidence;
    } else {
      // Selling: sell token worth up to maxTradeAmountUsd
      if (signal.price > 0) {
        amount = (this.config.maxTradeAmountUsd * signal.confidence) / signal.price;
      } else {
        return null;
      }
    }

    if (amount <= 0) {
      return null;
    }

    // 1. Get quote
    const { getSwapQuote, buildSwapTransaction, deserializeSwapTransaction } =
      await import("./jupiter.js");
    const quote = await getSwapQuote({
      inputSymbol: inputToken,
      outputSymbol: outputToken,
      amount,
      slippageBps: this.config.slippageBps,
    });

    // 2. Build tx
    const keypair = await this.keypairLoader();
    const swapTx = await buildSwapTransaction({
      quoteResponse: quote.raw,
      userPublicKey: keypair.publicKey.toBase58(),
    });

    // 3. Sign and send
    const { signAndSendTransaction } = await import("./wallet.js");
    const tx = await deserializeSwapTransaction(swapTx.swapTransaction, this.rpcUrl);
    const result = await signAndSendTransaction(tx, keypair, {
      rpcUrl: this.rpcUrl,
      network: this.network,
      confirm: true,
    });

    return {
      token: signal.token,
      action: signal.action as "buy" | "sell",
      inputToken,
      outputToken,
      amount,
      price: signal.price,
      signature: result.signature,
      timestamp: Date.now(),
      outputAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
    };
  }

  /**
   * One-shot trade: user says "buy SOL" and the agent does it.
   * Uses AI to determine optimal amount and timing.
   */
  async executeUserTrade(params: {
    token: string;
    action: "buy" | "sell";
    amountUsd?: number;
  }): Promise<AutopilotTrade> {
    if (!this.keypairLoader) {
      throw new Error("Wallet not configured — call configure() first");
    }

    const amount = params.amountUsd ?? this.config.maxTradeAmountUsd;
    const inputToken = params.action === "buy" ? "USDC" : params.token;
    const outputToken = params.action === "buy" ? params.token : "USDC";

    let swapAmount: number;
    if (params.action === "buy") {
      swapAmount = amount;
    } else {
      // For sell, get current price to calculate token amount
      const { getPythTokenPrice } = await import("./pyth.js");
      const price = await getPythTokenPrice(params.token);
      if (!price || price <= 0) {
        throw new Error(`Cannot get price for ${params.token}`);
      }
      swapAmount = amount / price;
    }

    const { getSwapQuote, buildSwapTransaction, deserializeSwapTransaction } =
      await import("./jupiter.js");

    // Rugcheck before buying
    if (params.action === "buy") {
      try {
        const { getTokenAddressFromTicker } = await import("./dexscreener.js");
        const mintAddress = await getTokenAddressFromTicker(params.token);
        if (mintAddress) {
          const { fetchTokenReportSummary, assessRisk } = await import("./rugcheck.js");
          const report = await fetchTokenReportSummary(mintAddress);
          const risk = assessRisk(report);
          if (risk.riskLevel === "danger") {
            throw new Error(
              `BLOCKED: ${params.token} has rugcheck risk level "danger" (score: ${report.score}). ${risk.summary}`,
            );
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("BLOCKED:")) {
          throw e;
        }
        // Rugcheck lookup failure is non-fatal
      }
    }

    const quote = await getSwapQuote({
      inputSymbol: inputToken,
      outputSymbol: outputToken,
      amount: swapAmount,
      slippageBps: this.config.slippageBps,
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

    const trade: AutopilotTrade = {
      token: params.token,
      action: params.action,
      inputToken,
      outputToken,
      amount: swapAmount,
      price: 0,
      signature: result.signature,
      timestamp: Date.now(),
      outputAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
    };

    this.trades.push(trade);
    return trade;
  }

  getState(): {
    running: boolean;
    strategy: AutopilotStrategy;
    startedAt: number | null;
    lastCheck: number | null;
    signalCount: number;
    tradeCount: number;
    config: AutopilotConfig;
    latestSignals: AutopilotSignal[];
    recentTrades: AutopilotTrade[];
  } {
    return {
      running: this.running,
      strategy: this.config.strategy,
      startedAt: this.startedAt,
      lastCheck: this.lastCheck,
      signalCount: this.signals.length,
      tradeCount: this.trades.length,
      config: { ...this.config },
      latestSignals: [...this.signals],
      recentTrades: this.trades.slice(-20),
    };
  }
}

let engine: AutopilotEngine | null = null;

export function getAutopilotEngine(config?: Partial<AutopilotConfig>): AutopilotEngine {
  if (!engine) {
    engine = new AutopilotEngine(config);
  }
  return engine;
}
