/**
 * SPL token utilities for enhanced token operations.
 * Wraps @solana/spl-token with helpers for common operations.
 * Patterns from solana-program-library and solana-agent-kit.
 */

import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  type Connection,
  type Keypair,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";

/**
 * Get or create an associated token account for a wallet + mint pair.
 * Returns the ATA address and any instructions needed to create it.
 */
export async function getOrCreateATA(
  connection: Connection,
  payer: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
): Promise<{ address: PublicKey; instructions: TransactionInstruction[] }> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const instructions: TransactionInstruction[] = [];

  try {
    await getAccount(connection, ata);
  } catch {
    // Account doesn't exist, create it
    instructions.push(createAssociatedTokenAccountInstruction(payer, ata, owner, mint));
  }

  return { address: ata, instructions };
}

/**
 * Build transfer instructions for an SPL token.
 * Handles ATA creation for the recipient if needed.
 */
export async function buildSplTransferInstructions(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  recipient: PublicKey,
  amount: bigint,
): Promise<{
  instructions: TransactionInstruction[];
  sourceAta: PublicKey;
  destinationAta: PublicKey;
}> {
  const instructions: TransactionInstruction[] = [];

  // Source ATA (must exist)
  const sourceAta = await getAssociatedTokenAddress(mint, payer.publicKey);

  // Destination ATA (create if needed)
  const { address: destinationAta, instructions: createAtaIxs } = await getOrCreateATA(
    connection,
    payer.publicKey,
    mint,
    recipient,
  );
  instructions.push(...createAtaIxs);

  // Transfer
  instructions.push(createTransferInstruction(sourceAta, destinationAta, payer.publicKey, amount));

  return { instructions, sourceAta, destinationAta };
}

/**
 * Get the token balance for a wallet + mint pair.
 */
export async function getSplTokenBalance(
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey,
): Promise<{ balance: bigint; decimals: number; uiAmount: number }> {
  const ata = await getAssociatedTokenAddress(mint, wallet);

  try {
    const account = await getAccount(connection, ata);
    const mintInfo = await connection.getParsedAccountInfo(mint);
    const decimals =
      (mintInfo.value?.data as { parsed?: { info?: { decimals?: number } } })?.parsed?.info
        ?.decimals ?? 9;

    return {
      balance: account.amount,
      decimals,
      uiAmount: Number(account.amount) / 10 ** decimals,
    };
  } catch {
    return { balance: BigInt(0), decimals: 0, uiAmount: 0 };
  }
}

/**
 * Get all SPL token accounts for a wallet.
 */
export async function getAllTokenAccounts(
  connection: Connection,
  wallet: PublicKey,
): Promise<
  Array<{
    mint: string;
    balance: number;
    decimals: number;
    tokenAccount: string;
  }>
> {
  const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
    programId: TOKEN_PROGRAM_ID,
  });

  return accounts.value.map((account) => {
    const parsed = account.account.data.parsed.info;
    return {
      mint: parsed.mint as string,
      balance: parsed.tokenAmount.uiAmount as number,
      decimals: parsed.tokenAmount.decimals as number,
      tokenAccount: account.pubkey.toBase58(),
    };
  });
}

/**
 * Close empty token accounts to reclaim SOL rent.
 */
export function buildCloseEmptyAccountInstructions(
  accounts: Array<{ mint: string; balance: number; tokenAccount: string }>,
  owner: PublicKey,
): TransactionInstruction[] {
  const instructions: TransactionInstruction[] = [];

  for (const account of accounts) {
    if (account.balance === 0) {
      instructions.push(
        createCloseAccountInstruction(new PublicKey(account.tokenAccount), owner, owner),
      );
    }
  }

  return instructions;
}
