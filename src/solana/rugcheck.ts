/**
 * Rugcheck.xyz integration for token security analysis.
 * Adapted from solana-agent-kit plugin-token (Apache-2.0).
 */

const RUGCHECK_API = "https://api.rugcheck.xyz/v1";

export interface TokenRisk {
  name: string;
  level: string;
  description: string;
  score: number;
}

export interface TokenCheck {
  tokenProgram: string;
  tokenType: string;
  risks: TokenRisk[];
  score: number;
}

/**
 * Fetch a summary security report for a token mint.
 */
export async function fetchTokenReportSummary(mint: string): Promise<TokenCheck> {
  const res = await fetch(`${RUGCHECK_API}/tokens/${mint}/report/summary`);
  if (!res.ok) {
    throw new Error(`Rugcheck summary failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenCheck;
}

/**
 * Fetch a detailed security report for a token mint.
 */
export async function fetchTokenDetailedReport(mint: string): Promise<TokenCheck> {
  const res = await fetch(`${RUGCHECK_API}/tokens/${mint}/report`);
  if (!res.ok) {
    throw new Error(`Rugcheck report failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenCheck;
}

/**
 * Get a human-readable risk assessment for a token.
 */
export function assessRisk(report: TokenCheck): {
  riskLevel: "safe" | "caution" | "warning" | "danger";
  summary: string;
  topRisks: TokenRisk[];
} {
  const score = report.score;
  let riskLevel: "safe" | "caution" | "warning" | "danger";

  if (score <= 100) {
    riskLevel = "safe";
  } else if (score <= 500) {
    riskLevel = "caution";
  } else if (score <= 2000) {
    riskLevel = "warning";
  } else {
    riskLevel = "danger";
  }

  const topRisks = report.risks.toSorted((a, b) => b.score - a.score).slice(0, 5);

  return {
    riskLevel,
    summary: `Score: ${score} (${riskLevel}). ${report.risks.length} risk(s) found. Token type: ${report.tokenType}.`,
    topRisks,
  };
}
