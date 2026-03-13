import type { Command } from "commander";

export function registerDefiPortfolioCommand(program: Command) {
  program
    .command("defi:portfolio")
    .description("Show full portfolio with USD values")
    .argument("[wallet]", "Wallet public key (or set SOLANA_WALLET env)")
    .option("--rpc <url>", "Solana RPC URL")
    .action(async (wallet: string | undefined, options: { rpc?: string }) => {
      const address = wallet ?? process.env.SOLANA_WALLET;
      if (!address) {
        console.error("Error: Wallet address required. Pass as argument or set SOLANA_WALLET env.");
        process.exit(1);
      }

      try {
        const { getPortfolio } = await import("../../solana/portfolio.js");

        console.log(`\nFetching portfolio for ${address}...`);
        const portfolio = await getPortfolio(address, options.rpc);

        console.log(`\nTotal Portfolio Value: $${portfolio.totalUsdValue.toFixed(2)}`);
        console.log(`Timestamp: ${portfolio.timestamp}\n`);

        console.log(
          "Token".padEnd(10) +
            "Balance".padStart(18) +
            "USD Value".padStart(14) +
            "Allocation".padStart(12),
        );
        console.log("-".repeat(54));

        for (const b of portfolio.balances) {
          const bal = b.balance.toFixed(4);
          const usd = b.usdValue !== null ? `$${b.usdValue.toFixed(2)}` : "N/A";
          const alloc =
            portfolio.totalUsdValue > 0 && b.usdValue
              ? `${((b.usdValue / portfolio.totalUsdValue) * 100).toFixed(1)}%`
              : "-";
          console.log(
            b.token.symbol.padEnd(10) + bal.padStart(18) + usd.padStart(14) + alloc.padStart(12),
          );
        }

        if (portfolio.balances.length === 0) {
          console.log("No token balances found.");
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
