/**
 * TypeScript client for the Aura Staking program.
 * Program ID: AURAstk2xWBqHK4zTReCKrN6HJPAkwpJ8aXfpKqRtZ9e
 *
 * Supports: initialize_pool, stake, unstake, claim_rewards.
 * PDAs: ["staking_pool", mint], ["stake", pool, user].
 */

import { createHash } from "node:crypto";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { type Connection, PublicKey, TransactionInstruction, SystemProgram } from "@solana/web3.js";

export const AURA_STAKING_PROGRAM_ID = new PublicKey(
  "AURAstk2xWBqHK4zTReCKrN6HJPAkwpJ8aXfpKqRtZ9e",
);

// Anchor instruction discriminators (sha256("global:<name>")[0..8])
function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

const IX_INITIALIZE_POOL = anchorDiscriminator("initialize_pool");
const IX_STAKE = anchorDiscriminator("stake");
const IX_UNSTAKE = anchorDiscriminator("unstake");
const IX_CLAIM_REWARDS = anchorDiscriminator("claim_rewards");

// Account discriminator for deserialization
function accountDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

const ACCT_STAKING_POOL = accountDiscriminator("StakingPool");
const ACCT_STAKE_ACCOUNT = accountDiscriminator("StakeAccount");

// ── PDA Derivation ────────────────────────────────────────────────────

export function deriveStakingPoolPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("staking_pool"), mint.toBuffer()],
    AURA_STAKING_PROGRAM_ID,
  );
}

export function deriveStakeAccountPDA(pool: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), pool.toBuffer(), user.toBuffer()],
    AURA_STAKING_PROGRAM_ID,
  );
}

// ── Account Deserialization ───────────────────────────────────────────

export interface StakingPoolInfo {
  authority: PublicKey;
  stakingMint: PublicKey;
  rewardRatePerSlot: bigint;
  totalStaked: bigint;
  lastRewardSlot: bigint;
  accumulatedRewardPerShare: bigint;
  bump: number;
}

export interface StakeAccountInfo {
  owner: PublicKey;
  amount: bigint;
  rewardDebt: bigint;
  stakeTimestamp: bigint;
}

function readPubkey(buf: Buffer, offset: number): PublicKey {
  return new PublicKey(buf.subarray(offset, offset + 32));
}

