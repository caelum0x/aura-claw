/**
 * Pump.fun token launch and trading integration.
 * Uses Pump.fun's bundle API for real on-chain token creation.
 */

import { Keypair } from "@solana/web3.js";

const PUMPFUN_API = "https://frontend-api-v3.pump.fun";
const PUMPFUN_BUNDLE_API = "https://pumpportal.fun/api";

export interface PumpfunTokenMetadata {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface PumpfunCoinData {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image_uri: string;
  metadata_uri: string;
  twitter: string;
  telegram: string;
  bonding_curve: string;
  associated_bonding_curve: string;
  creator: string;
  created_timestamp: number;
  raydium_pool: string | null;
  complete: boolean;
  virtual_sol_reserves: number;
  virtual_token_reserves: number;
  total_supply: number;
  website: string;
  show_name: boolean;
  king_of_the_hill_timestamp: number | null;
  market_cap: number;
  reply_count: number;
  last_reply: number;
  nsfw: boolean;
  market_id: string | null;
  inverted: boolean | null;
  usd_market_cap: number;
}

/**
 * Get Pump.fun token data by mint address.
 */
export async function getPumpfunTokenData(mint: string): Promise<PumpfunCoinData | null> {
  const res = await fetch(`${PUMPFUN_API}/coins/${mint}`);
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as PumpfunCoinData;
}

/**
 * Estimate the buy cost for a pump.fun token in SOL.
 * Uses the bonding curve reserves.
 */
export function estimatePumpfunBuyPrice(
  coin: PumpfunCoinData,
  tokenAmount: number,
): { solCost: number; pricePerToken: number } {
  const virtualSol = coin.virtual_sol_reserves / 1e9;
  const virtualTokens = coin.virtual_token_reserves / 1e6;

  if (virtualTokens <= 0 || virtualSol <= 0) {
    return { solCost: 0, pricePerToken: 0 };
  }

  // Constant product formula: (x + dx)(y - dy) = xy
  const k = virtualSol * virtualTokens;
  const newTokenReserves = virtualTokens - tokenAmount;
  if (newTokenReserves <= 0) {
    return { solCost: Infinity, pricePerToken: Infinity };
  }
  const newSolReserves = k / newTokenReserves;
  const solCost = newSolReserves - virtualSol;
  const pricePerToken = solCost / tokenAmount;

  return { solCost, pricePerToken };
}

/**
 * Upload token metadata to Pump.fun's IPFS endpoint.
 * Returns the metadata URI needed for on-chain launch.
 */
export async function uploadTokenMetadata(metadata: PumpfunTokenMetadata): Promise<string> {
  // Pump.fun provides an IPFS upload endpoint
  const formData = new FormData();
  formData.append("name", metadata.name);
  formData.append("symbol", metadata.symbol);
  formData.append("description", metadata.description);
  formData.append("showName", "true");

  if (metadata.twitter) {
    formData.append("twitter", metadata.twitter);
  }
  if (metadata.telegram) {
    formData.append("telegram", metadata.telegram);
  }
  if (metadata.website) {
    formData.append("website", metadata.website);
  }

  // Fetch image and add as blob
  const imageRes = await fetch(metadata.imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch image: ${imageRes.status}`);
  }
  const imageBlob = await imageRes.blob();
  formData.append("file", imageBlob, "token-image.png");

  const res = await fetch(`${PUMPFUN_BUNDLE_API}/ipfs`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`IPFS upload failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { metadataUri: string };
  return data.metadataUri;
}

/**
 * Launch a new token on Pump.fun with real on-chain execution.
 * Uses Pump.fun's transaction bundle API:
 * 1. Upload metadata to IPFS
 * 2. Request a create+buy bundle transaction
 * 3. Sign and send
 */
export async function launchToken(
  creatorKeypair: import("@solana/web3.js").Keypair,
  metadata: PumpfunTokenMetadata,
  opts?: {
    initialBuySol?: number;
    slippageBps?: number;
    rpcUrl?: string;
    network?: "devnet" | "testnet" | "mainnet-beta";
  },
): Promise<{
  signature: string;
  mint: string;
  metadataUri: string;
}> {
  // 1. Upload metadata to IPFS
  const metadataUri = await uploadTokenMetadata(metadata);

  // 2. Generate mint keypair
  const mintKeypair = Keypair.generate();

  // 3. Request bundle transaction from Pump.fun
  const bundleRes = await fetch(`${PUMPFUN_BUNDLE_API}/trade-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: creatorKeypair.publicKey.toBase58(),
      action: "create",
      tokenMetadata: {
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadataUri,
      },
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: "true",
      amount: opts?.initialBuySol ?? 0.0001,
      slippage: (opts?.slippageBps ?? 500) / 100,
      priorityFee: 0.0005,
      pool: "pump",
    }),
  });

  if (!bundleRes.ok) {
    const body = await bundleRes.text();
    throw new Error(`Pump.fun bundle request failed (${bundleRes.status}): ${body}`);
  }

  // 4. Deserialize, sign, and send the transaction
  const txData = await bundleRes.arrayBuffer();
  const { VersionedTransaction: VTx } = await import("@solana/web3.js");
  const tx = VTx.deserialize(new Uint8Array(txData));
  tx.sign([mintKeypair, creatorKeypair]);

  const { getSolanaConnection } = await import("./connection.js");
  const connection = getSolanaConnection(opts?.rpcUrl, "confirmed", opts?.network);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  // Confirm the transaction
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");

  return {
    signature,
    mint: mintKeypair.publicKey.toBase58(),
    metadataUri,
  };
}

/**
 * Buy a Pump.fun token via their trade API (for tokens still on the bonding curve).
 */
export async function buyPumpfunToken(
  buyerKeypair: import("@solana/web3.js").Keypair,
  mint: string,
  solAmount: number,
  opts?: {
    slippageBps?: number;
    rpcUrl?: string;
    network?: "devnet" | "testnet" | "mainnet-beta";
  },
): Promise<{ signature: string }> {
  const res = await fetch(`${PUMPFUN_BUNDLE_API}/trade-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: buyerKeypair.publicKey.toBase58(),
      action: "buy",
      mint,
      denominatedInSol: "true",
      amount: solAmount,
      slippage: (opts?.slippageBps ?? 500) / 100,
      priorityFee: 0.0005,
      pool: "pump",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pump.fun buy failed (${res.status}): ${body}`);
  }

  const txData = await res.arrayBuffer();
  const { VersionedTransaction: VTx } = await import("@solana/web3.js");
  const tx = VTx.deserialize(new Uint8Array(txData));
  tx.sign([buyerKeypair]);

  const { getSolanaConnection } = await import("./connection.js");
  const connection = getSolanaConnection(opts?.rpcUrl, "confirmed", opts?.network);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");

  return { signature };
}

/**
 * Sell a Pump.fun token via their trade API.
 */
export async function sellPumpfunToken(
  sellerKeypair: import("@solana/web3.js").Keypair,
  mint: string,
  tokenAmount: number,
  opts?: {
    slippageBps?: number;
    rpcUrl?: string;
    network?: "devnet" | "testnet" | "mainnet-beta";
  },
): Promise<{ signature: string }> {
  const res = await fetch(`${PUMPFUN_BUNDLE_API}/trade-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: sellerKeypair.publicKey.toBase58(),
      action: "sell",
      mint,
      denominatedInSol: "false",
      amount: tokenAmount,
      slippage: (opts?.slippageBps ?? 500) / 100,
      priorityFee: 0.0005,
      pool: "pump",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pump.fun sell failed (${res.status}): ${body}`);
  }

  const txData = await res.arrayBuffer();
  const { VersionedTransaction: VTx } = await import("@solana/web3.js");
  const tx = VTx.deserialize(new Uint8Array(txData));
  tx.sign([sellerKeypair]);

  const { getSolanaConnection } = await import("./connection.js");
  const connection = getSolanaConnection(opts?.rpcUrl, "confirmed", opts?.network);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");

  return { signature };
}
