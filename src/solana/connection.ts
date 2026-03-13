import { Connection, clusterApiUrl, type Cluster, type Commitment } from "@solana/web3.js";

let cachedConnection: Connection | null = null;
let cachedUrl: string | null = null;

/**
 * Get a Solana RPC connection. Resolution order:
 * 1. Explicit `rpcUrl` parameter
 * 2. `SOLANA_RPC_URL` env var
 * 3. `clusterApiUrl(network)` (defaults to "devnet")
 */
export function getSolanaConnection(
  rpcUrl?: string,
  commitment: Commitment = "confirmed",
  network: Cluster = "devnet",
): Connection {
  const url = rpcUrl || process.env.SOLANA_RPC_URL || clusterApiUrl(network);
  if (cachedConnection && cachedUrl === url) {
    return cachedConnection;
  }
  cachedConnection = new Connection(url, { commitment });
  cachedUrl = url;
  return cachedConnection;
}

export async function getSlotAndBlockTime(
  rpcUrl?: string,
): Promise<{ slot: number; blockTime: number | null }> {
  const conn = getSolanaConnection(rpcUrl);
  const slot = await conn.getSlot();
  const blockTime = await conn.getBlockTime(slot);
  return { slot, blockTime };
}

export async function getNetworkHealth(
  rpcUrl?: string,
): Promise<{ healthy: boolean; slot: number; version: string }> {
  const conn = getSolanaConnection(rpcUrl);
  const [slot, version] = await Promise.all([conn.getSlot(), conn.getVersion()]);
  return { healthy: true, slot, version: version["solana-core"] };
}
