import type { Command } from "commander";

export function registerDefiSignalsCommand(program: Command) {
  program
    .command("defi:signals")
    .description("Get AI-powered DeFi market signals")
    .option("--api-key <key>", "OpenRouter API key")
    .action(async (options: { apiKey?: string }) => {
      try {
        const ids = "solana,usd-coin,tether,bonk,jupiter-exchange-solana";
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;

        console.log("\nFetching market data...");
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`CoinGecko API error: ${res.status}`);
        }

        const data = (await res.json()) as Record<string, Record<string, number>>;
        const tokenNames: Record<string, string> = {
          solana: "SOL",
          "usd-coin": "USDC",
          tether: "USDT",
          bonk: "BONK",
          "jupiter-exchange-solana": "JUP",
        };

        console.log("\nMarket Overview:");
        console.log(
          "Token".padEnd(8) +
            "Price".padStart(14) +
            "24h Change".padStart(14) +
            "24h Volume".padStart(16),
        );
        console.log("-".repeat(52));

        for (const [id, vals] of Object.entries(data)) {
          const symbol = tokenNames[id] ?? id;
          const price = `$${vals.usd?.toFixed(vals.usd < 0.01 ? 8 : 2) ?? "N/A"}`;
          const change = vals.usd_24h_change
            ? `${vals.usd_24h_change >= 0 ? "+" : ""}${vals.usd_24h_change.toFixed(2)}%`
            : "N/A";
          const vol = vals.usd_24h_vol ? `$${(vals.usd_24h_vol / 1e6).toFixed(1)}M` : "N/A";
          console.log(
            symbol.padEnd(8) + price.padStart(14) + change.padStart(14) + vol.padStart(16),
          );
        }

        // AI analysis
        const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
        if (apiKey) {
          console.log("\nGenerating AI analysis...");
          const marketSummary = Object.entries(data)
            .map(
              ([id, vals]) =>
                `${tokenNames[id] ?? id}: $${vals.usd} (${vals.usd_24h_change?.toFixed(2)}%)`,
            )
            .join(", ");

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
                    "You are a DeFi analyst. Provide 3-4 concise trading signals based on the data. Include sentiment and confidence.",
                },
                { role: "user", content: `Current Solana ecosystem prices: ${marketSummary}` },
              ],
              max_tokens: 400,
            }),
          });

          if (aiRes.ok) {
            const aiData = (await aiRes.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const analysis = aiData.choices?.[0]?.message?.content;
            if (analysis) {
              console.log("\nAI Market Signals:");
              console.log(analysis);
            }
          }
        } else {
          console.log("\nSet OPENROUTER_API_KEY or --api-key for AI-powered analysis.");
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}
