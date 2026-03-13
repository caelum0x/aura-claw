/**
 * Helius integration for enhanced transaction parsing and asset queries.
 * Adapted from solana-agent-kit (Apache-2.0).
 */

const HELIUS_API_BASE = "https://api.helius.xyz/v0";

export interface HeliusParsedTransaction {
  description: string;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  signature: string;
  slot: number;
  timestamp: number;
  nativeTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    fromTokenAccount: string;
    toTokenAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  accountData: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      userAccount: string;
      tokenAccount: string;
      mint: string;
      rawTokenAmount: { tokenAmount: string; decimals: number };
    }>;
  }>;
}

/**
 * Parse a transaction into human-readable enhanced format using Helius.
 */
export async function parseTransaction(
  transactionId: string,
  heliusApiKey: string,
): Promise<HeliusParsedTransaction[]> {
  const res = await fetch(`${HELIUS_API_BASE}/transactions/?api-key=${heliusApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions: [transactionId] }),
  });

  if (!res.ok) {
    throw new Error(`Helius parseTransaction failed: ${res.status}`);
  }

  return (await res.json()) as HeliusParsedTransaction[];
}

export interface HeliusAsset {
  id: string;
  content: {
    metadata: { name: string; symbol: string };
    files: Array<{ uri: string; mime: string }>;
    links: Record<string, string>;
  };
  ownership: { owner: string };
  token_info?: {
    balance: number;
    supply: number;
    decimals: number;
    price_info?: { price_per_token: number; total_price: number; currency: string };
  };
}

/**
 * Get all assets owned by a wallet using Helius DAS API.
 */
export async function getAssetsByOwner(
  ownerAddress: string,
  heliusApiKey: string,
  opts?: { page?: number; limit?: number },
): Promise<HeliusAsset[]> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "getAssetsByOwner",
      params: {
        ownerAddress,
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 100,
        displayOptions: { showFungible: true, showNativeBalance: true },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Helius getAssetsByOwner failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    result?: { items: HeliusAsset[] };
    error?: unknown;
  };

  if (data.error) {
    throw new Error(`Helius DAS error: ${JSON.stringify(data.error)}`);
  }

  return data.result?.items ?? [];
}

export interface HeliusWebhook {
  webhookID: string;
  wallet: string;
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: string;
}

/**
 * Create a Helius webhook to monitor account transactions.
 */
export async function createWebhook(
  accountAddresses: string[],
  webhookURL: string,
  heliusApiKey: string,
): Promise<HeliusWebhook> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${heliusApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookURL,
      transactionTypes: ["Any"],
      accountAddresses,
      webhookType: "enhanced",
      txnStatus: "all",
    }),
  });

  if (!res.ok) {
    throw new Error(`Helius createWebhook failed: ${res.status}`);
  }

  return (await res.json()) as HeliusWebhook;
}
