/**
 * Priority fee estimation and transaction sending with retry loop.
 * Adapted from solana-agent-kit send_tx.ts (Apache-2.0).
 */

import {
  ComputeBudgetProgram,
  type Keypair,
  type Signer,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";

export const FEE_TIERS = {
  min: 0.01,
  mid: 0.5,
  max: 0.95,
} as const;

export type FeeTier = keyof typeof FEE_TIERS;

/**
 * Estimate compute units by simulating, then fetch priority fee from Helius or RPC fallback.
 */
export async function getComputeBudgetInstructions(
  connection: Connection,
  payerKey: import("@solana/web3.js").PublicKey,
  instructions: TransactionInstruction[],
  feeTier: FeeTier = "mid",
  heliusApiKey?: string,
): Promise<{
  computeBudgetLimitInstruction: TransactionInstruction;
  computeBudgetPriorityFeeInstruction: TransactionInstruction;
}> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  // Simulate to estimate compute units
  const messageV0 = new TransactionMessage({
    payerKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const simTx = new VersionedTransaction(messageV0);
  const simResult = await connection.simulateTransaction(simTx);
  const estimatedUnits = simResult.value.unitsConsumed;

  // Add safety buffer: max(+100k, +20%)
  const safeUnits = Math.ceil(
    estimatedUnits ? Math.max(estimatedUnits + 100_000, estimatedUnits * 1.2) : 200_000,
  );

  const computeBudgetLimitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
    units: safeUnits,
  });

  let priorityFee: number;

  if (heliusApiKey) {
    // Helius priority fee estimation (more accurate)
    const legacyTx = new Transaction();
    legacyTx.recentBlockhash = blockhash;
    legacyTx.lastValidBlockHeight = lastValidBlockHeight;
    legacyTx.feePayer = payerKey;
    legacyTx.add(computeBudgetLimitInstruction, ...instructions);

    const priorityLevel = feeTier === "min" ? "Min" : feeTier === "mid" ? "Medium" : "High";

    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [
          {
            accountKeys: instructions.flatMap((ix) => ix.keys.map((k) => k.pubkey.toBase58())),
            options: { priorityLevel },
          },
        ],
      }),
    });

    const data = (await res.json()) as {
      result?: { priorityFeeEstimate: number };
      error?: unknown;
    };
    if (data.error || !data.result) {
      // Fall back to RPC method
      priorityFee = await getRpcPriorityFee(connection, feeTier);
    } else {
      priorityFee = data.result.priorityFeeEstimate;
    }
  } else {
    priorityFee = await getRpcPriorityFee(connection, feeTier);
  }

  const computeBudgetPriorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee,
  });

  return { computeBudgetLimitInstruction, computeBudgetPriorityFeeInstruction };
}

async function getRpcPriorityFee(connection: Connection, feeTier: FeeTier): Promise<number> {
  const fees = await connection.getRecentPrioritizationFees();
  if (fees.length === 0) {
    return 1000; // fallback minimum
  }
  const sorted = fees.toSorted((a, b) => a.prioritizationFee - b.prioritizationFee);
  const index = Math.floor(sorted.length * FEE_TIERS[feeTier]);
  return sorted[Math.min(index, sorted.length - 1)].prioritizationFee;
}

/**
 * Build, sign, and send a transaction with priority fees and a 90-second retry loop.
 */
export async function sendTransactionWithPriorityFees(
  connection: Connection,
  keypair: Keypair,
  instructions: TransactionInstruction[],
  opts?: {
    otherSigners?: Keypair[];
    feeTier?: FeeTier;
    heliusApiKey?: string;
    timeoutMs?: number;
  },
): Promise<string> {
  const { computeBudgetLimitInstruction, computeBudgetPriorityFeeInstruction } =
    await getComputeBudgetInstructions(
      connection,
      keypair.publicKey,
      instructions,
      opts?.feeTier ?? "mid",
      opts?.heliusApiKey,
    );

  const allInstructions = [
    computeBudgetLimitInstruction,
    computeBudgetPriorityFeeInstruction,
    ...instructions,
  ];

  const { blockhash } = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: blockhash,
    instructions: allInstructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);
  const signers: Signer[] = [keypair, ...(opts?.otherSigners ?? [])];
  transaction.sign(signers);

  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const iterStart = Date.now();

    const signature = await connection.sendTransaction(transaction, {
      maxRetries: 0,
      skipPreflight: false,
    });

    const statuses = await connection.getSignatureStatuses([signature]);
    if (statuses.value[0]) {
      if (!statuses.value[0].err) {
        return signature;
      }
      throw new Error(`Transaction failed: ${JSON.stringify(statuses.value[0].err)}`);
    }

    // Poll at ~1 second intervals
    const elapsed = Date.now() - iterStart;
    const remaining = Math.max(0, 1000 - elapsed);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  throw new Error("Transaction timeout after 90 seconds");
}
