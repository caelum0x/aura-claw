/**
 * TypeScript client for the Aura Fees program.
 * Program ID: AURAfee3RcNxM2bVjqFhKpLhyuvMWZgST1pGMuEnNkz7
 *
 * Supports: initialize, collect_fee, distribute_fees, update_fee_config.
 * PDA: ["fee_config", authority].
 */

import { createHash } from "node:crypto";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { type Connection, PublicKey, TransactionInstruction, SystemProgram } from "@solana/web3.js";

export const AURA_FEES_PROGRAM_ID = new PublicKey("AURAfee3RcNxM2bVjqFhKpLhyuvMWZgST1pGMuEnNkz7");

function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

const IX_INITIALIZE = anchorDiscriminator("initialize");
const IX_COLLECT_FEE = anchorDiscriminator("collect_fee");
const IX_DISTRIBUTE_FEES = anchorDiscriminator("distribute_fees");
const IX_UPDATE_FEE_CONFIG = anchorDiscriminator("update_fee_config");

function accountDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

const ACCT_FEE_CONFIG = accountDiscriminator("FeeConfig");

// ── PDA Derivation ────────────────────────────────────────────────────

export function deriveFeeConfigPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_config"), authority.toBuffer()],
    AURA_FEES_PROGRAM_ID,
  );
}

// ── Account Deserialization ───────────────────────────────────────────

export interface FeeConfigInfo {
  authority: PublicKey;
  feeBps: number;
  treasuryShareBps: number;
  stakerShareBps: number;
  totalFeesCollected: bigint;
  totalDistributedTreasury: bigint;
  totalDistributedStakers: bigint;
  bump: number;
}

export function deserializeFeeConfig(data: Buffer): FeeConfigInfo {
  const disc = data.subarray(0, 8);
  if (!disc.equals(ACCT_FEE_CONFIG)) {
    throw new Error("Invalid FeeConfig account discriminator");
  }
  let offset = 8;
  const authority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const feeBps = data.readUInt16LE(offset);
  offset += 2;
  const treasuryShareBps = data.readUInt16LE(offset);
  offset += 2;
  const stakerShareBps = data.readUInt16LE(offset);
  offset += 2;
  const totalFeesCollected = data.readBigUInt64LE(offset);
  offset += 8;
  const totalDistributedTreasury = data.readBigUInt64LE(offset);
  offset += 8;
  const totalDistributedStakers = data.readBigUInt64LE(offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    authority,
    feeBps,
    treasuryShareBps,
    stakerShareBps,
    totalFeesCollected,
    totalDistributedTreasury,
    totalDistributedStakers,
    bump,
  };
}

// ── On-Chain Reads ────────────────────────────────────────────────────

export async function getFeeConfigInfo(
  connection: Connection,
  authority: PublicKey,
): Promise<FeeConfigInfo | null> {
  const [configPDA] = deriveFeeConfigPDA(authority);
  const account = await connection.getAccountInfo(configPDA);
  if (!account) {
    return null;
  }
  return deserializeFeeConfig(account.data);
}

/**
 * Calculate the fee amount for a given swap in lamports/smallest-unit.
 */
export function calculateFee(swapAmount: bigint, feeBps: number): bigint {
  return (swapAmount * BigInt(feeBps)) / 10_000n;
}

/**
 * Calculate treasury and staker shares from a fee pool balance.
 */
export function calculateDistribution(
  balance: bigint,
  treasuryShareBps: number,
  stakerShareBps: number,
): { treasuryAmount: bigint; stakerAmount: bigint } {
  void stakerShareBps; // remainder goes to stakers
  const treasuryAmount = (balance * BigInt(treasuryShareBps)) / 10_000n;
  const stakerAmount = balance - treasuryAmount;
  return { treasuryAmount, stakerAmount };
}

// ── Instruction Builders ──────────────────────────────────────────────

export function buildInitializeFeeConfigIx(
  authority: PublicKey,
  params: { feeBps: number; treasuryShareBps: number; stakerShareBps: number },
): TransactionInstruction {
  const [configPDA] = deriveFeeConfigPDA(authority);

  // 8 (discriminator) + 2 + 2 + 2 = 14
  const data = Buffer.alloc(14);
  IX_INITIALIZE.copy(data, 0);
  data.writeUInt16LE(params.feeBps, 8);
  data.writeUInt16LE(params.treasuryShareBps, 10);
  data.writeUInt16LE(params.stakerShareBps, 12);

  return new TransactionInstruction({
    programId: AURA_FEES_PROGRAM_ID,
    keys: [
      { pubkey: configPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildCollectFeeIx(
  authority: PublicKey,
  user: PublicKey,
  userTokenAccount: PublicKey,
  feeTokenAccount: PublicKey,
  swapAmount: bigint,
): TransactionInstruction {
  const [configPDA] = deriveFeeConfigPDA(authority);

  const data = Buffer.alloc(8 + 8);
  IX_COLLECT_FEE.copy(data, 0);
  data.writeBigUInt64LE(swapAmount, 8);

  return new TransactionInstruction({
    programId: AURA_FEES_PROGRAM_ID,
    keys: [
      { pubkey: configPDA, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildDistributeFeesIx(
  authority: PublicKey,
  feeTokenAccount: PublicKey,
  treasuryTokenAccount: PublicKey,
  stakerPoolTokenAccount: PublicKey,
): TransactionInstruction {
  const [configPDA] = deriveFeeConfigPDA(authority);

  const data = Buffer.from(IX_DISTRIBUTE_FEES);

  return new TransactionInstruction({
    programId: AURA_FEES_PROGRAM_ID,
    keys: [
      { pubkey: configPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: feeTokenAccount, isSigner: false, isWritable: true },
      { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
      { pubkey: stakerPoolTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildUpdateFeeConfigIx(
  authority: PublicKey,
  params: { feeBps: number; treasuryShareBps: number; stakerShareBps: number },
): TransactionInstruction {
  const [configPDA] = deriveFeeConfigPDA(authority);

  const data = Buffer.alloc(14);
  IX_UPDATE_FEE_CONFIG.copy(data, 0);
  data.writeUInt16LE(params.feeBps, 8);
  data.writeUInt16LE(params.treasuryShareBps, 10);
  data.writeUInt16LE(params.stakerShareBps, 12);

  return new TransactionInstruction({
    programId: AURA_FEES_PROGRAM_ID,
    keys: [
      { pubkey: configPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  });
}
