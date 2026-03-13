import type { Command } from "commander";

export function registerDefiSwapCommand(program: Command) {
  program
    .command("defi:swap")
    .description("Get Jupiter swap quote and build transaction")
    .argument("<inputToken>", "Input token symbol (e.g. SOL)")
    .argument("<outputToken>", "Output token symbol (e.g. USDC)")
    .argument("<amount>", "Amount to swap")
    .option("--wallet <address>", "Wallet public key")
    .option("--slippage <bps>", "Slippage tolerance in basis points", "50")
    .option("--rpc <url>", "Solana RPC URL")
    .action(
      async (
        inputToken: string,
        outputToken: string,
        amountStr: string,
        options: { wallet?: string; slippage?: string; rpc?: string },
      ) => {
        const amount = Number.parseFloat(amountStr);
        if (Number.isNaN(amount) || amount <= 0) {
          console.error("Error: Invalid amount");
          process.exit(1);
        }

        try {
          const { getSwapQuote, buildSwapTransaction } = await import("../../solana/jupiter.js");

          console.log(`\nGetting quote: ${amount} ${inputToken} → ${outputToken}...`);

          const quote = await getSwapQuote({
            inputSymbol: inputToken.toUpperCase(),
            outputSymbol: outputToken.toUpperCase(),
            amount,
            slippageBps: Number.parseInt(options.slippage ?? "50", 10),
          });

          console.log(`\nSwap Quote:`);
          console.log(`  Input:  ${quote.inAmount} ${quote.inputSymbol}`);
          console.log(`  Output: ${quote.outAmount} ${quote.outputSymbol}`);
          console.log(`  Price Impact: ${quote.priceImpactPct}%`);
          console.log(
            `  Routes: ${quote.routePlan.map((r) => `${r.swapInfo.label} (${r.percent}%)`).join(", ")}`,
          );

          const wallet = options.wallet ?? process.env.SOLANA_WALLET;
          if (wallet) {
            console.log(`\nBuilding transaction for ${wallet}...`);
            const swapTx = await buildSwapTransaction({
              quoteResponse: quote.raw,
              userPublicKey: wallet,
            });
            console.log(`  Transaction ready (valid until block ${swapTx.lastValidBlockHeight})`);
            console.log(`  Sign with your wallet to execute.`);
          } else {
            console.log(`\nSet --wallet or SOLANA_WALLET to build executable transaction.`);
          }
        } catch (err) {
          console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      },
    );
}