function readU64(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

function readI64(buf: Buffer, offset: number): bigint {
  return buf.readBigInt64LE(offset);
}

export function deserializeStakingPool(data: Buffer): StakingPoolInfo {
  // Skip 8-byte discriminator
  const disc = data.subarray(0, 8);
  if (!disc.equals(ACCT_STAKING_POOL)) {
    throw new Error("Invalid StakingPool account discriminator");
  }
  let offset = 8;
  const authority = readPubkey(data, offset);
  offset += 32;
  const stakingMint = readPubkey(data, offset);
  offset += 32;
  const rewardRatePerSlot = readU64(data, offset);
  offset += 8;
  const totalStaked = readU64(data, offset);
  offset += 8;
  const lastRewardSlot = readU64(data, offset);
  offset += 8;
  const accumulatedRewardPerShare = readU64(data, offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    authority,
    stakingMint,
    rewardRatePerSlot,
    totalStaked,
    lastRewardSlot,
    accumulatedRewardPerShare,
    bump,
  };
}

export function deserializeStakeAccount(data: Buffer): StakeAccountInfo {
  const disc = data.subarray(0, 8);
  if (!disc.equals(ACCT_STAKE_ACCOUNT)) {
    throw new Error("Invalid StakeAccount discriminator");
  }
  let offset = 8;
  const owner = readPubkey(data, offset);
  offset += 32;
  const amount = readU64(data, offset);
  offset += 8;
  const rewardDebt = readU64(data, offset);
  offset += 8;
  const stakeTimestamp = readI64(data, offset);

  return { owner, amount, rewardDebt, stakeTimestamp };
}

// ── On-Chain Reads ────────────────────────────────────────────────────

export async function getStakingPoolInfo(
  connection: Connection,
  mint: PublicKey,
): Promise<StakingPoolInfo | null> {
  const [poolPDA] = deriveStakingPoolPDA(mint);
  const account = await connection.getAccountInfo(poolPDA);
  if (!account) {
    return null;
  }
  return deserializeStakingPool(account.data);
}

export async function getUserStakeInfo(
  connection: Connection,
  pool: PublicKey,
  user: PublicKey,
): Promise<StakeAccountInfo | null> {
  const [stakePDA] = deriveStakeAccountPDA(pool, user);
  const account = await connection.getAccountInfo(stakePDA);
  if (!account) {
    return null;
  }
  return deserializeStakeAccount(account.data);
}

/**
 * Compute pending rewards for a user (off-chain estimate).
 * Mirrors the on-chain update_rewards + pending calculation.
 */
export function computePendingRewards(
  pool: StakingPoolInfo,
  stake: StakeAccountInfo,
  currentSlot: bigint,
): bigint {
  if (pool.totalStaked === 0n || stake.amount === 0n) {
    return 0n;
  }

  const slotsElapsed = currentSlot - pool.lastRewardSlot;
  const reward = slotsElapsed * pool.rewardRatePerSlot;
  const rewardPerShare =
    (reward * 1_000_000_000_000n) / pool.totalStaked + pool.accumulatedRewardPerShare;

  const pending = (stake.amount * rewardPerShare) / 1_000_000_000_000n;
  const net = pending - stake.rewardDebt;
  return net > 0n ? net : 0n;
}

// ── Instruction Builders ──────────────────────────────────────────────

function writeU64(buf: Buffer, value: bigint, offset: number): void {
  buf.writeBigUInt64LE(value, offset);
}

export function buildInitializePoolIx(
  authority: PublicKey,
  stakingMint: PublicKey,
  rewardRatePerSlot: bigint,
): TransactionInstruction {
  const [poolPDA] = deriveStakingPoolPDA(stakingMint);
  const data = Buffer.alloc(8 + 8);
  IX_INITIALIZE_POOL.copy(data, 0);
  writeU64(data, rewardRatePerSlot, 8);

  return new TransactionInstruction({
    programId: AURA_STAKING_PROGRAM_ID,
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: stakingMint, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildStakeAuraIx(
  user: PublicKey,
  stakingMint: PublicKey,
  amount: bigint,
  poolTokenAccount: PublicKey,
): Promise<TransactionInstruction> {
  const [poolPDA] = deriveStakingPoolPDA(stakingMint);
  const [stakeAccountPDA] = deriveStakeAccountPDA(poolPDA, user);
  const userTokenAccount = await getAssociatedTokenAddress(stakingMint, user);

  const data = Buffer.alloc(8 + 8);
  IX_STAKE.copy(data, 0);
  writeU64(data, amount, 8);

  return new TransactionInstruction({
    programId: AURA_STAKING_PROGRAM_ID,
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: stakeAccountPDA, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildUnstakeAuraIx(
  user: PublicKey,
  stakingMint: PublicKey,
  amount: bigint,
  poolTokenAccount: PublicKey,
): Promise<TransactionInstruction> {
  const [poolPDA] = deriveStakingPoolPDA(stakingMint);
  const [stakeAccountPDA] = deriveStakeAccountPDA(poolPDA, user);
  const userTokenAccount = await getAssociatedTokenAddress(stakingMint, user);

  const data = Buffer.alloc(8 + 8);
  IX_UNSTAKE.copy(data, 0);
  writeU64(data, amount, 8);

  return new TransactionInstruction({
    programId: AURA_STAKING_PROGRAM_ID,
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: stakeAccountPDA, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function buildClaimRewardsIx(
  user: PublicKey,
  stakingMint: PublicKey,
  poolTokenAccount: PublicKey,
  rewardTokenAccount: PublicKey,
): Promise<TransactionInstruction> {
  const [poolPDA] = deriveStakingPoolPDA(stakingMint);
  const [stakeAccountPDA] = deriveStakeAccountPDA(poolPDA, user);
  const userTokenAccount = await getAssociatedTokenAddress(stakingMint, user);

  const data = Buffer.from(IX_CLAIM_REWARDS);

  return new TransactionInstruction({
    programId: AURA_STAKING_PROGRAM_ID,
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: stakeAccountPDA, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: rewardTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}
