/**
 * Dollar Cost Averaging — real execution via Jupiter swaps + wallet signing.
 * Creates recurring buy orders that actually execute on-chain.
 */

import type { Keypair } from "@solana/web3.js";

export interface DcaOrder {
  id: string;
  inputToken: string;
  outputToken: string;
  amountPerInterval: number;
  intervalMs: number;
  totalBudget: number;
  spent: number;
  executionCount: number;
  maxExecutions: number;
  slippageBps: number;
  active: boolean;
  createdAt: number;
  lastExecutedAt: number | null;
  nextExecutionAt: number;
}

export interface DcaExecution {
  orderId: string;
  timestamp: number;
  inputAmount: string;
  outputAmount: string;
  priceImpact: string;
  signature: string | null;
  status: "success" | "error";
  error?: string;
}

const INTERVAL_PRESETS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "4h": 4 * 3_600_000,
  "1d": 86_400_000,
  "1w": 7 * 86_400_000,
};

export class DcaTracker {
  private orders: Map<string, DcaOrder> = new Map();
  private executions: DcaExecution[] = [];
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private nextId = 1;
  private keypairLoader: (() => Promise<Keypair>) | null = null;
  private rpcUrl: string | undefined;
  private network: "devnet" | "testnet" | "mainnet-beta" | undefined;

  configure(opts: {
    keypairLoader: () => Promise<Keypair>;
    rpcUrl?: string;
    network?: "devnet" | "testnet" | "mainnet-beta";
  }): void {
    this.keypairLoader = opts.keypairLoader;
    this.rpcUrl = opts.rpcUrl;
    this.network = opts.network;
  }

  createOrder(params: {
    inputToken: string;
    outputToken: string;
    amountPerInterval: number;
    interval: string;
    totalBudget?: number;
    maxExecutions?: number;
    slippageBps?: number;
  }): DcaOrder {
    const intervalMs = INTERVAL_PRESETS[params.interval];
    if (!intervalMs) {
      throw new Error(
        `Invalid interval: ${params.interval}. Valid: ${Object.keys(INTERVAL_PRESETS).join(", ")}`,
      );
    }

    const maxExec =
      params.maxExecutions ??
      (params.totalBudget ? Math.floor(params.totalBudget / params.amountPerInterval) : 100);

    const order: DcaOrder = {
      id: `dca_${this.nextId++}`,
      inputToken: params.inputToken,
      outputToken: params.outputToken,
      amountPerInterval: params.amountPerInterval,
      intervalMs,
      totalBudget: params.totalBudget ?? params.amountPerInterval * maxExec,
      spent: 0,
      executionCount: 0,
      maxExecutions: maxExec,
      slippageBps: params.slippageBps ?? 50,
      active: true,
      createdAt: Date.now(),
      lastExecutedAt: null,
      nextExecutionAt: Date.now() + intervalMs,
    };

    this.orders.set(order.id, order);

    // Start the recurring timer that actually executes swaps
    const timer = setInterval(() => {
      void this.executeOrder(order.id);
    }, intervalMs);
    this.timers.set(order.id, timer);

    return order;
  }

  /**
   * Execute a single DCA order — real Jupiter swap + wallet sign + send.
   */
  async executeOrder(orderId: string): Promise<DcaExecution | null> {
    const order = this.orders.get(orderId);
    if (!order || !order.active) {
      return null;
    }
    if (order.executionCount >= order.maxExecutions || order.spent >= order.totalBudget) {
      order.active = false;
      this.stopTimer(orderId);
      return null;
    }

    try {
      // 1. Get Jupiter swap quote
      const { getSwapQuote, buildSwapTransaction, deserializeSwapTransaction } =
        await import("./jupiter.js");
      const quote = await getSwapQuote({
        inputSymbol: order.inputToken,
        outputSymbol: order.outputToken,
        amount: order.amountPerInterval,
        slippageBps: order.slippageBps,
      });

      // 2. Build the swap transaction
      if (!this.keypairLoader) {
        throw new Error("Wallet not configured — call configure() first");
      }
      const keypair = await this.keypairLoader();
      const swapTx = await buildSwapTransaction({
        quoteResponse: quote.raw,
        userPublicKey: keypair.publicKey.toBase58(),
      });

      // 3. Sign and send on-chain
      const { signAndSendTransaction } = await import("./wallet.js");
      const tx = await deserializeSwapTransaction(swapTx.swapTransaction, this.rpcUrl);
      const result = await signAndSendTransaction(tx, keypair, {
        rpcUrl: this.rpcUrl,
        network: this.network,
        confirm: true,
      });

      // 4. Record success
      const execution: DcaExecution = {
        orderId,
        timestamp: Date.now(),
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct,
        signature: result.signature,
        status: "success",
      };
      this.executions.push(execution);

      order.executionCount++;
      order.spent += order.amountPerInterval;
      order.lastExecutedAt = Date.now();
      order.nextExecutionAt = Date.now() + order.intervalMs;

      if (order.executionCount >= order.maxExecutions || order.spent >= order.totalBudget) {
        order.active = false;
        this.stopTimer(orderId);
      }

      return execution;
    } catch (error) {
      const execution: DcaExecution = {
        orderId,
        timestamp: Date.now(),
        inputAmount: String(order.amountPerInterval),
        outputAmount: "0",
        priceImpact: "0",
        signature: null,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      this.executions.push(execution);

      order.executionCount++;
      order.lastExecutedAt = Date.now();
      order.nextExecutionAt = Date.now() + order.intervalMs;

      return execution;
    }
  }

  cancelOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order) {
      return false;
    }
    order.active = false;
    this.stopTimer(orderId);
    return true;
  }

  private stopTimer(orderId: string): void {
    const timer = this.timers.get(orderId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(orderId);
    }
  }

  getOrder(orderId: string): DcaOrder | null {
    return this.orders.get(orderId) ?? null;
  }

  getActiveOrders(): DcaOrder[] {
    return [...this.orders.values()].filter((o) => o.active);
  }

  getAllOrders(): DcaOrder[] {
    return [...this.orders.values()];
  }

  getExecutions(orderId?: string): DcaExecution[] {
    if (orderId) {
      return this.executions.filter((e) => e.orderId === orderId);
    }
    return [...this.executions];
  }

  getStatus(): {
    activeOrders: number;
    totalOrders: number;
    totalExecutions: number;
    successfulSwaps: number;
    failedSwaps: number;
    orders: DcaOrder[];
  } {
    return {
      activeOrders: this.getActiveOrders().length,
      totalOrders: this.orders.size,
      totalExecutions: this.executions.length,
      successfulSwaps: this.executions.filter((e) => e.status === "success").length,
      failedSwaps: this.executions.filter((e) => e.status === "error").length,
      orders: this.getAllOrders(),
    };
  }

  /** Stop all timers (cleanup). */
  stopAll(): void {
    for (const [id] of this.timers) {
      this.stopTimer(id);
    }
    for (const order of this.orders.values()) {
      order.active = false;
    }
  }
}

let tracker: DcaTracker | null = null;

export function getDcaTracker(): DcaTracker {
  if (!tracker) {
    tracker = new DcaTracker();
  }
  return tracker;
}
