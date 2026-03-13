/**
 * Jupiter SOL staking (jupSOL liquid staking).
 * Adapted from solana-agent-kit plugin-token (Apache-2.0).
 */

import { VersionedTransaction } from "@solana/web3.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUPSOL_MINT = "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v";

/**
 * Build a Jupiter staking transaction (SOL → jupSOL).
 * Uses Jupiter's blinks endpoint to get a pre-built transaction.
 */
export async function buildStakeTransaction(
  walletAddress: string,
  amountSol: number,
): Promise<{ transaction: string; jupsolMint: string }> {
  const amountLamports = Math.round(amountSol * 1e9);
  const url = `https://worker.jup.ag/blinks/swap/${SOL_MINT}/${JUPSOL_MINT}/${amountLamports}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: walletAddress }),
  });

  if (!res.ok) {
    throw new Error(`Jupiter stake failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { transaction: string };
  return {
    transaction: data.transaction,
    jupsolMint: JUPSOL_MINT,
  };
}

/**
 * Deserialize a base64-encoded staking transaction.
 */
export function deserializeStakeTransaction(base64Tx: string): VersionedTransaction {
  const txBuf = Buffer.from(base64Tx, "base64");
  return VersionedTransaction.deserialize(txBuf);
}

/**
 * Get current jupSOL exchange rate (SOL per jupSOL).
 * Uses Jupiter quote API for price discovery.
 */
export async function getJupsolRate(): Promise<{
  solPerJupsol: number;
  jupsolMint: string;
  apy: string;
}> {
  // Get a quote for 1 jupSOL → SOL to determine the rate
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${JUPSOL_MINT}&outputMint=${SOL_MINT}&amount=1000000000&slippageBps=10`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Jupiter quote failed (${res.status})`);
  }

  const data = (await res.json()) as { outAmount: string };
  const solPerJupsol = Number(data.outAmount) / 1e9;

  return {
    solPerJupsol,
    jupsolMint: JUPSOL_MINT,
    apy: "~7-8% (variable)", // Jupiter's published rate
  };
}
