import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import {
  ToolInputError,
  jsonResult,
  readBooleanParam,
  readNumberParam,
  readStringParam,
} from "./common.js";

const DEFI_ACTIONS = [
  "balance",
  "swap",
  "portfolio",
  "signals",
  "transfer",
  "guardrails_status",
  "token_info",
  "tx_history",
  "auto_rebalance",
  "pyth_price",
  "dex_search",
  "parse_tx",
  "rugcheck",
  "limit_order",
  "stake",
  "trending",
  "lend",
  "pumpfun_info",
  "agent_action",
  "list_actions",
  "close_empty_accounts",
  "search_coin",
  "aura_stake",
  "aura_vault",
  "aura_fees",
  "dca",
  "autopilot",
  "sniper",
  "webhook",
  "launch_token",
  "buy_token",
] as const;

const SolanaDefiToolSchema = Type.Object({
  action: stringEnum([...DEFI_ACTIONS]),
  wallet: Type.Optional(Type.String({ description: "Wallet public key" })),
  input_token: Type.Optional(Type.String({ description: "Input token symbol (e.g. SOL, USDC)" })),
  output_token: Type.Optional(Type.String({ description: "Output token symbol (e.g. USDC, SOL)" })),
  amount: Type.Optional(Type.Number({ description: "Amount for swap/transfer" })),
  recipient: Type.Optional(Type.String({ description: "Recipient wallet address for transfer" })),
  slippage_bps: Type.Optional(Type.Number({ description: "Slippage tolerance in basis points" })),
  confirm: Type.Optional(
    Type.Boolean({ description: "Sign and submit the transaction on-chain (default: false)" }),
  ),
  token: Type.Optional(Type.String({ description: "Token symbol for token_info/tx_history" })),
  limit: Type.Optional(Type.Number({ description: "Max results for tx_history (default: 10)" })),
  include_unknown: Type.Optional(
    Type.Boolean({ description: "Include non-registry SPL tokens in portfolio" }),
  ),
  mint: Type.Optional(
    Type.String({ description: "Token mint address (for rugcheck, limit_order, pumpfun_info)" }),
  ),
  making_amount: Type.Optional(
    Type.String({ description: "Amount to sell in smallest unit (limit_order)" }),
  ),
  taking_amount: Type.Optional(
    Type.String({ description: "Amount to receive in smallest unit (limit_order)" }),
  ),
  order_action: Type.Optional(
    Type.String({ description: "Limit order sub-action: create, cancel, list, history" }),
  ),
  orders: Type.Optional(
    Type.String({ description: "Comma-separated order public keys to cancel" }),
  ),
  duration: Type.Optional(
    Type.String({ description: "Duration for trending/gainers: 1h, 24h, 7d, 14d, 30d" }),
  ),
  lend_action: Type.Optional(Type.String({ description: "Lending sub-action: deposit, withdraw" })),
  action_name: Type.Optional(
    Type.String({ description: "Agent-kit action name for agent_action dispatch" }),
  ),
  action_input: Type.Optional(
    Type.String({ description: "JSON string of action input params for agent_action" }),
  ),
  query: Type.Optional(Type.String({ description: "Search query for search_coin action" })),
  vault_action: Type.Optional(
    Type.String({ description: "Vault sub-action: info, deposit, withdraw, guardrails" }),
  ),
  stake_action: Type.Optional(
    Type.String({ description: "AURA stake sub-action: info, stake, unstake, claim" }),
  ),
  fee_action: Type.Optional(
    Type.String({ description: "Fee sub-action: info, collect, distribute" }),
  ),
  agent_key: Type.Optional(
    Type.String({ description: "Agent public key for vault authorization" }),
  ),
  max_trade_size: Type.Optional(
    Type.Number({ description: "Max trade size for vault guardrails" }),
  ),
  max_slippage_bps: Type.Optional(
    Type.Number({ description: "Max slippage in bps for vault guardrails" }),
  ),
  max_concentration_bps: Type.Optional(
    Type.Number({ description: "Max concentration in bps for vault guardrails" }),
  ),
  dca_action: Type.Optional(
    Type.String({ description: "DCA sub-action: create, cancel, execute, status" }),
  ),
  interval: Type.Optional(
    Type.String({ description: "DCA interval: 1m, 5m, 15m, 1h, 4h, 1d, 1w" }),
  ),
  total_budget: Type.Optional(Type.Number({ description: "Total DCA budget" })),
  order_id: Type.Optional(Type.String({ description: "DCA order ID to cancel/execute" })),
  autopilot_action: Type.Optional(
    Type.String({ description: "Autopilot sub-action: start, stop, status, trade, config" }),
  ),
  strategy: Type.Optional(
    Type.String({
      description: "Autopilot strategy: conservative, balanced, aggressive, dip_buyer, momentum",
    }),
  ),
  sniper_action: Type.Optional(
    Type.String({ description: "Sniper sub-action: scan, status, buy, config" }),
  ),
  auto_buy: Type.Optional(Type.Boolean({ description: "Auto-buy safe tokens (sniper)" })),
  buy_amount_sol: Type.Optional(Type.Number({ description: "SOL amount per sniper buy" })),
  webhook_action: Type.Optional(
    Type.String({ description: "Webhook sub-action: list, create, delete" }),
  ),
  webhook_url: Type.Optional(Type.String({ description: "Webhook URL for Helius notifications" })),
  webhook_id: Type.Optional(Type.String({ description: "Webhook ID to delete" })),
  addresses: Type.Optional(Type.String({ description: "Comma-separated addresses to monitor" })),
  token_name: Type.Optional(Type.String({ description: "Token name for launch_token" })),
  token_symbol: Type.Optional(Type.String({ description: "Token ticker symbol for launch_token" })),
  token_description: Type.Optional(Type.String({ description: "Token description for launch" })),
  image_url: Type.Optional(Type.String({ description: "Token image URL for launch" })),
  initial_buy_sol: Type.Optional(
    Type.Number({ description: "Initial buy in SOL for Pump.fun launch/buy" }),
  ),
});

