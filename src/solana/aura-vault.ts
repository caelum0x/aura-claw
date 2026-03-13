/**
 * TypeScript client for the Aura Vault program.
 * Program ID: AURAvau1tNftGLwnBjSMx1tLHyvPQk3K7FsBudgt3yMh
 *
 * Supports: initialize_vault, deposit, withdraw, agent_trade, update_guardrails.
 * PDA: ["vault", owner].
 */

import { createHash } from "node:crypto";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { type Connection, PublicKey, TransactionInstruction, SystemProgram } from "@solana/web3.js";

export const AURA_VAULT_PROGRAM_ID = new PublicKey("AURAvau1tNftGLwnBjSMx1tLHyvPQk3K7FsBudgt3yMh");

function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

const IX_INITIALIZE_VAULT = anchorDiscriminator("initialize_vault");
const IX_DEPOSIT = anchorDiscriminator("deposit");
const IX_WITHDRAW = anchorDiscriminator("withdraw");
const IX_AGENT_TRADE = anchorDiscriminator("agent_trade");
const IX_UPDATE_GUARDRAILS = anchorDiscriminator("update_guardrails");

function accountDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

const ACCT_VAULT = accountDiscriminator("Vault");

// ── PDA Derivation ────────────────────────────────────────────────────

export function deriveVaultPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    AURA_VAULT_PROGRAM_ID,
  );
}

// ── Account Deserialization ───────────────────────────────────────────

export interface VaultInfo {
  owner: PublicKey;
  agent: PublicKey;
  tokenAccount: PublicKey;
  maxTradeSize: bigint;
  maxSlippageBps: number;
  maxConcentrationBps: number;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  tradeCount: bigint;
  bump: number;
}

function readPubkey(buf: Buffer, offset: number): PublicKey {
  return new PublicKey(buf.subarray(offset, offset + 32));
}

export function deserializeVault(data: Buffer): VaultInfo {
  const disc = data.subarray(0, 8);
  if (!disc.equals(ACCT_VAULT)) {
    throw new Error("Invalid Vault account discriminator");
  }
  let offset = 8;
  const owner = readPubkey(data, offset);
  offset += 32;
  const agent = readPubkey(data, offset);
  offset += 32;
  const tokenAccount = readPubkey(data, offset);
  offset += 32;
  const maxTradeSize = data.readBigUInt64LE(offset);
  offset += 8;
  const maxSlippageBps = data.readUInt16LE(offset);
  offset += 2;
  const maxConcentrationBps = data.readUInt16LE(offset);
  offset += 2;
  const totalDeposited = data.readBigUInt64LE(offset);
  offset += 8;
  const totalWithdrawn = data.readBigUInt64LE(offset);
  offset += 8;
  const tradeCount = data.readBigUInt64LE(offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    owner,
    agent,
    tokenAccount,
    maxTradeSize,
    maxSlippageBps,
    maxConcentrationBps,
    totalDeposited,
    totalWithdrawn,
    tradeCount,
    bump,
  };
}

// ── On-Chain Reads ────────────────────────────────────────────────────

export async function getVaultInfo(
  connection: Connection,
  owner: PublicKey,
): Promise<VaultInfo | null> {
  const [vaultPDA] = deriveVaultPDA(owner);
  const account = await connection.getAccountInfo(vaultPDA);
  if (!account) {
    return null;
  }
  return deserializeVault(account.data);
}

// ── Instruction Builders ──────────────────────────────────────────────

export function buildInitializeVaultIx(
  owner: PublicKey,
  agent: PublicKey,
  vaultTokenAccount: PublicKey,
  params: { maxTradeSize: bigint; maxSlippageBps: number; maxConcentrationBps: number },
): TransactionInstruction {
  const [vaultPDA] = deriveVaultPDA(owner);

  // 8 (discriminator) + 8 (u64) + 2 (u16) + 2 (u16)
  const data = Buffer.alloc(8 + 8 + 2 + 2);
  IX_INITIALIZE_VAULT.copy(data, 0);
  data.writeBigUInt64LE(params.maxTradeSize, 8);
  data.writeUInt16LE(params.maxSlippageBps, 16);
  data.writeUInt16LE(params.maxConcentrationBps, 18);

  return new TransactionInstruction({
    programId: AURA_VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: agent, isSigner: false, isWritable: false },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildDepositIx(
  vaultOwner: PublicKey,
  user: PublicKey,
  userTokenAccount: PublicKey,
  vaultTokenAccount: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const [vaultPDA] = deriveVaultPDA(vaultOwner);

  const data = Buffer.alloc(8 + 8);
  IX_DEPOSIT.copy(data, 0);
  data.writeBigUInt64LE(amount, 8);

  return new TransactionInstruction({
    programId: AURA_VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildWithdrawIx(
  owner: PublicKey,
  userTokenAccount: PublicKey,
  vaultTokenAccount: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const [vaultPDA] = deriveVaultPDA(owner);

  const data = Buffer.alloc(8 + 8);
  IX_WITHDRAW.copy(data, 0);
  data.writeBigUInt64LE(amount, 8);

  return new TransactionInstruction({
    programId: AURA_VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildAgentTradeIx(
  vaultOwner: PublicKey,
  agent: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const [vaultPDA] = deriveVaultPDA(vaultOwner);

  const data = Buffer.alloc(8 + 8);
  IX_AGENT_TRADE.copy(data, 0);
  data.writeBigUInt64LE(amount, 8);

  return new TransactionInstruction({
    programId: AURA_VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: agent, isSigner: true, isWritable: false },
    ],
    data,
  });
}

export function buildUpdateGuardrailsIx(
  owner: PublicKey,
  params: { maxTradeSize: bigint; maxSlippageBps: number; maxConcentrationBps: number },
): TransactionInstruction {
  const [vaultPDA] = deriveVaultPDA(owner);

  const data = Buffer.alloc(8 + 8 + 2 + 2);
  IX_UPDATE_GUARDRAILS.copy(data, 0);
  data.writeBigUInt64LE(params.maxTradeSize, 8);
  data.writeUInt16LE(params.maxSlippageBps, 16);
  data.writeUInt16LE(params.maxConcentrationBps, 18);

  return new TransactionInstruction({
    programId: AURA_VAULT_PROGRAM_ID,
    keys: [
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}
