import { readFileSync } from "node:fs";
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
  type TransactionSignature,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getSolanaConnection } from "./connection.js";
import { getTokenBySymbol } from "./tokens.js";

/**
 * Load a Keypair from a file path, base58 private key string, or JSON byte array env var.
 * Resolution order: explicit key string > file path > SOLANA_PRIVATE_KEY env.
 */
export async function loadKeypair(opts?: {
  privateKey?: string;
  walletPath?: string;
}): Promise<Keypair> {
  // 1. Inline base58 / byte-array key
  const keyStr = opts?.privateKey ?? process.env.SOLANA_PRIVATE_KEY;
  if (keyStr) {
    // If it looks like a JSON array, parse as byte array
    const trimmed = keyStr.trim();
    if (trimmed.startsWith("[")) {
      const bytes = JSON.parse(trimmed) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(bytes));
    }
    // Otherwise treat as base58-encoded secret key
    return Keypair.fromSecretKey(decodeBase58(trimmed));
  }

  // 2. Keypair JSON file
  const walletPath = opts?.walletPath ?? process.env.SOLANA_WALLET_PATH;
  if (walletPath) {
    const raw = readFileSync(walletPath, "utf-8");
    const bytes = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }

  throw new Error(
    "No wallet keypair available. Set solana.privateKey in config, SOLANA_PRIVATE_KEY env, " +
      "or solana.walletPath / SOLANA_WALLET_PATH to a keypair JSON file.",
  );
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decode a base58 string to Uint8Array (no external dep needed). */
function decodeBase58(input: string): Uint8Array {
  const bytes: number[] = [0];
  for (const char of input) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid base58 character: ${char}`);
    }
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Handle leading '1's (base58 zero bytes)
  for (const char of input) {
    if (char !== "1") {
      break;
    }
    bytes.push(0);
  }
  return Uint8Array.from(bytes.toReversed());
}

/** Sign and send a VersionedTransaction, optionally confirming. */
export async function signAndSendTransaction(
  tx: VersionedTransaction,
  keypair: Keypair,
  opts?: { rpcUrl?: string; network?: "devnet" | "testnet" | "mainnet-beta"; confirm?: boolean },
): Promise<{ signature: TransactionSignature; confirmed: boolean }> {
  const conn = getSolanaConnection(opts?.rpcUrl, "confirmed", opts?.network ?? "devnet");

  tx.sign([keypair]);
  const rawTx = tx.serialize();
  const signature = await conn.sendRawTransaction(rawTx, { skipPreflight: false });

  let confirmed = false;
  if (opts?.confirm) {
    const latestBlockhash = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
    confirmed = true;
  }

  return { signature, confirmed };
}

/** Build and sign a SOL or SPL token transfer. */
export async function buildAndSignTransfer(params: {
  from: Keypair;
  to: string;
  amount: number;
  tokenSymbol?: string;
  rpcUrl?: string;
  network?: "devnet" | "testnet" | "mainnet-beta";
  confirm?: boolean;
}): Promise<{ signature: TransactionSignature; confirmed: boolean }> {
  const conn = getSolanaConnection(params.rpcUrl, "confirmed", params.network ?? "devnet");
  const toPubkey = new PublicKey(params.to);
  const symbol = params.tokenSymbol?.toUpperCase() ?? "SOL";

  if (symbol === "SOL") {
    return sendSolTransfer(conn, params.from, toPubkey, params.amount, params.confirm);
  }

  return sendSplTransfer(conn, params.from, toPubkey, params.amount, symbol, params.confirm);
}

async function sendSolTransfer(
  conn: Connection,
  from: Keypair,
  to: PublicKey,
  solAmount: number,
  confirm?: boolean,
): Promise<{ signature: TransactionSignature; confirmed: boolean }> {
  const lamports = Math.round(solAmount * 1e9);
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }),
  );

  const signature = await sendAndConfirmTransaction(conn, tx, [from], {
    commitment: confirm ? "confirmed" : "processed",
  });
  return { signature, confirmed: confirm ?? false };
}

async function sendSplTransfer(
  conn: Connection,
  from: Keypair,
  to: PublicKey,
  amount: number,
  tokenSymbol: string,
  confirm?: boolean,
): Promise<{ signature: TransactionSignature; confirmed: boolean }> {
  const token = getTokenBySymbol(tokenSymbol);
  if (!token) {
    throw new Error(`Unknown token: ${tokenSymbol}`);
  }

  const mint = token.mint;
  const fromAta = getAssociatedTokenAddressSync(mint, from.publicKey);
  const toAta = getAssociatedTokenAddressSync(mint, to);

  const tx = new Transaction();

  // Create the destination ATA if it doesn't exist
  try {
    await getAccount(conn, toAta);
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError) {
      tx.add(createAssociatedTokenAccountInstruction(from.publicKey, toAta, to, mint));
    } else {
      throw err;
    }
  }

  const rawAmount = BigInt(Math.round(amount * 10 ** token.decimals));
  tx.add(createTransferInstruction(fromAta, toAta, from.publicKey, rawAmount));

  const signature = await sendAndConfirmTransaction(conn, tx, [from], {
    commitment: confirm ? "confirmed" : "processed",
  });
  return { signature, confirmed: confirm ?? false };
}
