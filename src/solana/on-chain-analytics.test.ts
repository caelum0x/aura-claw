import { PublicKey } from "@solana/web3.js";
import { describe, it, expect } from "vitest";
import { computePortfolioRisk } from "./on-chain-analytics.js";
import type { TokenBalance } from "./portfolio.js";

function makeBalance(symbol: string, balance: number, usdValue: number | null): TokenBalance {
  return {
    token: {
      symbol,
      name: symbol,
      mint: PublicKey.default,
      decimals: 9,
    },
    balance,
    usdValue,
  };
}

describe("computePortfolioRisk", () => {
  it("returns low risk for empty portfolio", () => {
    const result = computePortfolioRisk([], 0);
    expect(result.overallRisk).toBe("low");
    expect(result.diversificationScore).toBe(0);
  });

  it("detects high concentration risk", () => {
    const balances = [makeBalance("SOL", 10, 1500), makeBalance("USDC", 50, 50)];
    const result = computePortfolioRisk(balances, 1550);
    expect(result.overallRisk).toBe("high");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.concentrationRisk).toContain("SOL");
  });

  it("detects low stablecoin allocation", () => {
    const balances = [makeBalance("SOL", 5, 750), makeBalance("BONK", 1000000, 300)];
    const result = computePortfolioRisk(balances, 1050);
    expect(result.stablecoinRatio).toBe(0);
    expect(result.warnings.some((w) => w.includes("stablecoin"))).toBe(true);
  });

  it("returns low risk for well-diversified portfolio", () => {
    const balances = [
      makeBalance("SOL", 1, 150),
      makeBalance("USDC", 200, 200),
      makeBalance("USDT", 150, 150),
      makeBalance("JUP", 100, 120),
    ];
    const result = computePortfolioRisk(balances, 620);
    expect(result.overallRisk).toBe("low");
    expect(result.stablecoinRatio).toBeGreaterThan(0.3);
  });

  it("warns about single-asset portfolio", () => {
    const balances = [makeBalance("SOL", 10, 1500)];
    const result = computePortfolioRisk(balances, 1500);
    expect(result.warnings.some((w) => w.includes("Single-asset"))).toBe(true);
  });

  it("calculates diversification score", () => {
    // Perfectly balanced 4-asset portfolio should have high diversification
    const balances = [
      makeBalance("SOL", 1, 250),
      makeBalance("USDC", 250, 250),
      makeBalance("USDT", 250, 250),
      makeBalance("JUP", 200, 250),
    ];
    const result = computePortfolioRisk(balances, 1000);
    expect(result.diversificationScore).toBeGreaterThan(80);
  });
});
