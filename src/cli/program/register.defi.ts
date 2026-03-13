import type { Command } from "commander";

export function registerDefiCommands(program: Command) {
  const defi = program
    .command("defi")
    .description("Solana DeFi operations — balance, swap, portfolio, signals");

  // Balance subcommand
  defi
    .command("balance")
    .description("Show wallet SOL + SPL token balances")
    .argument("[wallet]", "Wallet public key (or set SOLANA_WALLET env)")
    .option("--rpc <url>", "Solana RPC URL")
    .action(async (wallet: string | undefined, options: { rpc?: string }) => {
      const mod = await import("../../commands/defi/balance.js");
      // Re-invoke via a temporary program to reuse the action logic
      const { Command: Cmd } = await import("commander");
      const tmp = new Cmd();
      mod.registerDefiBalanceCommand(tmp);
      const args = ["defi:balance"];
      if (wallet) {
        args.push(wallet);
      }
      if (options.rpc) {
        args.push("--rpc", options.rpc);
      }
      await tmp.parseAsync(args, { from: "user" });
    });

  // Swap subcommand
  defi
    .command("swap")
    .description("Get Jupiter swap quote and build transaction")
    .argument("<inputToken>", "Input token symbol (e.g. SOL)")
    .argument("<outputToken>", "Output token symbol (e.g. USDC)")
    .argument("<amount>", "Amount to swap")
    .option("--wallet <address>", "Wallet public key")
    .option("--slippage <bps>", "Slippage tolerance in basis points", "50")
    .action(
      async (
        inputToken: string,
        outputToken: string,
        amount: string,
        options: { wallet?: string; slippage?: string },
      ) => {
        const { getSwapQuote, buildSwapTransaction } = await import("../../solana/jupiter.js");

        const amountNum = Number.parseFloat(amount);
        if (Number.isNaN(amountNum) || amountNum <= 0) {
          console.error("Error: Invalid amount");
          process.exit(1);
        }

        console.log(`\nGetting quote: ${amountNum} ${inputToken} → ${outputToken}...`);
        const quote = await getSwapQuote({
          inputSymbol: inputToken.toUpperCase(),
          outputSymbol: outputToken.toUpperCase(),
          amount: amountNum,
          slippageBps: Number.parseInt(options.slippage ?? "50", 10),
        });

        console.log(`\nSwap Quote:`);
        console.log(`  Input:  ${quote.inAmount} ${quote.inputSymbol}`);
        console.log(`  Output: ${quote.outAmount} ${quote.outputSymbol}`);
        console.log(`  Price Impact: ${quote.priceImpactPct}%`);

        const wallet = options.wallet ?? process.env.SOLANA_WALLET;
        if (wallet) {
          const swapTx = await buildSwapTransaction({
            quoteResponse: quote.raw,
            userPublicKey: wallet,
          });
          console.log(`  Transaction ready (valid until block ${swapTx.lastValidBlockHeight})`);
        } else {
          console.log(`\nSet --wallet or SOLANA_WALLET to build executable transaction.`);
        }
      },
    );

  // Portfolio subcommand
  defi
    .command("portfolio")
    .description("Show full portfolio with USD values")
    .argument("[wallet]", "Wallet public key (or set SOLANA_WALLET env)")
    .option("--rpc <url>", "Solana RPC URL")
    .action(async (wallet: string | undefined, options: { rpc?: string }) => {
      const address = wallet ?? process.env.SOLANA_WALLET;
      if (!address) {
        console.error("Error: Wallet address required.");
        process.exit(1);
      }
      const { getPortfolio } = await import("../../solana/portfolio.js");
      const portfolio = await getPortfolio(address, options.rpc);

      console.log(`\nTotal Portfolio Value: $${portfolio.totalUsdValue.toFixed(2)}`);
      for (const b of portfolio.balances) {
        const usd = b.usdValue !== null ? `$${b.usdValue.toFixed(2)}` : "N/A";
        console.log(`  ${b.token.symbol}: ${b.balance.toFixed(4)} (${usd})`);
      }
    });

  // Signals subcommand
  defi
    .command("signals")
    .description("Get AI-powered DeFi market signals")
    .option("--api-key <key>", "OpenRouter API key")
    .action(async (options: { apiKey?: string }) => {
      const mod = await import("../../commands/defi/signals.js");
      const { Command: Cmd } = await import("commander");
      const tmp = new Cmd();
      mod.registerDefiSignalsCommand(tmp);
      const args = ["defi:signals"];
      if (options.apiKey) {
        args.push("--api-key", options.apiKey);
      }
      await tmp.parseAsync(args, { from: "user" });
    });
}
