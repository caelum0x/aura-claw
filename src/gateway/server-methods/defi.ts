import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const defiHandlers: GatewayRequestHandlers = {
  "defi.balance": async ({ params, respond }) => {
    try {
      const wallet = params.wallet as string | undefined;
      if (!wallet) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "wallet required"));
        return;
      }
      const { getWalletBalances } = await import("../../solana/portfolio.js");
      const balances = await getWalletBalances(wallet, params.rpcUrl as string | undefined);
      respond(
        true,
        {
          wallet,
          balances: balances.map((b) => ({
            symbol: b.token.symbol,
            balance: b.balance,
            usdValue: b.usdValue,
          })),
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "defi.swap": async ({ params, respond }) => {
    try {
      const inputToken = params.inputToken as string | undefined;
      const outputToken = params.outputToken as string | undefined;
      const amount = params.amount as number | undefined;
      if (!inputToken || !outputToken || !amount) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "inputToken, outputToken, and amount required"),
        );
        return;
      }
      const { getSwapQuote, buildSwapTransaction } = await import("../../solana/jupiter.js");
      const quote = await getSwapQuote({
        inputSymbol: inputToken,
        outputSymbol: outputToken,
        amount,
        slippageBps: (params.slippageBps as number) ?? 50,
      });

      let swapTx = null;
      const wallet = params.wallet as string | undefined;
      if (wallet) {
        swapTx = await buildSwapTransaction({
          quoteResponse: quote.raw,
          userPublicKey: wallet,
        });
      }

      respond(true, { quote, transaction: swapTx }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "defi.portfolio": async ({ params, respond }) => {
    try {
      const wallet = params.wallet as string | undefined;
      if (!wallet) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "wallet required"));
        return;
      }
      const { getPortfolio } = await import("../../solana/portfolio.js");
      const portfolio = await getPortfolio(wallet, params.rpcUrl as string | undefined);
      respond(true, portfolio, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "defi.signals": async ({ params: _params, respond }) => {
    try {
      const ids = "solana,usd-coin,tether,bonk,jupiter-exchange-solana";
      const priceRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      );
      const priceData = priceRes.ok ? await priceRes.json() : {};
      respond(
        true,
        {
          timestamp: new Date().toISOString(),
          marketData: priceData,
          source: "CoinGecko",
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