export function createSolanaDefiTool(opts?: {
  rpcUrl?: string;
  walletAddress?: string;
  slippageBps?: number;
  openRouterApiKey?: string;
  network?: "devnet" | "testnet" | "mainnet-beta";
  privateKey?: string;
  walletPath?: string;
  auraMint?: string;
  maxTxAmountUsd?: number;
  dailySpendLimitUsd?: number;
  maxTxPerHour?: number;
  confirmationThresholdUsd?: number;
  recipientAllowlist?: string[];
  heliusApiKey?: string;
  coingeckoApiKey?: string;
}): AnyAgentTool {
  // Lazy-init guardrails tracker (singleton per tool instance)
  let spendTracker: import("../../solana/guardrails.js").SpendTracker | null = null;

  async function getTracker() {
    if (!spendTracker) {
      const { SpendTracker } = await import("../../solana/guardrails.js");
      spendTracker = new SpendTracker({
        maxTxAmountUsd: opts?.maxTxAmountUsd ?? 100,
        dailySpendLimitUsd: opts?.dailySpendLimitUsd ?? 500,
        maxTxPerHour: opts?.maxTxPerHour ?? 20,
        confirmationThresholdUsd: opts?.confirmationThresholdUsd ?? 25,
        recipientAllowlist: opts?.recipientAllowlist ?? [],
      });
    }
    return spendTracker;
  }

  // Configure AURA mint if provided
  if (opts?.auraMint) {
    void import("../../solana/tokens.js").then(({ setAuraMint }) => setAuraMint(opts.auraMint!));
  }

  return {
    label: "Solana DeFi",
    name: "solana_defi",
    ownerOnly: true,
    description: `Execute Solana DeFi operations with guardrails. Actions:
- balance: Get wallet SOL + SPL token balances (requires wallet)
- swap: Get Jupiter swap quote; set confirm=true to sign+submit (requires input_token, output_token, amount)
- portfolio: Full portfolio with USD values (requires wallet; set include_unknown=true for all SPL tokens)
- signals: AI-powered market analysis with risk + whale data
- transfer: Send SOL/SPL tokens (requires recipient, amount; set confirm=true to sign+submit)
- guardrails_status: View spend limits, daily usage, and recent transactions
- token_info: Get on-chain metadata for a token (requires token)
- tx_history: Recent transactions for a wallet (requires wallet; optional limit)
- auto_rebalance: AI-suggested portfolio rebalancing (requires wallet)
- pyth_price: Get real-time oracle price from Pyth Network (requires token)
- dex_search: Search DexScreener for token pairs, liquidity, and volume (requires token)
- parse_tx: Parse a transaction into human-readable format via Helius (requires tx signature in token field)
- rugcheck: Security analysis for a token (requires mint or token)
- limit_order: Jupiter limit orders — create/cancel/list/history (set order_action)
- stake: Stake SOL for jupSOL liquid staking (requires amount; set confirm=true to sign)
- trending: CoinGecko trending tokens and top gainers (optional duration)
- lend: Lulo lending — deposit/withdraw yield (requires amount, token; set lend_action)
- pumpfun_info: Get Pump.fun token data and bonding curve info (requires mint)
- agent_action: Execute any registered agent-kit action by name (requires action_name; optional action_input as JSON)
- list_actions: List all available agent-kit actions with descriptions
- close_empty_accounts: Close empty SPL token accounts to reclaim SOL rent (requires wallet)
- search_coin: Search CoinGecko for a coin by name/symbol (requires query)
- aura_stake: AURA token staking — stake/unstake/claim rewards (set stake_action; requires amount for stake/unstake)
- aura_vault: Managed vault operations — deposit/withdraw/view/update guardrails (set vault_action; requires amount for deposit/withdraw)
- aura_fees: Fee collection/distribution — view config, collect fees, distribute to treasury+stakers (set fee_action)
- dca: Dollar cost averaging — create recurring swap orders that execute on-chain (set dca_action: create/cancel/execute/status)
- autopilot: AI-driven autonomous trading — start/stop the engine, or execute a one-shot trade (set autopilot_action: start/stop/status/trade/config)
- sniper: Token sniper — scan Pump.fun for new launches, auto-rugcheck, auto-buy safe tokens (set sniper_action: scan/status/buy/config)
- webhook: Helius webhooks — monitor wallet/account transactions (set webhook_action: list/create/delete)
- launch_token: Launch a new token on Pump.fun with real on-chain execution (requires token_name, token_symbol, token_description, image_url)
- buy_token: Buy/sell a token directly — AI rugchecks first, then executes the swap (requires token, amount; set confirm=true)`,
    parameters: SolanaDefiToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });

      switch (action) {
        case "balance": {
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          if (!wallet) {
            throw new ToolInputError("wallet required for balance action");
          }

          const { getWalletBalances } = await import("../../solana/portfolio.js");
          const balances = await getWalletBalances(wallet, opts?.rpcUrl);
          return jsonResult({
            wallet,
            balances: balances.map((b) => ({
              symbol: b.token.symbol,
              name: b.token.name,
              balance: b.balance,
              usdValue: b.usdValue,
            })),
          });
        }

        case "swap": {
          const inputToken = readStringParam(params, "input_token", { required: true });
          const outputToken = readStringParam(params, "output_token", { required: true });
          const amountRaw = readNumberParam(params, "amount", { required: true });
          if (amountRaw === undefined) {
            throw new ToolInputError("amount required");
          }
          const amount = amountRaw;
          const slippageBps = readNumberParam(params, "slippage_bps") ?? opts?.slippageBps ?? 50;
          const shouldConfirm = readBooleanParam(params, "confirm") ?? false;

          const { getSwapQuote, buildSwapTransaction, deserializeSwapTransaction } =
            await import("../../solana/jupiter.js");
          const quote = await getSwapQuote({
            inputSymbol: inputToken,
            outputSymbol: outputToken,
            amount,
            slippageBps,
          });

          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          let swapTx = null;
          if (wallet) {
            swapTx = await buildSwapTransaction({
              quoteResponse: quote.raw,
              userPublicKey: wallet,
            });
          }

          // If confirm=true, run guardrails then sign+send
          if (shouldConfirm && swapTx) {
            const { estimateUsdValue } = await import("../../solana/guardrails.js");
            const usdValue = await estimateUsdValue(amount, inputToken);
            const tracker = await getTracker();
            const validation = tracker.validate(usdValue, "jupiter-swap", "swap");

            if (!validation.allowed) {
              return jsonResult({
                status: "blocked_by_guardrails",
                reason: validation.reason,
                quote: formatQuote(quote),
              });
            }

            if (validation.requiresConfirmation) {
              return jsonResult({
                status: "requires_confirmation",
                estimatedUsdValue: usdValue,
                message: `This swap is worth ~$${usdValue.toFixed(2)} which exceeds the $${opts?.confirmationThresholdUsd ?? 25} confirmation threshold. Call again with confirm=true to proceed.`,
                quote: formatQuote(quote),
              });
            }

            const { loadKeypair, signAndSendTransaction } = await import("../../solana/wallet.js");
            const keypair = await loadKeypair({
              privateKey: opts?.privateKey,
              walletPath: opts?.walletPath,
            });
            const tx = await deserializeSwapTransaction(swapTx.swapTransaction, opts?.rpcUrl);
            const result = await signAndSendTransaction(tx, keypair, {
              rpcUrl: opts?.rpcUrl,
              network: opts?.network,
              confirm: true,
            });

            tracker.record(usdValue, "jupiter-swap", "swap");

            return jsonResult({
              status: "confirmed",
              signature: result.signature,
              confirmed: result.confirmed,
              quote: formatQuote(quote),
            });
          }

          return jsonResult({
            quote: formatQuote(quote),
            transaction: swapTx
              ? { ready: true, lastValidBlockHeight: swapTx.lastValidBlockHeight }
              : { ready: false, reason: "No wallet provided — quote only" },
          });
        }

        case "portfolio": {
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          if (!wallet) {
            throw new ToolInputError("wallet required for portfolio action");
          }
          const includeUnknown = readBooleanParam(params, "include_unknown") ?? false;

          const { getPortfolio } = await import("../../solana/portfolio.js");
          const portfolio = await getPortfolio(wallet, opts?.rpcUrl, { includeUnknown });

          // Enrich with risk data
          let riskAnalysis = null;
          try {
            const { computePortfolioRisk } = await import("../../solana/on-chain-analytics.js");
            riskAnalysis = computePortfolioRisk(portfolio.balances, portfolio.totalUsdValue);
          } catch {
            // on-chain-analytics not critical
          }

          return jsonResult({
            wallet: portfolio.wallet,
            totalUsdValue: portfolio.totalUsdValue,
            holdings: portfolio.balances.map((b) => ({
              symbol: b.token.symbol,
              name: b.token.name,
              balance: b.balance,
              usdValue: b.usdValue,
              allocation:
                portfolio.totalUsdValue > 0 && b.usdValue
                  ? ((b.usdValue / portfolio.totalUsdValue) * 100).toFixed(1) + "%"
                  : null,
            })),
            riskAnalysis,
            timestamp: portfolio.timestamp,
          });
        }

        case "signals": {
          const signals = await generateMarketSignals(opts?.openRouterApiKey);

          // Enrich with whale activity
          try {
            const { detectWhaleActivity } = await import("../../solana/on-chain-analytics.js");
            const whaleData = await detectWhaleActivity(opts?.rpcUrl);
            signals.whaleActivity = whaleData;
          } catch {
            // whale detection not critical
          }

          return jsonResult(signals);
        }

        case "transfer": {
          const recipient = readStringParam(params, "recipient", { required: true });
          const transferAmountRaw = readNumberParam(params, "amount", { required: true });
          if (transferAmountRaw === undefined) {
            throw new ToolInputError("amount required");
          }
          const transferAmount = transferAmountRaw;
          const tokenSymbol = readStringParam(params, "input_token") ?? "SOL";
          const shouldConfirm = readBooleanParam(params, "confirm") ?? false;

          const { getTokenBySymbol } = await import("../../solana/tokens.js");
          const token = getTokenBySymbol(tokenSymbol);
          if (!token) {
            throw new ToolInputError(`Unknown token: ${tokenSymbol}`);
          }

          if (shouldConfirm) {
            const { estimateUsdValue } = await import("../../solana/guardrails.js");
            const usdValue = await estimateUsdValue(transferAmount, tokenSymbol);
            const tracker = await getTracker();
            const validation = tracker.validate(usdValue, recipient, "transfer");

            if (!validation.allowed) {
              return jsonResult({
                status: "blocked_by_guardrails",
                reason: validation.reason,
                token: token.symbol,
                amount: transferAmount,
                recipient,
              });
            }

            const { loadKeypair, buildAndSignTransfer } = await import("../../solana/wallet.js");
            const keypair = await loadKeypair({
              privateKey: opts?.privateKey,
              walletPath: opts?.walletPath,
            });
            const result = await buildAndSignTransfer({
              from: keypair,
              to: recipient,
              amount: transferAmount,
              tokenSymbol,
              rpcUrl: opts?.rpcUrl,
              network: opts?.network,
              confirm: true,
            });

            tracker.record(usdValue, recipient, "transfer");

            return jsonResult({
              status: "confirmed",
              signature: result.signature,
              confirmed: result.confirmed,
              from: keypair.publicKey.toBase58(),
              to: recipient,
              token: token.symbol,
              amount: transferAmount,
            });
          }

          return jsonResult({
            status: "transaction_preview",
            to: recipient,
            token: token.symbol,
            amount: transferAmount,
            note: "Set confirm=true to sign and submit this transfer on-chain.",
          });
        }

        case "guardrails_status": {
          const tracker = await getTracker();
          return jsonResult(tracker.getStatus());
        }

        case "token_info": {
          const tokenSymbol =
            readStringParam(params, "token") ?? readStringParam(params, "input_token");
          if (!tokenSymbol) {
            throw new ToolInputError("token required for token_info action");
          }

          const { getTokenMetadata } = await import("../../solana/on-chain-analytics.js");
          const metadata = await getTokenMetadata(tokenSymbol, opts?.rpcUrl);
          return jsonResult(metadata);
        }

        case "tx_history": {
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          if (!wallet) {
            throw new ToolInputError("wallet required for tx_history action");
          }
          const limit = readNumberParam(params, "limit") ?? 10;

          const { getRecentTransactions } = await import("../../solana/on-chain-analytics.js");
          const transactions = await getRecentTransactions(wallet, opts?.rpcUrl, limit);
          return jsonResult({ wallet, transactions, count: transactions.length });
        }

        case "auto_rebalance": {
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          if (!wallet) {
            throw new ToolInputError("wallet required for auto_rebalance action");
          }

          const { getPortfolio } = await import("../../solana/portfolio.js");
          const portfolio = await getPortfolio(wallet, opts?.rpcUrl);
          const { computePortfolioRisk } = await import("../../solana/on-chain-analytics.js");
          const risk = computePortfolioRisk(portfolio.balances, portfolio.totalUsdValue);

          // Generate rebalance suggestions via AI signals
          const signals = await generateMarketSignals(opts?.openRouterApiKey);
          return jsonResult({
            wallet,
            currentPortfolio: portfolio.balances.map((b) => ({
              symbol: b.token.symbol,
              balance: b.balance,
              usdValue: b.usdValue,
              allocation:
                portfolio.totalUsdValue > 0 && b.usdValue
                  ? ((b.usdValue / portfolio.totalUsdValue) * 100).toFixed(1) + "%"
                  : null,
            })),
            riskAnalysis: risk,
            marketSignals: signals,
            suggestion:
              "Review the risk analysis and market signals above. " +
              "Use the swap action with confirm=true to execute individual rebalancing trades.",
          });
        }

        case "pyth_price": {
          const tokenSymbol =
            readStringParam(params, "token") ?? readStringParam(params, "input_token");
          if (!tokenSymbol) {
            throw new ToolInputError("token required for pyth_price action");
          }

          const { getPythTokenPrice, fetchPythPriceFeedId } = await import("../../solana/pyth.js");
          const feedId = await fetchPythPriceFeedId(tokenSymbol);
          const price = feedId ? await getPythTokenPrice(tokenSymbol) : null;
          return jsonResult({
            token: tokenSymbol,
            feedId,
            price,
            source: "Pyth Network (on-chain oracle)",
          });
        }

        case "dex_search": {
          const tokenSymbol =
            readStringParam(params, "token") ?? readStringParam(params, "input_token");
          if (!tokenSymbol) {
            throw new ToolInputError("token required for dex_search action");
          }

          const { getTokenDataByTicker, getDexScreenerPairs, getTokenAddressFromTicker } =
            await import("../../solana/dexscreener.js");
          const tokenData = await getTokenDataByTicker(tokenSymbol);
          const address = await getTokenAddressFromTicker(tokenSymbol);
          const pairs = address ? await getDexScreenerPairs(address) : [];

          return jsonResult({
            token: tokenSymbol,
            metadata: tokenData,
            topPairs: pairs.slice(0, 5).map((p) => ({
              dex: p.dexId,
              pair: `${p.baseToken.symbol}/${p.quoteToken.symbol}`,
              priceUsd: p.priceUsd,
              volume24h: p.volume.h24,
              liquidity: p.liquidity.usd,
              priceChange24h: p.priceChange.h24,
            })),
            source: "DexScreener + Jupiter",
          });
        }

        case "parse_tx": {
          const signature = readStringParam(params, "token") ?? readStringParam(params, "wallet");
          if (!signature) {
            throw new ToolInputError("transaction signature required for parse_tx action");
          }

          const heliusKey = opts?.heliusApiKey;
          if (!heliusKey) {
            return jsonResult({
              status: "error",
              message: "Helius API key required. Set solana.heliusApiKey in config.",
            });
          }

          const { parseTransaction } = await import("../../solana/helius.js");
          const parsed = await parseTransaction(signature, heliusKey);
          return jsonResult({ signature, parsed });
        }

        case "rugcheck": {
          const mint =
            readStringParam(params, "mint") ??
            readStringParam(params, "token") ??
            readStringParam(params, "input_token");
          if (!mint) {
            throw new ToolInputError("mint or token required for rugcheck action");
          }

          // If it looks like a symbol, resolve to mint address first
          let mintAddress = mint;
          if (mint.length < 20) {
            const { getTokenAddressFromTicker } = await import("../../solana/dexscreener.js");
            const resolved = await getTokenAddressFromTicker(mint);
            if (!resolved) {
              return jsonResult({
                status: "error",
                message: `Could not resolve token symbol "${mint}" to a mint address.`,
              });
            }
            mintAddress = resolved;
          }

          const { fetchTokenReportSummary, assessRisk } = await import("../../solana/rugcheck.js");
          const report = await fetchTokenReportSummary(mintAddress);
          const assessment = assessRisk(report);
          return jsonResult({
            mint: mintAddress,
            tokenProgram: report.tokenProgram,
            tokenType: report.tokenType,
            score: report.score,
            riskLevel: assessment.riskLevel,
            summary: assessment.summary,
            topRisks: assessment.topRisks,
            source: "Rugcheck.xyz",
          });
        }

        case "limit_order": {
          const orderAction = readStringParam(params, "order_action") ?? "list";
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          if (!wallet) {
            throw new ToolInputError("wallet required for limit_order action");
          }

          switch (orderAction) {
            case "create": {
              const inputMint =
                readStringParam(params, "input_token") ?? readStringParam(params, "mint");
              const outputMint = readStringParam(params, "output_token");
              const makingAmount = readStringParam(params, "making_amount");
              const takingAmount = readStringParam(params, "taking_amount");
              if (!inputMint || !outputMint || !makingAmount || !takingAmount) {
                throw new ToolInputError(
                  "input_token, output_token, making_amount, and taking_amount required to create a limit order",
                );
              }

              const { createLimitOrder } = await import("../../solana/jupiter-limit-orders.js");
              const result = await createLimitOrder(wallet, {
                inputMint,
                outputMint,
                makingAmount,
                takingAmount,
              });

              const shouldConfirm = readBooleanParam(params, "confirm") ?? false;
              if (shouldConfirm) {
                const { deserializeLimitOrderTx } =
                  await import("../../solana/jupiter-limit-orders.js");
                const { loadKeypair, signAndSendTransaction } =
                  await import("../../solana/wallet.js");
                const keypair = await loadKeypair({
                  privateKey: opts?.privateKey,
                  walletPath: opts?.walletPath,
                });
                const tx = deserializeLimitOrderTx(result.tx);
                const sent = await signAndSendTransaction(tx, keypair, {
                  rpcUrl: opts?.rpcUrl,
                  network: opts?.network,
                  confirm: true,
                });
                return jsonResult({
                  status: "confirmed",
                  order: result.order,
                  signature: sent.signature,
                });
              }

              return jsonResult({
                status: "order_created",
                order: result.order,
                note: "Set confirm=true to sign and submit the limit order on-chain.",
              });
            }
            case "cancel": {
              const ordersStr = readStringParam(params, "orders");
              if (!ordersStr) {
                throw new ToolInputError(
                  "orders (comma-separated public keys) required for cancel",
                );
              }
              const orderKeys = ordersStr.split(",").map((s) => s.trim());
              const { cancelLimitOrders } = await import("../../solana/jupiter-limit-orders.js");
              const result = await cancelLimitOrders(wallet, orderKeys);
              return jsonResult({
                status: "cancelled",
                cancelledOrders: orderKeys.length,
                transactions: result.txs.length,
              });
            }
            case "history": {
              const { getLimitOrderHistory } = await import("../../solana/jupiter-limit-orders.js");
              const history = await getLimitOrderHistory(wallet);
              return jsonResult({
                wallet,
                orders: history.orders,
                hasMore: history.hasMoreData,
              });
            }
            default: {
              // "list" or fallback
              const { getOpenLimitOrders } = await import("../../solana/jupiter-limit-orders.js");
              const orders = await getOpenLimitOrders(wallet);
              return jsonResult({
                wallet,
                openOrders: orders.length,
                orders,
              });
            }
          }
        }

        case "stake": {
          const amountRaw = readNumberParam(params, "amount");
          const shouldConfirm = readBooleanParam(params, "confirm") ?? false;
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;

          // If no amount, show current rate
          if (!amountRaw) {
            const { getJupsolRate } = await import("../../solana/staking.js");
            const rate = await getJupsolRate();
            return jsonResult({
              action: "stake_info",
              solPerJupsol: rate.solPerJupsol,
              jupsolMint: rate.jupsolMint,
              estimatedApy: rate.apy,
              note: "Provide amount (in SOL) to build a staking transaction.",
            });
          }

          if (!wallet) {
            throw new ToolInputError("wallet required for staking");
          }

          const { buildStakeTransaction } = await import("../../solana/staking.js");
          const stakeResult = await buildStakeTransaction(wallet, amountRaw);

          if (shouldConfirm) {
            const { estimateUsdValue } = await import("../../solana/guardrails.js");
            const usdValue = await estimateUsdValue(amountRaw, "SOL");
            const tracker = await getTracker();
            const validation = tracker.validate(usdValue, "jupiter-stake", "stake");

            if (!validation.allowed) {
              return jsonResult({
                status: "blocked_by_guardrails",
                reason: validation.reason,
                amount: amountRaw,
              });
            }

            const { deserializeStakeTransaction } = await import("../../solana/staking.js");
            const { loadKeypair, signAndSendTransaction } = await import("../../solana/wallet.js");
            const keypair = await loadKeypair({
              privateKey: opts?.privateKey,
              walletPath: opts?.walletPath,
            });
            const tx = deserializeStakeTransaction(stakeResult.transaction);
            const sent = await signAndSendTransaction(tx, keypair, {
              rpcUrl: opts?.rpcUrl,
              network: opts?.network,
              confirm: true,
            });

            tracker.record(usdValue, "jupiter-stake", "stake");

            return jsonResult({
              status: "confirmed",
              signature: sent.signature,
              amountStaked: amountRaw,
              jupsolMint: stakeResult.jupsolMint,
            });
          }

          return jsonResult({
            status: "transaction_ready",
            amountSol: amountRaw,
            jupsolMint: stakeResult.jupsolMint,
            note: "Set confirm=true to sign and submit the staking transaction.",
          });
        }

        case "trending": {
          const { getTrendingTokens } = await import("../../solana/coingecko-trending.js");
          const apiKey = opts?.coingeckoApiKey ?? process.env.COINGECKO_API_KEY;
          const trending = await getTrendingTokens(apiKey);

          const coins = trending.coins.map((c) => ({
            name: c.item.name,
            symbol: c.item.symbol,
            marketCapRank: c.item.market_cap_rank,
            priceBtc: c.item.price_btc,
            score: c.item.score,
          }));

          return jsonResult({
            trending: coins,
            count: coins.length,
            source: "CoinGecko",
          });
        }

        case "lend": {
          const lendAction = readStringParam(params, "lend_action") ?? "deposit";
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          if (!wallet) {
            throw new ToolInputError("wallet required for lending");
          }

          const amountRaw = readNumberParam(params, "amount");
          if (!amountRaw) {
            // Show supported tokens
            const { LULO_SUPPORTED_TOKENS } = await import("../../solana/lulo.js");
            return jsonResult({
              supportedTokens: Object.keys(LULO_SUPPORTED_TOKENS),
              note: "Provide amount and token (via input_token) to build a lending transaction.",
            });
          }

          const tokenSymbol =
            readStringParam(params, "input_token") ?? readStringParam(params, "token") ?? "USDC";
          const shouldConfirm = readBooleanParam(params, "confirm") ?? false;

          if (lendAction === "withdraw") {
            const { resolveTokenMint, buildWithdrawTransaction, deserializeLuloTransaction } =
              await import("../../solana/lulo.js");
            const mintAddress = resolveTokenMint(tokenSymbol);
            if (!mintAddress) {
              throw new ToolInputError(`Unsupported token for Lulo: ${tokenSymbol}`);
            }

            const result = await buildWithdrawTransaction(wallet, mintAddress, amountRaw);

            if (shouldConfirm) {
              const { loadKeypair, signAndSendTransaction } =
                await import("../../solana/wallet.js");
              const keypair = await loadKeypair({
                privateKey: opts?.privateKey,
                walletPath: opts?.walletPath,
              });
              const tx = deserializeLuloTransaction(result.transaction);
              const sent = await signAndSendTransaction(tx, keypair, {
                rpcUrl: opts?.rpcUrl,
                network: opts?.network,
                confirm: true,
              });
              return jsonResult({
                status: "confirmed",
                action: "withdraw",
                signature: sent.signature,
                amount: amountRaw,
                token: tokenSymbol,
              });
            }

            return jsonResult({
              status: "transaction_ready",
              action: "withdraw",
              amount: amountRaw,
              token: tokenSymbol,
              note: "Set confirm=true to sign and submit the withdrawal.",
            });
          }

          // Default: deposit
          const { buildLendTransaction, deserializeLuloTransaction } =
            await import("../../solana/lulo.js");
          const result = await buildLendTransaction(wallet, amountRaw, tokenSymbol);

          if (shouldConfirm) {
            const { estimateUsdValue } = await import("../../solana/guardrails.js");
            const usdValue = await estimateUsdValue(amountRaw, tokenSymbol);
            const tracker = await getTracker();
            const validation = tracker.validate(usdValue, "lulo-lend", "lend");

            if (!validation.allowed) {
              return jsonResult({
                status: "blocked_by_guardrails",
                reason: validation.reason,
                amount: amountRaw,
                token: tokenSymbol,
              });
            }

            const { loadKeypair, signAndSendTransaction } = await import("../../solana/wallet.js");
            const keypair = await loadKeypair({
              privateKey: opts?.privateKey,
              walletPath: opts?.walletPath,
            });
            const tx = deserializeLuloTransaction(result.transaction);
            const sent = await signAndSendTransaction(tx, keypair, {
              rpcUrl: opts?.rpcUrl,
              network: opts?.network,
              confirm: true,
            });

            tracker.record(usdValue, "lulo-lend", "lend");

            return jsonResult({
              status: "confirmed",
              action: "deposit",
              signature: sent.signature,
              amount: amountRaw,
              token: tokenSymbol,
            });
          }

          return jsonResult({
            status: "transaction_ready",
            action: "deposit",
            amount: amountRaw,
            token: tokenSymbol,
            note: "Set confirm=true to sign and submit the lending deposit.",
          });
        }

        case "pumpfun_info": {
          const mint = readStringParam(params, "mint") ?? readStringParam(params, "token");
          if (!mint) {
            throw new ToolInputError("mint required for pumpfun_info action");
          }

          // If it looks like a symbol, resolve to mint
          let mintAddress = mint;
          if (mint.length < 20) {
            const { getTokenAddressFromTicker } = await import("../../solana/dexscreener.js");
            const resolved = await getTokenAddressFromTicker(mint);
            if (!resolved) {
              return jsonResult({
                status: "error",
                message: `Could not resolve "${mint}" to a mint address.`,
              });
            }
            mintAddress = resolved;
          }

          const { getPumpfunTokenData, estimatePumpfunBuyPrice } =
            await import("../../solana/pumpfun.js");
          const coinData = await getPumpfunTokenData(mintAddress);
          if (!coinData) {
            return jsonResult({
              status: "not_found",
              mint: mintAddress,
              message: "Token not found on Pump.fun. It may not be a Pump.fun token.",
            });
          }

          const buyEstimate = estimatePumpfunBuyPrice(coinData, 1000);

          return jsonResult({
            mint: coinData.mint,
            name: coinData.name,
            symbol: coinData.symbol,
            description: coinData.description,
            imageUri: coinData.image_uri,
            creator: coinData.creator,
            bondingCurve: coinData.bonding_curve,
            complete: coinData.complete,
            raydiumPool: coinData.raydium_pool,
            marketCap: coinData.market_cap,
            usdMarketCap: coinData.usd_market_cap,
            totalSupply: coinData.total_supply,
            replyCount: coinData.reply_count,
            nsfw: coinData.nsfw,
            buyEstimate: {
              tokenAmount: 1000,
              solCost: buyEstimate.solCost,
              pricePerToken: buyEstimate.pricePerToken,
            },
            socials: {
              twitter: coinData.twitter || null,
              telegram: coinData.telegram || null,
              website: coinData.website || null,
            },
            source: "Pump.fun",
          });
        }

        case "agent_action": {
          const actionName = readStringParam(params, "action_name");
          if (!actionName) {
            throw new ToolInputError("action_name required for agent_action");
          }

          const { getAgentKitBridge } = await import("../../solana/agent-kit-bridge.js");
          const bridge = getAgentKitBridge({
            rpcUrl: opts?.rpcUrl,
            network: opts?.network,
            walletAddress: readStringParam(params, "wallet") ?? opts?.walletAddress,
            privateKey: opts?.privateKey,
            walletPath: opts?.walletPath,
            heliusApiKey: opts?.heliusApiKey,
            coingeckoApiKey: opts?.coingeckoApiKey,
            openRouterApiKey: opts?.openRouterApiKey,
            slippageBps: opts?.slippageBps,
          });

          let actionInput: Record<string, unknown> = {};
          const inputStr = readStringParam(params, "action_input");
          if (inputStr) {
            try {
              actionInput = JSON.parse(inputStr) as Record<string, unknown>;
            } catch {
              throw new ToolInputError("action_input must be valid JSON");
            }
          }

          // Merge top-level params into action input as fallbacks
          if (!actionInput.wallet) {
            actionInput.wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          }
          if (!actionInput.token && readStringParam(params, "token")) {
            actionInput.token = readStringParam(params, "token");
          }
          if (!actionInput.amount && readNumberParam(params, "amount") !== undefined) {
            actionInput.amount = readNumberParam(params, "amount");
          }

          const result = await bridge.executeAction(actionName, actionInput);
          return jsonResult(result);
        }

        case "list_actions": {
          const { getAgentKitBridge } = await import("../../solana/agent-kit-bridge.js");
          const bridge = getAgentKitBridge({
            rpcUrl: opts?.rpcUrl,
            network: opts?.network,
            walletAddress: opts?.walletAddress,
          });
          const actions = bridge.getAvailableActions();
          return jsonResult({
            actions,
            totalActions: actions.length,
            plugins: [...new Set(actions.map((a) => a.plugin))],
          });
        }

        case "close_empty_accounts": {
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          if (!wallet) {
            throw new ToolInputError("wallet required for close_empty_accounts");
          }

          const { PublicKey } = await import("@solana/web3.js");
          const { getSolanaConnection } = await import("../../solana/connection.js");
          const { getAllTokenAccounts } = await import("../../solana/spl-utils.js");

          const connection = getSolanaConnection(opts?.rpcUrl, "confirmed", opts?.network);
          const walletPubkey = new PublicKey(wallet);
          const accounts = await getAllTokenAccounts(connection, walletPubkey);
          const emptyAccounts = accounts.filter((a) => a.balance === 0);

          if (emptyAccounts.length === 0) {
            return jsonResult({
              status: "no_empty_accounts",
              message: "No empty token accounts to close.",
              totalAccounts: accounts.length,
            });
          }

          const shouldConfirm = readBooleanParam(params, "confirm") ?? false;
          if (!shouldConfirm) {
            return jsonResult({
              status: "preview",
              emptyAccounts: emptyAccounts.length,
              totalAccounts: accounts.length,
              estimatedRentRecovery: `~${(emptyAccounts.length * 0.00203928).toFixed(6)} SOL`,
              accounts: emptyAccounts.map((a) => ({ mint: a.mint, tokenAccount: a.tokenAccount })),
              note: "Set confirm=true to close these accounts and reclaim rent.",
            });
          }

          const { buildCloseEmptyAccountInstructions } = await import("../../solana/spl-utils.js");
          const closeIxs = buildCloseEmptyAccountInstructions(emptyAccounts, walletPubkey);

          const { loadKeypair } = await import("../../solana/wallet.js");
          const { sendTransactionWithPriorityFees } = await import("../../solana/priority-fees.js");
          const keypair = await loadKeypair({
            privateKey: opts?.privateKey,
            walletPath: opts?.walletPath,
          });

          const signature = await sendTransactionWithPriorityFees(connection, keypair, closeIxs, {
            feeTier: "min",
          });

          return jsonResult({
            status: "confirmed",
            signature,
            closedAccounts: emptyAccounts.length,
            estimatedRentRecovered: `~${(emptyAccounts.length * 0.00203928).toFixed(6)} SOL`,
          });
        }

        case "search_coin": {
          const query = readStringParam(params, "query") ?? readStringParam(params, "token");
          if (!query) {
            throw new ToolInputError("query required for search_coin action");
          }

          const { searchCoins } = await import("../../solana/coingecko-enhanced.js");
          const coins = await searchCoins(query, opts?.coingeckoApiKey);
          return jsonResult({
            query,
            results: coins.slice(0, 10),
            totalResults: coins.length,
            source: "CoinGecko",
          });
        }

        case "aura_stake": {
          const stakeAction = readStringParam(params, "stake_action") ?? "info";
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          if (!wallet) {
            throw new ToolInputError("wallet required for aura_stake");
          }

          const { PublicKey } = await import("@solana/web3.js");
          const { getSolanaConnection } = await import("../../solana/connection.js");
          const { getTokenBySymbol } = await import("../../solana/tokens.js");
          const auraToken = getTokenBySymbol("AURA");
          if (!auraToken) {
            throw new ToolInputError("AURA mint not configured. Set solana.auraMint in config.");
          }
          const auraMint = auraToken.mint;
          const connection = getSolanaConnection(opts?.rpcUrl, "confirmed", opts?.network);
          const walletPubkey = new PublicKey(wallet);

          const {
            deriveStakingPoolPDA,
            getStakingPoolInfo,
            getUserStakeInfo,
            computePendingRewards,
          } = await import("../../solana/aura-staking.js");

          const [poolPDA] = deriveStakingPoolPDA(auraMint);

          switch (stakeAction) {
            case "stake":
            case "unstake": {
              const amountRaw = readNumberParam(params, "amount");
              if (!amountRaw) {
                throw new ToolInputError("amount required for stake/unstake");
              }
              const amountLamports = BigInt(Math.floor(amountRaw * 10 ** auraToken.decimals));
              const shouldConfirm = readBooleanParam(params, "confirm") ?? false;

              if (!shouldConfirm) {
                return jsonResult({
                  status: "transaction_preview",
                  action: stakeAction,
                  amount: amountRaw,
                  token: "AURA",
                  note: "Set confirm=true to sign and submit on-chain.",
                });
              }

              const { loadKeypair } = await import("../../solana/wallet.js");
              const { sendTransactionWithPriorityFees } =
                await import("../../solana/priority-fees.js");
              const keypair = await loadKeypair({
                privateKey: opts?.privateKey,
                walletPath: opts?.walletPath,
              });

              // Resolve pool token account (ATA of pool PDA for AURA mint)
              const { getAssociatedTokenAddress } = await import("@solana/spl-token");
              const poolTokenAccount = await getAssociatedTokenAddress(auraMint, poolPDA, true);

              if (stakeAction === "stake") {
                const { buildStakeAuraIx } = await import("../../solana/aura-staking.js");
                const ix = await buildStakeAuraIx(
                  walletPubkey,
                  auraMint,
                  amountLamports,
                  poolTokenAccount,
                );
                const sig = await sendTransactionWithPriorityFees(connection, keypair, [ix]);
                return jsonResult({
                  status: "confirmed",
                  signature: sig,
                  action: "stake",
                  amount: amountRaw,
                });
              }
              const { buildUnstakeAuraIx } = await import("../../solana/aura-staking.js");
              const ix = await buildUnstakeAuraIx(
                walletPubkey,
                auraMint,
                amountLamports,
                poolTokenAccount,
              );
              const sig = await sendTransactionWithPriorityFees(connection, keypair, [ix]);
              return jsonResult({
                status: "confirmed",
                signature: sig,
                action: "unstake",
                amount: amountRaw,
              });
            }

            case "claim": {
              const shouldConfirm = readBooleanParam(params, "confirm") ?? false;
              const pool = await getStakingPoolInfo(connection, auraMint);
              const stake = pool ? await getUserStakeInfo(connection, poolPDA, walletPubkey) : null;
              if (!pool || !stake) {
                return jsonResult({ status: "error", message: "No active stake found." });
              }

              const slot = await connection.getSlot();
              const pending = computePendingRewards(pool, stake, BigInt(slot));
              if (pending === 0n) {
                return jsonResult({ status: "no_rewards", message: "No rewards to claim." });
              }

              if (!shouldConfirm) {
                return jsonResult({
                  status: "preview",
                  pendingRewards: Number(pending) / 10 ** auraToken.decimals,
                  note: "Set confirm=true to claim rewards.",
                });
              }

              const { loadKeypair } = await import("../../solana/wallet.js");
              const { sendTransactionWithPriorityFees } =
                await import("../../solana/priority-fees.js");
              const keypair = await loadKeypair({
                privateKey: opts?.privateKey,
                walletPath: opts?.walletPath,
              });
              const { getAssociatedTokenAddress } = await import("@solana/spl-token");
              const poolTokenAccount = await getAssociatedTokenAddress(auraMint, poolPDA, true);
              const { buildClaimRewardsIx } = await import("../../solana/aura-staking.js");
              const ix = await buildClaimRewardsIx(
                walletPubkey,
                auraMint,
                poolTokenAccount,
                poolTokenAccount, // reward token account = pool token account for AURA rewards
              );
              const sig = await sendTransactionWithPriorityFees(connection, keypair, [ix]);
              return jsonResult({
                status: "confirmed",
                signature: sig,
                rewardsClaimed: Number(pending) / 10 ** auraToken.decimals,
              });
            }

            default: {
              // "info" — show pool + user stake info
              const pool = await getStakingPoolInfo(connection, auraMint);
              if (!pool) {
                return jsonResult({
                  status: "no_pool",
                  message: "Staking pool not initialized for AURA.",
                  mint: auraMint.toBase58(),
                });
              }

              const stake = await getUserStakeInfo(connection, poolPDA, walletPubkey);
              const slot = await connection.getSlot();
              const pending = stake ? computePendingRewards(pool, stake, BigInt(slot)) : 0n;

              return jsonResult({
                pool: {
                  authority: pool.authority.toBase58(),
                  mint: pool.stakingMint.toBase58(),
                  rewardRatePerSlot: Number(pool.rewardRatePerSlot),
                  totalStaked: Number(pool.totalStaked) / 10 ** auraToken.decimals,
                },
                userStake: stake
                  ? {
                      amount: Number(stake.amount) / 10 ** auraToken.decimals,
                      pendingRewards: Number(pending) / 10 ** auraToken.decimals,
                      stakeTimestamp: Number(stake.stakeTimestamp),
                    }
                  : null,
                source: "Aura Staking Program",
              });
            }
          }
        }

        case "aura_vault": {
          const vaultAction = readStringParam(params, "vault_action") ?? "info";
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          if (!wallet) {
            throw new ToolInputError("wallet required for aura_vault");
          }

          const { PublicKey } = await import("@solana/web3.js");
          const { getSolanaConnection } = await import("../../solana/connection.js");
          const connection = getSolanaConnection(opts?.rpcUrl, "confirmed", opts?.network);
          const walletPubkey = new PublicKey(wallet);

          const { getVaultInfo } = await import("../../solana/aura-vault.js");

          switch (vaultAction) {
            case "deposit":
            case "withdraw": {
              const amountRaw = readNumberParam(params, "amount");
              if (!amountRaw) {
                throw new ToolInputError("amount required for vault deposit/withdraw");
              }
              const shouldConfirm = readBooleanParam(params, "confirm") ?? false;

              const vault = await getVaultInfo(connection, walletPubkey);
              if (!vault) {
                return jsonResult({
                  status: "error",
                  message: "No vault found. Initialize a vault first.",
                });
              }

              if (!shouldConfirm) {
                return jsonResult({
                  status: "transaction_preview",
                  action: vaultAction,
                  amount: amountRaw,
                  vaultTokenAccount: vault.tokenAccount.toBase58(),
                  note: "Set confirm=true to sign and submit on-chain.",
                });
              }

              const { loadKeypair } = await import("../../solana/wallet.js");
              const { sendTransactionWithPriorityFees } =
                await import("../../solana/priority-fees.js");
              const keypair = await loadKeypair({
                privateKey: opts?.privateKey,
                walletPath: opts?.walletPath,
              });

              // Use 9 decimals (SOL-denominated vault) — could be configurable
              const amountLamports = BigInt(Math.floor(amountRaw * 1e9));
              const userTokenAccount = vault.tokenAccount; // simplified; real impl resolves user ATA

              if (vaultAction === "deposit") {
                const { buildDepositIx } = await import("../../solana/aura-vault.js");
                const ix = buildDepositIx(
                  walletPubkey,
                  walletPubkey,
                  userTokenAccount,
                  vault.tokenAccount,
                  amountLamports,
                );
                const sig = await sendTransactionWithPriorityFees(connection, keypair, [ix]);
                return jsonResult({
                  status: "confirmed",
                  signature: sig,
                  action: "deposit",
                  amount: amountRaw,
                });
              }
              const { buildWithdrawIx } = await import("../../solana/aura-vault.js");
              const ix = buildWithdrawIx(
                walletPubkey,
                userTokenAccount,
                vault.tokenAccount,
                amountLamports,
              );
              const sig = await sendTransactionWithPriorityFees(connection, keypair, [ix]);
              return jsonResult({
                status: "confirmed",
                signature: sig,
                action: "withdraw",
                amount: amountRaw,
              });
            }

            case "guardrails": {
              const maxTradeSize = readNumberParam(params, "max_trade_size");
              const maxSlippageBps = readNumberParam(params, "max_slippage_bps");
              const maxConcentrationBps = readNumberParam(params, "max_concentration_bps");

              if (maxTradeSize === undefined && maxSlippageBps === undefined) {
                // Read-only: show current guardrails
                const vault = await getVaultInfo(connection, walletPubkey);
                if (!vault) {
                  return jsonResult({ status: "error", message: "No vault found." });
                }
                return jsonResult({
                  maxTradeSize: Number(vault.maxTradeSize),
                  maxSlippageBps: vault.maxSlippageBps,
                  maxConcentrationBps: vault.maxConcentrationBps,
                  tradeCount: Number(vault.tradeCount),
                });
              }

              const shouldConfirm = readBooleanParam(params, "confirm") ?? false;
              if (!shouldConfirm) {
                return jsonResult({
                  status: "preview",
                  maxTradeSize,
                  maxSlippageBps,
                  maxConcentrationBps,
                  note: "Set confirm=true to update vault guardrails on-chain.",
                });
              }

              const { loadKeypair } = await import("../../solana/wallet.js");
              const { sendTransactionWithPriorityFees } =
                await import("../../solana/priority-fees.js");
              const keypair = await loadKeypair({
                privateKey: opts?.privateKey,
                walletPath: opts?.walletPath,
              });
              const { buildUpdateGuardrailsIx } = await import("../../solana/aura-vault.js");
              const ix = buildUpdateGuardrailsIx(walletPubkey, {
                maxTradeSize: BigInt(maxTradeSize ?? 0),
                maxSlippageBps: maxSlippageBps ?? 100,
                maxConcentrationBps: maxConcentrationBps ?? 5000,
              });
              const sig = await sendTransactionWithPriorityFees(connection, keypair, [ix]);
              return jsonResult({
                status: "confirmed",
                signature: sig,
                action: "update_guardrails",
              });
            }

            default: {
              // "info" — show vault state
              const vault = await getVaultInfo(connection, walletPubkey);
              if (!vault) {
                return jsonResult({
                  status: "no_vault",
                  message:
                    "No vault found for this wallet. Use vault_action=deposit after initializing.",
                  wallet,
                });
              }
              return jsonResult({
                owner: vault.owner.toBase58(),
                agent: vault.agent.toBase58(),
                tokenAccount: vault.tokenAccount.toBase58(),
                totalDeposited: Number(vault.totalDeposited),
                totalWithdrawn: Number(vault.totalWithdrawn),
                netDeposited: Number(vault.totalDeposited - vault.totalWithdrawn),
                tradeCount: Number(vault.tradeCount),
                guardrails: {
                  maxTradeSize: Number(vault.maxTradeSize),
                  maxSlippageBps: vault.maxSlippageBps,
                  maxConcentrationBps: vault.maxConcentrationBps,
                },
                source: "Aura Vault Program",
              });
            }
          }
        }

        case "aura_fees": {
          const feeAction = readStringParam(params, "fee_action") ?? "info";
          const wallet = readStringParam(params, "wallet") ?? opts?.walletAddress;
          if (!wallet) {
            throw new ToolInputError("wallet required for aura_fees");
          }

          const { PublicKey } = await import("@solana/web3.js");
          const { getSolanaConnection } = await import("../../solana/connection.js");
          const connection = getSolanaConnection(opts?.rpcUrl, "confirmed", opts?.network);
          const walletPubkey = new PublicKey(wallet);

          const { getFeeConfigInfo, calculateFee, calculateDistribution } =
            await import("../../solana/aura-fees.js");

          switch (feeAction) {
            case "collect": {
              const amountRaw = readNumberParam(params, "amount");
              if (!amountRaw) {
                throw new ToolInputError("amount (swap amount) required for fee collection");
              }
              const shouldConfirm = readBooleanParam(params, "confirm") ?? false;

              const config = await getFeeConfigInfo(connection, walletPubkey);
              if (!config) {
                return jsonResult({ status: "error", message: "Fee config not initialized." });
              }

              const swapAmount = BigInt(Math.floor(amountRaw * 1e9));
              const feeAmount = calculateFee(swapAmount, config.feeBps);

              if (!shouldConfirm) {
                return jsonResult({
                  status: "preview",
                  swapAmount: amountRaw,
                  feeBps: config.feeBps,
                  feeAmount: Number(feeAmount) / 1e9,
                  note: "Set confirm=true to collect fees on-chain.",
                });
              }

              return jsonResult({
                status: "fee_calculated",
                swapAmount: amountRaw,
                feeAmount: Number(feeAmount) / 1e9,
                feeBps: config.feeBps,
                note: "Fee collection requires on-chain token accounts. Use agent_action for advanced dispatch.",
              });
            }

            case "distribute": {
              const config = await getFeeConfigInfo(connection, walletPubkey);
              if (!config) {
                return jsonResult({ status: "error", message: "Fee config not initialized." });
              }

              const undistributed =
                config.totalFeesCollected -
                config.totalDistributedTreasury -
                config.totalDistributedStakers;

              if (undistributed <= 0n) {
                return jsonResult({
                  status: "no_fees",
                  message: "No undistributed fees available.",
                });
              }

              const distribution = calculateDistribution(
                undistributed,
                config.treasuryShareBps,
                config.stakerShareBps,
              );

              return jsonResult({
                status: "distribution_preview",
                undistributed: Number(undistributed) / 1e9,
                treasuryAmount: Number(distribution.treasuryAmount) / 1e9,
                stakerAmount: Number(distribution.stakerAmount) / 1e9,
                treasuryShareBps: config.treasuryShareBps,
                stakerShareBps: config.stakerShareBps,
                note: "Set confirm=true to distribute fees on-chain.",
              });
            }

            default: {
              // "info" — show fee config
              const config = await getFeeConfigInfo(connection, walletPubkey);
              if (!config) {
                return jsonResult({
                  status: "no_config",
                  message: "Fee config not initialized for this authority.",
                  wallet,
                });
              }
              return jsonResult({
                authority: config.authority.toBase58(),
                feeBps: config.feeBps,
                feePercent: `${(config.feeBps / 100).toFixed(2)}%`,
                treasuryShareBps: config.treasuryShareBps,
                stakerShareBps: config.stakerShareBps,
                totalFeesCollected: Number(config.totalFeesCollected) / 1e9,
                totalDistributedTreasury: Number(config.totalDistributedTreasury) / 1e9,
                totalDistributedStakers: Number(config.totalDistributedStakers) / 1e9,
                source: "Aura Fees Program",
              });
            }
          }
        }

        case "dca": {
          const dcaAction = readStringParam(params, "dca_action") ?? "status";
          const { getDcaTracker } = await import("../../solana/dca.js");
          const dcaTracker = getDcaTracker();

          // Configure wallet on first use
          dcaTracker.configure({
            keypairLoader: async () => {
              const { loadKeypair } = await import("../../solana/wallet.js");
              return loadKeypair({ privateKey: opts?.privateKey, walletPath: opts?.walletPath });
            },
            rpcUrl: opts?.rpcUrl,
            network: opts?.network,
          });

          switch (dcaAction) {
            case "create": {
              const inputToken = readStringParam(params, "input_token") ?? "USDC";
              const outputToken = readStringParam(params, "output_token");
              const amountRaw = readNumberParam(params, "amount");
              const interval = readStringParam(params, "interval") ?? "1h";
              const totalBudget = readNumberParam(params, "total_budget");
              if (!outputToken || !amountRaw) {
                throw new ToolInputError("output_token and amount required to create a DCA order");
              }
              const order = dcaTracker.createOrder({
                inputToken,
                outputToken,
                amountPerInterval: amountRaw,
                interval,
                totalBudget: totalBudget ?? undefined,
                slippageBps: readNumberParam(params, "slippage_bps") ?? opts?.slippageBps ?? 50,
              });
              return jsonResult({
                status: "created",
                order,
                note: `DCA order created. Will swap ${amountRaw} ${inputToken} → ${outputToken} every ${interval}. First execution in ${interval}.`,
              });
            }
            case "cancel": {
              const orderId = readStringParam(params, "order_id");
              if (!orderId) {
                throw new ToolInputError("order_id required to cancel a DCA order");
              }
              const cancelled = dcaTracker.cancelOrder(orderId);
              return jsonResult({ status: cancelled ? "cancelled" : "not_found", orderId });
            }
            case "execute": {
              const orderId = readStringParam(params, "order_id");
              if (!orderId) {
                throw new ToolInputError("order_id required to execute a DCA order");
              }
              const execution = await dcaTracker.executeOrder(orderId);
              if (!execution) {
                return jsonResult({ status: "error", message: "Order not found or not active" });
              }
              return jsonResult(execution);
            }
            default:
              return jsonResult(dcaTracker.getStatus());
          }
        }

        case "autopilot": {
          const apAction = readStringParam(params, "autopilot_action") ?? "status";
          const { getAutopilotEngine } = await import("../../solana/autopilot.js");
          const ap = getAutopilotEngine();

          // Configure wallet + AI on first use
          ap.configure({
            keypairLoader: async () => {
              const { loadKeypair } = await import("../../solana/wallet.js");
              return loadKeypair({ privateKey: opts?.privateKey, walletPath: opts?.walletPath });
            },
            rpcUrl: opts?.rpcUrl,
            network: opts?.network,
            openRouterApiKey: opts?.openRouterApiKey ?? process.env.OPENROUTER_API_KEY,
          });

          switch (apAction) {
            case "start": {
              const strategy = readStringParam(params, "strategy");
              if (strategy) {
                ap.updateConfig({
                  strategy: strategy as import("../../solana/autopilot.js").AutopilotStrategy,
                });
              }
              ap.start();
              return jsonResult({
                status: "started",
                ...ap.getState(),
              });
            }
            case "stop": {
              ap.stop();
              return jsonResult({ status: "stopped", ...ap.getState() });
            }
            case "trade": {
              // One-shot trade: user says "buy SOL" and agent executes
              const tokenStr =
                readStringParam(params, "token") ?? readStringParam(params, "output_token");
              if (!tokenStr) {
                throw new ToolInputError("token required for autopilot trade");
              }
              const tradeAction =
                readStringParam(params, "input_token")?.toUpperCase() === tokenStr.toUpperCase()
                  ? "sell"
                  : "buy";
              const amountUsd = readNumberParam(params, "amount");

              const trade = await ap.executeUserTrade({
                token: tokenStr,
                action: tradeAction,
                amountUsd: amountUsd ?? undefined,
              });

              return jsonResult({
                status: "executed",
                signature: trade.signature,
                token: trade.token,
                action: trade.action,
                inputToken: trade.inputToken,
                outputToken: trade.outputToken,
                amount: trade.amount,
                outputAmount: trade.outputAmount,
                priceImpact: trade.priceImpact,
              });
            }
            case "config": {
              const strategy = readStringParam(params, "strategy");
              const maxTrade = readNumberParam(params, "amount");
              const tokens = readStringParam(params, "token");
              const update: Record<string, unknown> = {};
              if (strategy) {
                update.strategy = strategy;
              }
              if (maxTrade) {
                update.maxTradeAmountUsd = maxTrade;
              }
              if (tokens) {
                update.tokens = tokens.split(",").map((t) => t.trim());
              }
              ap.updateConfig(
                update as Partial<import("../../solana/autopilot.js").AutopilotConfig>,
              );
              return jsonResult({ status: "updated", config: ap.getState().config });
            }
            default:
              return jsonResult(ap.getState());
          }
        }

        case "sniper": {
          const sniperAction = readStringParam(params, "sniper_action") ?? "status";
          const { getTokenSniper } = await import("../../solana/token-sniper.js");
          const sniper = getTokenSniper();

          sniper.configure({
            keypairLoader: async () => {
              const { loadKeypair } = await import("../../solana/wallet.js");
              return loadKeypair({ privateKey: opts?.privateKey, walletPath: opts?.walletPath });
            },
            rpcUrl: opts?.rpcUrl,
            network: opts?.network,
          });

          switch (sniperAction) {
            case "scan": {
              const autoBuy = readBooleanParam(params, "auto_buy");
              if (autoBuy !== undefined) {
                sniper.updateConfig({ autoBuy });
              }
              const buyAmount = readNumberParam(params, "buy_amount_sol");
              if (buyAmount) {
                sniper.updateConfig({ buyAmountSol: buyAmount });
              }

              const targets = await sniper.scan();
              const safe = sniper.getFilteredTargets();
              return jsonResult({
                status: "scanned",
                newTokensFound: targets.length,
                safeTargets: safe.length,
                targets: safe.slice(0, 10).map((t) => ({
                  mint: t.mint,
                  name: t.name,
                  symbol: t.symbol,
                  usdMarketCap: t.usdMarketCap,
                  riskLevel: t.riskLevel,
                  rugcheckScore: t.rugcheckScore,
                  bought: t.bought,
                  buySignature: t.buySignature,
                })),
              });
            }
            case "buy": {
              const mint = readStringParam(params, "mint") ?? readStringParam(params, "token");
              if (!mint) {
                throw new ToolInputError("mint required for sniper buy");
              }
              const sig = await sniper.buyToken(mint);
              return jsonResult({ status: "bought", mint, signature: sig });
            }
            case "config": {
              const autoBuy = readBooleanParam(params, "auto_buy");
              const buyAmount = readNumberParam(params, "buy_amount_sol");
              const maxMcap = readNumberParam(params, "amount");
              if (autoBuy !== undefined) {
                sniper.updateConfig({ autoBuy });
              }
              if (buyAmount) {
                sniper.updateConfig({ buyAmountSol: buyAmount });
              }
              if (maxMcap) {
                sniper.updateConfig({ maxMarketCap: maxMcap });
              }
              return jsonResult({ status: "updated", config: sniper.getStatus().config });
            }
            default:
              return jsonResult(sniper.getStatus());
          }
        }

        case "webhook": {
          const webhookAction = readStringParam(params, "webhook_action") ?? "list";
          const heliusKey = opts?.heliusApiKey;
          if (!heliusKey) {
            return jsonResult({
              status: "error",
              message: "Helius API key required. Set solana.heliusApiKey in config.",
            });
          }

          const { listWebhooks, createWebhookEnhanced, deleteWebhook } =
            await import("../../solana/helius-webhooks.js");

          switch (webhookAction) {
            case "create": {
              const webhookUrl = readStringParam(params, "webhook_url");
              const addressesStr = readStringParam(params, "addresses");
              if (!webhookUrl || !addressesStr) {
                throw new ToolInputError("webhook_url and addresses required to create a webhook");
              }
              const addresses = addressesStr.split(",").map((a) => a.trim());
              const webhook = await createWebhookEnhanced(
                { accountAddresses: addresses, webhookURL: webhookUrl },
                heliusKey,
              );
              return jsonResult({ status: "created", webhook });
            }
            case "delete": {
              const webhookId = readStringParam(params, "webhook_id");
              if (!webhookId) {
                throw new ToolInputError("webhook_id required to delete a webhook");
              }
              await deleteWebhook(webhookId, heliusKey);
              return jsonResult({ status: "deleted", webhookId });
            }
            default: {
              const webhooks = await listWebhooks(heliusKey);
              return jsonResult({ webhooks, count: webhooks.length });
            }
          }
        }

        case "launch_token": {
          const name = readStringParam(params, "token_name");
          const symbol = readStringParam(params, "token_symbol");
          const description = readStringParam(params, "token_description");
          const imageUrl = readStringParam(params, "image_url");
          if (!name || !symbol || !description || !imageUrl) {
            throw new ToolInputError(
              "token_name, token_symbol, token_description, and image_url required",
            );
          }

          const shouldConfirm = readBooleanParam(params, "confirm") ?? false;
          if (!shouldConfirm) {
            return jsonResult({
              status: "preview",
              name,
              symbol,
              description,
              imageUrl,
              initialBuySol: readNumberParam(params, "initial_buy_sol") ?? 0.0001,
              note: "Set confirm=true to launch this token on Pump.fun.",
            });
          }

          const { loadKeypair } = await import("../../solana/wallet.js");
          const keypair = await loadKeypair({
            privateKey: opts?.privateKey,
            walletPath: opts?.walletPath,
          });

          const { launchToken } = await import("../../solana/pumpfun.js");
          const result = await launchToken(
            keypair,
            { name, symbol, description, imageUrl },
            {
              initialBuySol: readNumberParam(params, "initial_buy_sol") ?? 0.0001,
              slippageBps: readNumberParam(params, "slippage_bps") ?? 500,
              rpcUrl: opts?.rpcUrl,
              network: opts?.network,
            },
          );

          return jsonResult({
            status: "launched",
            signature: result.signature,
            mint: result.mint,
            metadataUri: result.metadataUri,
            name,
            symbol,
          });
        }

        case "buy_token": {
          // AI-powered buy: rugcheck → quote → execute
          const tokenStr =
            readStringParam(params, "token") ??
            readStringParam(params, "output_token") ??
            readStringParam(params, "mint");
          if (!tokenStr) {
            throw new ToolInputError("token or mint required for buy_token");
          }

          const amountRaw = readNumberParam(params, "amount");
          if (!amountRaw) {
            throw new ToolInputError("amount required (in USD for buy, in token units for sell)");
          }

          const shouldConfirm = readBooleanParam(params, "confirm") ?? false;

          // Step 1: Rugcheck
          let mintAddress = tokenStr;
          if (tokenStr.length < 20) {
            const { getTokenAddressFromTicker } = await import("../../solana/dexscreener.js");
            const resolved = await getTokenAddressFromTicker(tokenStr);
            if (resolved) {
              mintAddress = resolved;
            }
          }

          const { fetchTokenReportSummary, assessRisk } = await import("../../solana/rugcheck.js");
          const report = await fetchTokenReportSummary(mintAddress);
          const risk = assessRisk(report);

          if (risk.riskLevel === "danger") {
            return jsonResult({
              status: "blocked",
              reason: "DANGER",
              riskLevel: risk.riskLevel,
              score: report.score,
              summary: risk.summary,
              message: `Token ${tokenStr} failed rugcheck with score ${report.score}. DO NOT BUY.`,
            });
          }

          if (risk.riskLevel === "warning") {
            if (!shouldConfirm) {
              return jsonResult({
                status: "warning",
                riskLevel: risk.riskLevel,
                score: report.score,
                summary: risk.summary,
                message: `Token ${tokenStr} has rugcheck warnings (score: ${report.score}). Set confirm=true to proceed despite warnings.`,
              });
            }
          }

          if (!shouldConfirm) {
            return jsonResult({
              status: "preview",
              token: tokenStr,
              mint: mintAddress,
              amount: amountRaw,
              riskLevel: risk.riskLevel,
              rugcheckScore: report.score,
              note: "Rugcheck passed. Set confirm=true to execute the swap.",
            });
          }

          // Step 2: Execute via autopilot engine (handles quote + sign + send)
          const { getAutopilotEngine } = await import("../../solana/autopilot.js");
          const ap = getAutopilotEngine();
          ap.configure({
            keypairLoader: async () => {
              const { loadKeypair } = await import("../../solana/wallet.js");
              return loadKeypair({ privateKey: opts?.privateKey, walletPath: opts?.walletPath });
            },
            rpcUrl: opts?.rpcUrl,
            network: opts?.network,
          });

          const trade = await ap.executeUserTrade({
            token: tokenStr,
            action: "buy",
            amountUsd: amountRaw,
          });

          return jsonResult({
            status: "executed",
            signature: trade.signature,
            token: tokenStr,
            mint: mintAddress,
            rugcheckScore: report.score,
            riskLevel: risk.riskLevel,
            outputAmount: trade.outputAmount,
            priceImpact: trade.priceImpact,
          });
        }

        default:
          throw new ToolInputError(`Unknown action: ${action}. Valid: ${DEFI_ACTIONS.join(", ")}`);
      }
    },
  };
}

