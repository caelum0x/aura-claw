import { describe, it, expect, beforeEach, vi } from "vitest";
import { SpendTracker, estimateUsdValue } from "./guardrails.js";

describe("SpendTracker", () => {
  let tracker: SpendTracker;

  beforeEach(() => {
    tracker = new SpendTracker({
      maxTxAmountUsd: 100,
      dailySpendLimitUsd: 500,
      maxTxPerHour: 5,
      confirmationThresholdUsd: 25,
      recipientAllowlist: [],
    });
  });

  it("allows transactions within limits", () => {
    const result = tracker.validate(50, "SomeWallet123", "swap");
    expect(result.allowed).toBe(true);
  });

  it("blocks transactions exceeding per-tx cap", () => {
    const result = tracker.validate(150, "SomeWallet123", "swap");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("per-transaction limit");
  });

  it("blocks transactions exceeding daily limit", () => {
    // Spend 450 in 9 small transactions
    for (let i = 0; i < 4; i++) {
      tracker.record(100, "SomeWallet123", "swap");
    }
    tracker.record(50, "SomeWallet123", "swap");

    // Next 60 should exceed 500 daily limit
    const result = tracker.validate(60, "SomeWallet123", "swap");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("daily limit");
  });

  it("blocks transactions exceeding hourly rate limit", () => {
    for (let i = 0; i < 5; i++) {
      tracker.record(10, "SomeWallet123", "swap");
    }
    const result = tracker.validate(10, "SomeWallet123", "swap");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Hourly transaction limit");
  });

  it("blocks transactions to non-allowlisted recipients", () => {
    const restricted = new SpendTracker({
      maxTxAmountUsd: 1000,
      dailySpendLimitUsd: 5000,
      maxTxPerHour: 100,
      confirmationThresholdUsd: 25,
      recipientAllowlist: ["AllowedWallet1", "AllowedWallet2"],
    });

    const allowed = restricted.validate(50, "AllowedWallet1", "transfer");
    expect(allowed.allowed).toBe(true);

    const blocked = restricted.validate(50, "UnknownWallet", "transfer");
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("not in allowlist");
  });

  it("flags transactions above confirmation threshold", () => {
    const result = tracker.validate(30, "SomeWallet123", "swap");
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
  });

  it("does not flag transactions below confirmation threshold", () => {
    const result = tracker.validate(10, "SomeWallet123", "swap");
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
  });

  it("returns status summary", () => {
    tracker.record(50, "Wallet1", "swap");
    tracker.record(30, "Wallet2", "transfer");
    const status = tracker.getStatus();

    expect(status.dailySpent).toBe(80);
    expect(status.dailyRemaining).toBe(420);
    expect(status.hourlyTxCount).toBe(2);
    expect(status.recentTransactions).toHaveLength(2);
  });

  it("prunes records older than 24h on record()", () => {
    // Manually inject an old record
    const old = Date.now() - 25 * 60 * 60 * 1000;
    (
      tracker as unknown as {
        records: Array<{ timestamp: number; amountUsd: number; recipient: string; action: string }>;
      }
    ).records.push({
      timestamp: old,
      amountUsd: 200,
      recipient: "Old",
      action: "swap",
    });

    // Recording a new tx should prune the old one
    tracker.record(10, "New", "swap");
    expect(tracker.getDailySpend()).toBe(10);
  });

  it("updateConfig changes limits dynamically", () => {
    tracker.updateConfig({ maxTxAmountUsd: 10 });
    const result = tracker.validate(50, "Wallet", "swap");
    expect(result.allowed).toBe(false);
  });
});

describe("estimateUsdValue", () => {
  it("returns amount directly for USDC", async () => {
    expect(await estimateUsdValue(100, "USDC")).toBe(100);
  });

  it("returns amount directly for USDT", async () => {
    expect(await estimateUsdValue(50, "USDT")).toBe(50);
  });

  it("fetches price for SOL from CoinGecko", async () => {
    const mockResponse = {
      solana: { usd: 150 },
      bonk: { usd: 0.00003 },
      "jupiter-exchange-solana": { usd: 1.2 },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const value = await estimateUsdValue(2, "SOL");
    expect(value).toBe(300);

    vi.restoreAllMocks();
  });

  it("returns 0 for unknown tokens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ solana: { usd: 150 } }),
    } as Response);

    const value = await estimateUsdValue(100, "AURA");
    expect(value).toBe(0);

    vi.restoreAllMocks();
  });
});
