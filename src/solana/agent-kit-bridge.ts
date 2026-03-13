/**
 * Bridge adapter for solana-agent-kit integration.
 *
 * Provides a lightweight wrapper around solana-agent-kit's Plugin/Action system,
 * allowing our solana_defi tool to dispatch any registered action by name.
 *
 * Actions from agent-kit plugins are registered lazily — actual execution depends
 * on whether the required SDK dependencies are installed.
 *
 * Adapted from solana-agent-kit core (Apache-2.0).
 */

import type { Connection, Keypair } from "@solana/web3.js";

// ── Lightweight re-definitions of agent-kit types ──────────────────────

export interface ActionExample {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  explanation: string;
}

export interface Action {
  name: string;
  similes: string[];
  description: string;
  examples: ActionExample[][];
  handler: (
    bridge: AgentKitBridge,
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

export interface ActionPlugin {
  name: string;
  actions: Action[];
}

// ── Bridge class ───────────────────────────────────────────────────────

export interface AgentKitBridgeConfig {
  rpcUrl?: string;
  network?: "devnet" | "testnet" | "mainnet-beta";
  walletAddress?: string;
  privateKey?: string;
  walletPath?: string;
  heliusApiKey?: string;
  coingeckoApiKey?: string;
  openRouterApiKey?: string;
  slippageBps?: number;
}

/**
 * Lightweight bridge that mirrors the SolanaAgentKit interface
 * without requiring the full agent-kit dependency tree.
 */
export class AgentKitBridge {
  public config: AgentKitBridgeConfig;
  private actions: Map<string, Action> = new Map();
  private plugins: Map<string, ActionPlugin> = new Map();
  private _connection: Connection | null = null;
  private _keypair: Keypair | null = null;

  constructor(config: AgentKitBridgeConfig) {
    this.config = config;
  }

  /** Lazy connection — only created when needed. */
  async getConnection(): Promise<Connection> {
    if (!this._connection) {
      const { getSolanaConnection } = await import("./connection.js");
      this._connection = getSolanaConnection(this.config.rpcUrl, "confirmed", this.config.network);
    }
    return this._connection;
  }

  /** Lazy keypair — only loaded when a signing action is called. */
  async getKeypair(): Promise<Keypair> {
    if (!this._keypair) {
      const { loadKeypair } = await import("./wallet.js");
      this._keypair = await loadKeypair({
        privateKey: this.config.privateKey,
        walletPath: this.config.walletPath,
      });
    }
    return this._keypair;
  }

  /** Register an action plugin. */
  registerPlugin(plugin: ActionPlugin): void {
    if (this.plugins.has(plugin.name)) {
      return;
    }
    this.plugins.set(plugin.name, plugin);
    for (const action of plugin.actions) {
      this.actions.set(action.name.toLowerCase(), action);
    }
  }

  /** Get all registered actions. */
  getAvailableActions(): Array<{ name: string; description: string; plugin: string }> {
    const result: Array<{ name: string; description: string; plugin: string }> = [];
    for (const [, plugin] of this.plugins) {
      for (const action of plugin.actions) {
        result.push({
          name: action.name,
          description: action.description,
          plugin: plugin.name,
        });
      }
    }
    return result;
  }

  /** Execute an action by name. */
  async executeAction(
    actionName: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const action = this.actions.get(actionName.toLowerCase());
    if (!action) {
      const available = [...this.actions.keys()].join(", ");
      throw new Error(`Unknown action: ${actionName}. Available: ${available}`);
    }

    try {
      return await action.handler(this, input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Graceful degradation for missing dependencies
      if (message.includes("Cannot find module") || message.includes("MODULE_NOT_FOUND")) {
        return {
          status: "error",
          message: `Action "${actionName}" requires additional dependencies. Install the required packages and try again.`,
          missingModule: message,
        };
      }

      throw error;
    }
  }

  /** Find actions by similarity (for fuzzy matching). */
  findAction(query: string): Action | null {
    const lower = query.toLowerCase();

    // Exact match
    const exact = this.actions.get(lower);
    if (exact) {
      return exact;
    }

    // Check similes
    for (const [, action] of this.actions) {
      if (action.similes.some((s) => s.toLowerCase().includes(lower))) {
        return action;
      }
    }

    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Safely convert an unknown value to string. */
function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return fallback;
  }
  return `${value as string | number}`;
}

// ── Built-in action plugins (using our existing integrations) ──────────

export function createBuiltinPlugins(_config: AgentKitBridgeConfig): ActionPlugin[] {
  return [
    createTokenPlugin(),
    createDefiPlugin(),
    createAnalyticsPlugin(),
    createNftPlugin(),
    createAuraPlugin(),
  ];
}

function createTokenPlugin(): ActionPlugin {
  return {
    name: "token",
    actions: [
      {
        name: "FETCH_PRICE",
        similes: ["get token price", "check price", "price lookup"],
        description: "Get current USD price for a token using Pyth Network oracle",
        examples: [
          [
            {
              input: { token: "SOL" },
              output: { price: 150.25 },
              explanation: "Fetches SOL price",
            },
          ],
        ],
        handler: async (_bridge, input) => {
          const { getPythTokenPrice } = await import("./pyth.js");
          const token = str(input.token ?? input.symbol, "SOL");
          const price = await getPythTokenPrice(token);
          return { status: "success", token, price, source: "Pyth Network" };
        },
      },
      {
        name: "TOKEN_DATA_BY_TICKER",
        similes: ["token data", "lookup token", "find token"],
        description: "Get token metadata by ticker symbol via DexScreener + Jupiter",
        examples: [
          [
            {
              input: { ticker: "BONK" },
              output: { name: "Bonk" },
              explanation: "Fetches BONK data",
            },
          ],
        ],
        handler: async (_bridge, input) => {
          const { getTokenDataByTicker } = await import("./dexscreener.js");
          const ticker = str(input.ticker ?? input.symbol ?? input.token);
          const data = await getTokenDataByTicker(ticker);
          return data ? { status: "success", data } : { status: "not_found", ticker };
        },
      },
      {
        name: "RUGCHECK",
        similes: ["check rug pull", "rug pull check", "token security", "is token safe"],
        description: "Check if a token is a potential rug pull using Rugcheck.xyz",
        examples: [
          [
            {
              input: { mint: "abc..." },
              output: { score: 100 },
              explanation: "Token security check",
            },
          ],
        ],
        handler: async (_bridge, input) => {
          const { fetchTokenReportSummary, assessRisk } = await import("./rugcheck.js");
          const mint = str(input.mint ?? input.token);
          const report = await fetchTokenReportSummary(mint);
          const assessment = assessRisk(report);
          return { status: "success", ...assessment, score: report.score };
        },
      },
      {
        name: "SWAP",
        similes: ["swap tokens", "exchange", "trade tokens", "jupiter swap"],
        description: "Get a Jupiter swap quote for token exchange",
        examples: [
          [
            {
              input: { inputSymbol: "SOL", outputSymbol: "USDC", amount: 1 },
              output: {},
              explanation: "Swap SOL for USDC",
            },
          ],
        ],
        handler: async (_bridge, input) => {
          const { getSwapQuote } = await import("./jupiter.js");
          const quote = await getSwapQuote({
            inputSymbol: str(input.inputSymbol ?? input.input_token),
            outputSymbol: str(input.outputSymbol ?? input.output_token),
            amount: Number(input.amount),
            slippageBps: input.slippageBps ? Number(input.slippageBps) : undefined,
          });
          return { status: "success", quote };
        },
      },
      {
        name: "CREATE_LIMIT_ORDER",
        similes: ["place limit order", "submit limit order", "create trading order"],
        description: "Create a Jupiter limit order to buy/sell at a specific price",
        examples: [
          [
            {
              input: { inputMint: "SOL", outputMint: "USDC" },
              output: {},
              explanation: "Create a limit order",
            },
          ],
        ],
        handler: async (bridge, input) => {
          const { createLimitOrder } = await import("./jupiter-limit-orders.js");
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const result = await createLimitOrder(wallet, {
            inputMint: str(input.inputMint),
            outputMint: str(input.outputMint),
            makingAmount: str(input.makingAmount),
            takingAmount: str(input.takingAmount),
          });
          return { status: "success", order: result.order };
        },
      },
      {
        name: "GET_OPEN_LIMIT_ORDERS",
        similes: ["fetch open orders", "get limit orders", "list orders"],
        description: "Get open Jupiter limit orders for a wallet",
        examples: [[{ input: {}, output: { orders: [] }, explanation: "List open orders" }]],
        handler: async (bridge, input) => {
          const { getOpenLimitOrders } = await import("./jupiter-limit-orders.js");
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const orders = await getOpenLimitOrders(wallet);
          return { status: "success", orders, count: orders.length };
        },
      },
      {
        name: "CANCEL_LIMIT_ORDERS",
        similes: ["cancel orders", "abort orders", "revoke orders"],
        description: "Cancel Jupiter limit orders by public key",
        examples: [[{ input: { orders: ["abc"] }, output: {}, explanation: "Cancel orders" }]],
        handler: async (bridge, input) => {
          const { cancelLimitOrders } = await import("./jupiter-limit-orders.js");
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const orders = input.orders as string[];
          const result = await cancelLimitOrders(wallet, orders);
          return { status: "success", cancelled: result.txs.length };
        },
      },
      {
        name: "PUMPFUN_TOKEN_DATA",
        similes: ["pump.fun token", "pumpfun info", "meme token data"],
        description: "Get Pump.fun token data and bonding curve info",
        examples: [[{ input: { mint: "abc" }, output: {}, explanation: "Get pumpfun token" }]],
        handler: async (_bridge, input) => {
          const { getPumpfunTokenData, estimatePumpfunBuyPrice } = await import("./pumpfun.js");
          const mint = str(input.mint ?? input.token);
          const data = await getPumpfunTokenData(mint);
          if (!data) {
            return { status: "not_found", mint };
          }
          const estimate = estimatePumpfunBuyPrice(data, 1000);
          return { status: "success", data, buyEstimate: estimate };
        },
      },
    ],
  };
}

function createDefiPlugin(): ActionPlugin {
  return {
    name: "defi",
    actions: [
      {
        name: "STAKE_SOL",
        similes: ["stake sol", "liquid staking", "get jupsol", "jupiter staking"],
        description: "Stake SOL for jupSOL liquid staking token via Jupiter",
        examples: [[{ input: { amount: 1 }, output: {}, explanation: "Stake 1 SOL" }]],
        handler: async (bridge, input) => {
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          if (input.amount) {
            const { buildStakeTransaction } = await import("./staking.js");
            const result = await buildStakeTransaction(wallet, Number(input.amount));
            return { status: "success", transaction: "ready", jupsolMint: result.jupsolMint };
          }
          const { getJupsolRate } = await import("./staking.js");
          const rate = await getJupsolRate();
          return { status: "success", ...rate };
        },
      },
      {
        name: "LEND_ASSET",
        similes: ["lend usdc", "deposit for yield", "earn yield", "lending"],
        description: "Lend tokens via Lulo for yield",
        examples: [
          [{ input: { amount: 100, symbol: "USDC" }, output: {}, explanation: "Lend 100 USDC" }],
        ],
        handler: async (bridge, input) => {
          const { buildLendTransaction } = await import("./lulo.js");
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const result = await buildLendTransaction(
            wallet,
            Number(input.amount),
            str(input.symbol, "USDC"),
          );
          return { status: "success", amount: result.amount, symbol: result.symbol };
        },
      },
      {
        name: "WITHDRAW_LEND",
        similes: ["withdraw lending", "remove yield", "withdraw from lulo"],
        description: "Withdraw tokens from Lulo lending",
        examples: [
          [{ input: { mintAddress: "EPj...", amount: 100 }, output: {}, explanation: "Withdraw" }],
        ],
        handler: async (bridge, input) => {
          const { buildWithdrawTransaction } = await import("./lulo.js");
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const result = await buildWithdrawTransaction(
            wallet,
            str(input.mintAddress),
            Number(input.amount),
          );
          return { status: "success", amount: result.amount };
        },
      },
      {
        name: "GET_PORTFOLIO",
        similes: ["portfolio", "wallet holdings", "my tokens", "check balance"],
        description: "Get full portfolio with USD values",
        examples: [[{ input: { wallet: "abc" }, output: {}, explanation: "Get portfolio" }]],
        handler: async (bridge, input) => {
          const { getPortfolio } = await import("./portfolio.js");
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const portfolio = await getPortfolio(wallet, bridge.config.rpcUrl);
          return { status: "success", ...portfolio };
        },
      },
      {
        name: "TRANSFER",
        similes: ["send sol", "transfer tokens", "send crypto"],
        description: "Transfer SOL or SPL tokens to another wallet",
        examples: [
          [
            {
              input: { to: "abc", amount: 1, token: "SOL" },
              output: {},
              explanation: "Send 1 SOL",
            },
          ],
        ],
        handler: async (bridge, input) => {
          const { buildAndSignTransfer } = await import("./wallet.js");
          const keypair = await bridge.getKeypair();
          const result = await buildAndSignTransfer({
            from: keypair,
            to: str(input.to ?? input.recipient),
            amount: Number(input.amount),
            tokenSymbol: str(input.token, "SOL"),
            rpcUrl: bridge.config.rpcUrl,
            network: bridge.config.network,
            confirm: true,
          });
          return { status: "success", signature: result.signature, confirmed: result.confirmed };
        },
      },
    ],
  };
}

function createAnalyticsPlugin(): ActionPlugin {
  return {
    name: "analytics",
    actions: [
      {
        name: "TRENDING_TOKENS",
        similes: ["trending", "what's hot", "popular tokens", "trending crypto"],
        description: "Get trending tokens from CoinGecko",
        examples: [[{ input: {}, output: { coins: [] }, explanation: "Get trending tokens" }]],
        handler: async (bridge, _input) => {
          const { getTrendingTokens } = await import("./coingecko-trending.js");
          const result = await getTrendingTokens(bridge.config.coingeckoApiKey);
          return { status: "success", trending: result.coins };
        },
      },
      {
        name: "DEX_SEARCH",
        similes: ["search dex", "find pairs", "dexscreener"],
        description: "Search DexScreener for token pairs, liquidity, and volume",
        examples: [[{ input: { token: "SOL" }, output: {}, explanation: "Search DEX" }]],
        handler: async (_bridge, input) => {
          const { getTokenDataByTicker, getDexScreenerPairs, getTokenAddressFromTicker } =
            await import("./dexscreener.js");
          const token = str(input.token);
          const data = await getTokenDataByTicker(token);
          const address = await getTokenAddressFromTicker(token);
          const pairs = address ? await getDexScreenerPairs(address) : [];
          return { status: "success", metadata: data, pairs: pairs.slice(0, 5) };
        },
      },
      {
        name: "PARSE_TRANSACTION",
        similes: ["parse tx", "decode transaction", "what happened in tx"],
        description: "Parse a transaction into human-readable format via Helius",
        examples: [[{ input: { signature: "abc" }, output: {}, explanation: "Parse transaction" }]],
        handler: async (bridge, input) => {
          if (!bridge.config.heliusApiKey) {
            return { status: "error", message: "Helius API key required" };
          }
          const { parseTransaction } = await import("./helius.js");
          const parsed = await parseTransaction(str(input.signature), bridge.config.heliusApiKey);
          return { status: "success", parsed };
        },
      },
      {
        name: "WALLET_ASSETS",
        similes: ["my assets", "what do I own", "helius assets"],
        description: "Get all assets owned by a wallet using Helius DAS API",
        examples: [[{ input: { wallet: "abc" }, output: {}, explanation: "Get wallet assets" }]],
        handler: async (bridge, input) => {
          if (!bridge.config.heliusApiKey) {
            return { status: "error", message: "Helius API key required" };
          }
          const { getAssetsByOwner } = await import("./helius.js");
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const assets = await getAssetsByOwner(wallet, bridge.config.heliusApiKey);
          return { status: "success", assets, count: assets.length };
        },
      },
      {
        name: "TOKEN_METADATA",
        similes: ["token info", "token details", "what is this token"],
        description: "Get on-chain metadata and market data for a token",
        examples: [[{ input: { token: "SOL" }, output: {}, explanation: "Get token metadata" }]],
        handler: async (bridge, input) => {
          const { getTokenMetadata } = await import("./on-chain-analytics.js");
          const token = str(input.token ?? input.symbol);
          const metadata = await getTokenMetadata(token, bridge.config.rpcUrl);
          return { status: "success", ...metadata };
        },
      },
      {
        name: "PORTFOLIO_RISK",
        similes: ["risk analysis", "portfolio risk", "diversification"],
        description: "Compute portfolio risk analysis (HHI, concentration, stablecoin ratio)",
        examples: [
          [{ input: { wallet: "abc" }, output: {}, explanation: "Analyze portfolio risk" }],
        ],
        handler: async (bridge, input) => {
          const { getPortfolio } = await import("./portfolio.js");
          const { computePortfolioRisk } = await import("./on-chain-analytics.js");
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const portfolio = await getPortfolio(wallet, bridge.config.rpcUrl);
          const risk = computePortfolioRisk(portfolio.balances, portfolio.totalUsdValue);
          return { status: "success", risk, totalValue: portfolio.totalUsdValue };
        },
      },
      {
        name: "WHALE_ACTIVITY",
        similes: ["whale watch", "network activity", "large transactions"],
        description: "Detect whale activity and network TPS from performance samples",
        examples: [[{ input: {}, output: {}, explanation: "Check whale activity" }]],
        handler: async (bridge, _input) => {
          const { detectWhaleActivity } = await import("./on-chain-analytics.js");
          const result = await detectWhaleActivity(bridge.config.rpcUrl);
          return { status: "success", ...result };
        },
      },
    ],
  };
}

function createNftPlugin(): ActionPlugin {
  return {
    name: "nft",
    actions: [
      {
        name: "GET_NFTS",
        similes: ["my nfts", "list nfts", "nft collection"],
        description: "Get NFTs owned by a wallet using Helius DAS API",
        examples: [[{ input: { wallet: "abc" }, output: {}, explanation: "Get wallet NFTs" }]],
        handler: async (bridge, input) => {
          if (!bridge.config.heliusApiKey) {
            return { status: "error", message: "Helius API key required for NFT queries" };
          }
          const { getAssetsByOwner } = await import("./helius.js");
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const assets = await getAssetsByOwner(wallet, bridge.config.heliusApiKey);
          const nfts = assets.filter(
            (a) => !a.token_info || (a.token_info.decimals === 0 && a.token_info.supply === 1),
          );
          return {
            status: "success",
            nfts: nfts.map((n) => ({
              id: n.id,
              name: n.content.metadata.name,
              symbol: n.content.metadata.symbol,
              owner: n.ownership.owner,
              image: n.content.files?.[0]?.uri,
            })),
            count: nfts.length,
          };
        },
      },
    ],
  };
}

function createAuraPlugin(): ActionPlugin {
  return {
    name: "aura",
    actions: [
      {
        name: "AURA_STAKE_INFO",
        similes: ["aura staking", "check aura stake", "staking pool info"],
        description: "Get AURA staking pool info and user stake status",
        examples: [[{ input: { wallet: "abc" }, output: {}, explanation: "Get staking info" }]],
        handler: async (bridge, input) => {
          const { PublicKey } = await import("@solana/web3.js");
          const { getTokenBySymbol } = await import("./tokens.js");
          const aura = getTokenBySymbol("AURA");
          if (!aura) {
            return { status: "error", message: "AURA mint not configured" };
          }

          const connection = await bridge.getConnection();
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const walletPubkey = new PublicKey(wallet);

          const {
            deriveStakingPoolPDA,
            getStakingPoolInfo,
            getUserStakeInfo,
            computePendingRewards,
          } = await import("./aura-staking.js");
          const [poolPDA] = deriveStakingPoolPDA(aura.mint);
          const pool = await getStakingPoolInfo(connection, aura.mint);
          if (!pool) {
            return { status: "no_pool", message: "Staking pool not initialized" };
          }

          const stake = await getUserStakeInfo(connection, poolPDA, walletPubkey);
          const slot = await connection.getSlot();
          const pending = stake ? computePendingRewards(pool, stake, BigInt(slot)) : 0n;

          return {
            status: "success",
            totalStaked: Number(pool.totalStaked) / 10 ** aura.decimals,
            userStaked: stake ? Number(stake.amount) / 10 ** aura.decimals : 0,
            pendingRewards: Number(pending) / 10 ** aura.decimals,
          };
        },
      },
      {
        name: "AURA_VAULT_INFO",
        similes: ["aura vault", "check vault", "vault status"],
        description: "Get AURA vault info for a wallet",
        examples: [[{ input: { wallet: "abc" }, output: {}, explanation: "Get vault info" }]],
        handler: async (bridge, input) => {
          const { PublicKey } = await import("@solana/web3.js");
          const connection = await bridge.getConnection();
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const walletPubkey = new PublicKey(wallet);

          const { getVaultInfo } = await import("./aura-vault.js");
          const vault = await getVaultInfo(connection, walletPubkey);
          if (!vault) {
            return { status: "no_vault", message: "No vault found" };
          }

          return {
            status: "success",
            owner: vault.owner.toBase58(),
            agent: vault.agent.toBase58(),
            totalDeposited: Number(vault.totalDeposited),
            totalWithdrawn: Number(vault.totalWithdrawn),
            tradeCount: Number(vault.tradeCount),
            guardrails: {
              maxTradeSize: Number(vault.maxTradeSize),
              maxSlippageBps: vault.maxSlippageBps,
              maxConcentrationBps: vault.maxConcentrationBps,
            },
          };
        },
      },
      {
        name: "AURA_FEE_INFO",
        similes: ["aura fees", "fee config", "fee status"],
        description: "Get AURA fee configuration and collection status",
        examples: [[{ input: { wallet: "abc" }, output: {}, explanation: "Get fee info" }]],
        handler: async (bridge, input) => {
          const { PublicKey } = await import("@solana/web3.js");
          const connection = await bridge.getConnection();
          const wallet = str(input.wallet ?? bridge.config.walletAddress);
          const walletPubkey = new PublicKey(wallet);

          const { getFeeConfigInfo } = await import("./aura-fees.js");
          const config = await getFeeConfigInfo(connection, walletPubkey);
          if (!config) {
            return { status: "no_config", message: "Fee config not initialized" };
          }

          return {
            status: "success",
            feeBps: config.feeBps,
            treasuryShareBps: config.treasuryShareBps,
            stakerShareBps: config.stakerShareBps,
            totalFeesCollected: Number(config.totalFeesCollected),
            totalDistributedTreasury: Number(config.totalDistributedTreasury),
            totalDistributedStakers: Number(config.totalDistributedStakers),
          };
        },
      },
    ],
  };
}

// ── Singleton bridge factory ───────────────────────────────────────────

let bridgeInstance: AgentKitBridge | null = null;

/**
 * Get or create the global AgentKitBridge instance.
 * Registers all built-in plugins on first call.
 */
export function getAgentKitBridge(config: AgentKitBridgeConfig): AgentKitBridge {
  if (!bridgeInstance) {
    bridgeInstance = new AgentKitBridge(config);
    const plugins = createBuiltinPlugins(config);
    for (const plugin of plugins) {
      bridgeInstance.registerPlugin(plugin);
    }
  }
  return bridgeInstance;
}
