/**
 * Helius webhook management — create, list, delete webhooks.
 * Extends the existing helius.ts with full CRUD operations.
 */

const HELIUS_API_BASE = "https://api.helius.xyz/v0";

export interface HeliusWebhookConfig {
  webhookID: string;
  wallet: string;
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: string;
}

/**
 * List all webhooks for the API key.
 */
export async function listWebhooks(heliusApiKey: string): Promise<HeliusWebhookConfig[]> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${heliusApiKey}`);
  if (!res.ok) {
    throw new Error(`Helius listWebhooks failed: ${res.status}`);
  }
  return (await res.json()) as HeliusWebhookConfig[];
}

/**
 * Get a specific webhook by ID.
 */
export async function getWebhook(
  webhookId: string,
  heliusApiKey: string,
): Promise<HeliusWebhookConfig> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${heliusApiKey}`);
  if (!res.ok) {
    throw new Error(`Helius getWebhook failed: ${res.status}`);
  }
  return (await res.json()) as HeliusWebhookConfig;
}

/**
 * Create a new webhook to monitor account transactions.
 */
export async function createWebhookEnhanced(
  params: {
    accountAddresses: string[];
    webhookURL: string;
    transactionTypes?: string[];
    webhookType?: "enhanced" | "raw" | "discord" | "enhancedDevnet";
  },
  heliusApiKey: string,
): Promise<HeliusWebhookConfig> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${heliusApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookURL: params.webhookURL,
      transactionTypes: params.transactionTypes ?? ["Any"],
      accountAddresses: params.accountAddresses,
      webhookType: params.webhookType ?? "enhanced",
      txnStatus: "all",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helius createWebhook failed (${res.status}): ${body}`);
  }

  return (await res.json()) as HeliusWebhookConfig;
}

/**
 * Update an existing webhook.
 */
export async function updateWebhook(
  webhookId: string,
  params: {
    webhookURL?: string;
    accountAddresses?: string[];
    transactionTypes?: string[];
  },
  heliusApiKey: string,
): Promise<HeliusWebhookConfig> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${heliusApiKey}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helius updateWebhook failed (${res.status}): ${body}`);
  }

  return (await res.json()) as HeliusWebhookConfig;
}

/**
 * Delete a webhook by ID.
 */
export async function deleteWebhook(webhookId: string, heliusApiKey: string): Promise<void> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${heliusApiKey}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Helius deleteWebhook failed (${res.status}): ${body}`);
  }
}
