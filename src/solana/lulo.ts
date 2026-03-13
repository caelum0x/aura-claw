/**
 * Lulo (FlexLend) lending protocol integration.
 * Adapted from solana-agent-kit plugin-defi (Apache-2.0).
 */

import { VersionedTransaction } from "@solana/web3.js";

const LULO_BLINK_API = "https://blink.lulo.fi/actions";

/** Supported lending tokens and their mint addresses. */
export const LULO_SUPPORTED_TOKENS: Record<string, string> = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  SOL: "So11111111111111111111111111111111111111112",
  PYUSD: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
  USDS: "USDSwr9ApdHk5bvJKMjXr7BEitxCM6HJjR6cGfrg4vt",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
};

/**
 * Build a Lulo lending (deposit) transaction.
 * Uses Lulo's blink API for simple USDC lending.
 */
export async function buildLendTransaction(
  walletAddress: string,
  amount: number,
  symbol = "USDC",
): Promise<{ transaction: string; amount: number; symbol: string }> {
  const res = await fetch(`${LULO_BLINK_API}?amount=${amount}&symbol=${symbol}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: walletAddress }),
  });

  if (!res.ok) {
    throw new Error(`Lulo lend failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { transaction: string };
  return {
    transaction: data.transaction,
    amount,
    symbol,
  };
}

/**
 * Build a Lulo withdrawal transaction.
 */
export async function buildWithdrawTransaction(
  walletAddress: string,
  mintAddress: string,
  amount: number,
): Promise<{ transaction: string; mintAddress: string; amount: number }> {
  const res = await fetch(`https://lulo.dial.to/api/actions/withdraw/${mintAddress}/${amount}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: walletAddress }),
  });

  if (!res.ok) {
    throw new Error(`Lulo withdraw failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { transaction: string };
  return {
    transaction: data.transaction,
    mintAddress,
    amount,
  };
}

/**
 * Deserialize a base64-encoded Lulo transaction.
 */
export function deserializeLuloTransaction(base64Tx: string): VersionedTransaction {
  const txBuf = Buffer.from(base64Tx, "base64");
  return VersionedTransaction.deserialize(txBuf);
}

/**
 * Resolve a token symbol to its mint address for Lulo.
 */
export function resolveTokenMint(symbolOrMint: string): string | null {
  const upper = symbolOrMint.toUpperCase();
  if (LULO_SUPPORTED_TOKENS[upper]) {
    return LULO_SUPPORTED_TOKENS[upper];
  }
  // Assume it's already a mint address if it's long enough
  if (symbolOrMint.length > 20) {
    return symbolOrMint;
  }
  return null;
}
