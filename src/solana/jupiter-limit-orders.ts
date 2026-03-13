/**
 * Jupiter Limit Orders v2 integration.
 * Adapted from solana-agent-kit plugin-token (Apache-2.0).
 */

import { VersionedTransaction } from "@solana/web3.js";

const JUPITER_LIMIT_API = "https://api.jup.ag/limit/v2";

export interface CreateLimitOrderParams {
  inputMint: string;
  outputMint: string;
  /** Amount to sell in smallest unit (lamports). */
  makingAmount: string;
  /** Amount to receive in smallest unit. */
  takingAmount: string;
  /** Expiry timestamp in seconds (optional). */
  expiredAt?: number;
}

export interface LimitOrderResult {
  order: string;
  tx: string;
}

export interface OpenLimitOrder {
  account: Record<string, unknown>;
  publicKey: string;
}

export interface LimitOrderHistoryItem {
  orderKey: string;
  maker: string;
  inputMint: string;
  outputMint: string;
  makingAmount: string;
  takingAmount: string;
  filledMakingAmount: string;
  filledTakingAmount: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a limit order via Jupiter.
 */
export async function createLimitOrder(
  makerWallet: string,
  params: CreateLimitOrderParams,
): Promise<LimitOrderResult> {
  const body: Record<string, unknown> = {
    maker: makerWallet,
    payer: makerWallet,
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    params: {
      makingAmount: params.makingAmount,
      takingAmount: params.takingAmount,
    },
  };
  if (params.expiredAt) {
    (body.params as Record<string, unknown>).expiredAt = params.expiredAt;
  }

  const res = await fetch(`${JUPITER_LIMIT_API}/createOrder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Jupiter createOrder failed (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as LimitOrderResult;
}

/**
 * Get open limit orders for a wallet.
 */
export async function getOpenLimitOrders(wallet: string): Promise<OpenLimitOrder[]> {
  const res = await fetch(`${JUPITER_LIMIT_API}/openOrders?wallet=${wallet}`);
  if (!res.ok) {
    throw new Error(`Jupiter openOrders failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as OpenLimitOrder[];
}

/**
 * Cancel limit orders by order public keys.
 */
export async function cancelLimitOrders(
  maker: string,
  orders: string[],
): Promise<{ txs: string[] }> {
  const res = await fetch(`${JUPITER_LIMIT_API}/cancelOrders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maker, orders }),
  });

  if (!res.ok) {
    throw new Error(`Jupiter cancelOrders failed (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as { txs: string[] };
}

/**
 * Get limit order history for a wallet.
 */
export async function getLimitOrderHistory(
  wallet: string,
  page = 1,
): Promise<{ orders: LimitOrderHistoryItem[]; hasMoreData: boolean }> {
  const res = await fetch(`${JUPITER_LIMIT_API}/orderHistory?wallet=${wallet}&page=${page}`);
  if (!res.ok) {
    throw new Error(`Jupiter orderHistory failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as { orders: LimitOrderHistoryItem[]; hasMoreData: boolean };
}

/**
 * Deserialize a base64-encoded transaction from Jupiter.
 */
export function deserializeLimitOrderTx(base64Tx: string): VersionedTransaction {
  const txBuf = Buffer.from(base64Tx, "base64");
  return VersionedTransaction.deserialize(txBuf);
}