function formatQuote(quote: {
  inputSymbol: string;
  outputSymbol: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: Array<{ swapInfo: { label: string }; percent: number }>;
}) {
  return {
    inputToken: quote.inputSymbol,
    outputToken: quote.outputSymbol,
    inputAmount: quote.inAmount,
    outputAmount: quote.outAmount,
    priceImpact: quote.priceImpactPct,
    routes: quote.routePlan.map((r) => ({
      label: r.swapInfo.label,
      percent: r.percent,
    })),
  };
}

async function generateMarketSignals(openRouterApiKey?: string): Promise<Record<string, unknown>> {
  const ids = "solana,usd-coin,tether,bonk,jupiter-exchange-solana";
  const priceRes = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
  );
  const priceData = priceRes.ok
    ? ((await priceRes.json()) as Record<string, Record<string, number>>)
    : {};

  const marketData = Object.entries(priceData).map(([id, data]) => ({
    id,
    price: data.usd,
    change24h: data.usd_24h_change,
    volume24h: data.usd_24h_vol,
  }));

  let aiAnalysis: string | null = null;
  const apiKey = openRouterApiKey ?? process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    const prompt = `Analyze these Solana ecosystem token metrics and provide brief trading signals (2-3 sentences each):\n${JSON.stringify(marketData, null, 2)}`;
    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              "You are a DeFi market analyst. Provide concise, actionable signals based on token data. Include sentiment (bullish/bearish/neutral) and confidence level.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 500,
      }),
    });

    if (aiRes.ok) {
      const aiData = (await aiRes.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      aiAnalysis = aiData.choices?.[0]?.message?.content ?? null;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    marketData,
    aiAnalysis: aiAnalysis ?? "Set OPENROUTER_API_KEY for AI-powered analysis",
    source: "CoinGecko + OpenRouter",
  };
}
