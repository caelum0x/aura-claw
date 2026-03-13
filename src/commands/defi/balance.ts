import type { Command } from "commander";

export function registerDefiBalanceCommand(program: Command) {
  program
    .command("defi:balance")
    .description("Show wallet SOL + SPL token balances")
    .argument("[wallet]", "Wallet public key (or set SOLANA_WALLET env)")
    .option("--rpc <url>", "Solana RPC URL")
    .action(async (wallet: string | undefined, options: { rpc?: string }) => {
      const address = wallet ?? process.env.SOLANA_WALLET;
      if (!address) {
        console.error("Error: Wallet address required. Pass as argument or set SOLANA_WALLET env.");
        process.exit(1);
      }

      try {
        const { getWalletBalances } = await import("../../solana/portfolio.js");
        const balances = await getWalletBalances(address, options.rpc);

        console.log(`\nWallet: ${address}\n`);
        console.log("Token".padEnd(10) + "Balance".padStart(18) + "USD Value".padStart(14));
        console.log("-".repeat(42));

        for (const b of balances) {
          const bal = b.balance.toFixed(b.token.decimals > 6 ? 4 : 2);
          const usd = b.usdValue !== null ? `$${b.usdValue.toFixed(2)}` : "N/A";
          console.log(b.token.symbol.padEnd(10) + bal.padStart(18) + usd.padStart(14));
        }

        if (balances.length === 0) {
          console.log("No token balances found.");
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
