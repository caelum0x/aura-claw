/**
 * Solana DeFi Dashboard view.
 *
 * Communicates via the existing chat WebSocket by dispatching agent tool calls.
 * All data flows through the `solana_defi` agent tool — no custom RPC.
 */

import { html, nothing, type TemplateResult } from "lit";
import { solanaDashboardStyles } from "./solana-dashboard-styles.js";

export interface SolanaDashboardProps {
  loading: boolean;
  error: string | null;
  portfolio: PortfolioData | null;
  signals: SignalsData | null;
  guardrails: GuardrailsData | null;
  txHistory: TxHistoryEntry[];
  riskAnalysis: RiskData | null;
  dcaOrders: DcaOrderData | null;
  autopilot: AutopilotData | null;
  sniper: SniperData | null;
  webhooks: WebhookData | null;
  onRefresh: () => void;
  onSwap: (input: string, output: string, amount: number) => void;
  onTransfer: (recipient: string, amount: number, token: string) => void;
}

export interface PortfolioData {
  wallet: string;
  totalUsdValue: number;
  holdings: Array<{
    symbol: string;
    name: string;
    balance: number;
    usdValue: number | null;
    allocation: string | null;
  }>;
}

export interface SignalsData {
  marketData: Array<{
    id: string;
    price: number;
    change24h: number;
    volume24h: number;
  }>;
  aiAnalysis: string | null;
  whaleActivity?: {
    networkTps: number | null;
  };
}

export interface GuardrailsData {
  dailySpent: number;
  dailyLimit: number;
  dailyRemaining: number;
  hourlyTxCount: number;
  hourlyTxLimit: number;
  maxTxAmountUsd: number;
  confirmationThresholdUsd: number;
  recentTransactions: Array<{
    timestamp: number;
    amountUsd: number;
    recipient: string;
    action: string;
  }>;
}

export interface TxHistoryEntry {
  signature: string;
  slot: number;
  blockTime: number | null;
  status: "success" | "error";
  type: string;
}

export interface RiskData {
  overallRisk: "low" | "medium" | "high";
  concentrationRisk: string;
  diversificationScore: number;
  stablecoinRatio: number;
  warnings: string[];
}

export interface DcaOrderData {
  activeOrders: number;
  totalOrders: number;
  totalExecutions: number;
  successfulSwaps: number;
  failedSwaps: number;
  orders: Array<{
    id: string;
    inputToken: string;
    outputToken: string;
    amountPerInterval: number;
    intervalMs: number;
    spent: number;
    totalBudget: number;
    executionCount: number;
    maxExecutions: number;
    active: boolean;
    lastExecutedAt: number | null;
    nextExecutionAt: number;
  }>;
}

export interface AutopilotData {
  running: boolean;
  strategy: string;
  cycleCount: number;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  pnlUsd: number;
  recentTrades: Array<{
    token: string;
    action: "buy" | "sell";
    amountUsd: number;
    signature: string | null;
    timestamp: number;
    success: boolean;
  }>;
}

export interface SniperData {
  totalScanned: number;
  safeTargets: number;
  boughtTargets: number;
  lastScan: number | null;
  config: {
    maxRiskLevel: string;
    minMarketCap: number;
    maxMarketCap: number;
    buyAmountSol: number;
    autoBuy: boolean;
  };
  targets: Array<{
    mint: string;
    name: string;
    symbol: string;
    usdMarketCap: number;
    riskLevel: string;
    bought: boolean;
    buySignature: string | null;
  }>;
}

export interface WebhookData {
  webhooks: Array<{
    webhookID: string;
    webhookURL: string;
    transactionTypes: string[];
    accountAddresses: string[];
    webhookType: string;
  }>;
}

// Exported symbol names for the token ID -> display name mapping
const TOKEN_NAMES: Record<string, string> = {
  solana: "SOL",
  "usd-coin": "USDC",
  tether: "USDT",
  bonk: "BONK",
  "jupiter-exchange-solana": "JUP",
};

export function renderSolanaDashboard(props: SolanaDashboardProps): TemplateResult {
  return html`
    <style>
      ${solanaDashboardStyles}
    </style>
    <div class="solana-dashboard">
      ${
        props.loading
          ? html`
              <div class="loading">Loading Solana data...</div>
            `
          : nothing
      }
      ${props.error ? html`<div class="error-msg">${props.error}</div>` : nothing}

      ${renderPortfolioSection(props.portfolio, props.riskAnalysis)}
      ${renderAutopilotSection(props.autopilot)}
      ${renderDcaSection(props.dcaOrders)}
      ${renderSniperSection(props.sniper)}
      ${renderSignalsSection(props.signals)}
      ${renderGuardrailsSection(props.guardrails)}
      ${renderWebhookSection(props.webhooks)}
      ${renderTxHistorySection(props.txHistory)}

      <div style="display: flex; gap: 0.75rem; justify-content: flex-end; padding: 0.5rem 0;">
        <button class="btn btn-secondary" @click=${props.onRefresh}>Refresh</button>
      </div>
    </div>
  `;
}

function renderPortfolioSection(
  portfolio: PortfolioData | null,
  risk: RiskData | null,
): TemplateResult {
  if (!portfolio) {
    return html`
      <div class="solana-section">
        <h3>Portfolio</h3>
        <div class="loading">No portfolio data. Use the chat to run: solana_defi balance</div>
      </div>
    `;
  }

  return html`
    <div class="solana-section">
      <h3>
        Portfolio
        ${
          risk
            ? html`<span class="risk-badge ${risk.overallRisk}">${risk.overallRisk} risk</span>`
            : nothing
        }
      </h3>
      <table class="portfolio-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Balance</th>
            <th>USD Value</th>
            <th>Allocation</th>
          </tr>
        </thead>
        <tbody>
          ${portfolio.holdings.map(
            (h) => html`
              <tr>
                <td><strong>${h.symbol}</strong> <span style="color: var(--muted-color)">${h.name}</span></td>
                <td>${formatNumber(h.balance)}</td>
                <td>${h.usdValue != null ? `$${formatNumber(h.usdValue)}` : "—"}</td>
                <td>${h.allocation ?? "—"}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
      <div class="portfolio-total">
        <span class="label">Total Portfolio Value</span>
        <span class="value">$${formatNumber(portfolio.totalUsdValue)}</span>
      </div>
      ${
        risk && risk.warnings.length > 0
          ? html`
            <div style="margin-top: 0.75rem;">
              ${risk.warnings.map(
                (w) => html`<div class="error-msg" style="color: #facc15;">${w}</div>`,
              )}
            </div>
          `
          : nothing
      }
    </div>
  `;
}

function renderSignalsSection(signals: SignalsData | null): TemplateResult {
  if (!signals) {
    return html`
      <div class="solana-section">
        <h3>Market Signals</h3>
        <div class="loading">No signals data. Use the chat to run: solana_defi signals</div>
      </div>
    `;
  }

  return html`
    <div class="solana-section">
      <h3>Market Signals</h3>
      <div class="signals-grid">
        ${signals.marketData.map((m) => {
          const isPositive = m.change24h >= 0;
          return html`
            <div class="signal-card">
              <div class="token-name">${TOKEN_NAMES[m.id] ?? m.id}</div>
              <div class="price">$${formatNumber(m.price)}</div>
              <div class="change ${isPositive ? "positive" : "negative"}">
                ${isPositive ? "+" : ""}${m.change24h?.toFixed(2)}% (24h)
              </div>
              <div style="font-size: 0.7rem; color: var(--muted-color); margin-top: 0.25rem;">
                Vol: $${formatCompact(m.volume24h)}
              </div>
            </div>
          `;
        })}
      </div>
      ${
        signals.whaleActivity?.networkTps != null
          ? html`<div style="margin-top: 0.75rem; font-size: 0.813rem; color: var(--muted-color);">
            Network TPS: ${signals.whaleActivity.networkTps.toLocaleString()}
          </div>`
          : nothing
      }
      ${
        signals.aiAnalysis
          ? html`
            <h3 style="margin-top: 1.25rem;">AI Analysis</h3>
            <div class="ai-analysis">${signals.aiAnalysis}</div>
          `
          : nothing
      }
    </div>
  `;
}

function renderGuardrailsSection(guardrails: GuardrailsData | null): TemplateResult {
  if (!guardrails) {
    return html`
      <div class="solana-section">
        <h3>Guardrails</h3>
        <div class="loading">No guardrails data. Use the chat to run: solana_defi guardrails_status</div>
      </div>
    `;
  }

  return html`
    <div class="solana-section">
      <h3>Guardrails</h3>
      <div class="guardrails-grid">
        <div class="guardrail-stat">
          <div class="stat-value">$${formatNumber(guardrails.dailySpent)}</div>
          <div class="stat-label">Spent Today</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">$${formatNumber(guardrails.dailyRemaining)}</div>
          <div class="stat-label">Remaining</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">${guardrails.hourlyTxCount}/${guardrails.hourlyTxLimit}</div>
          <div class="stat-label">Hourly Txns</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">$${formatNumber(guardrails.maxTxAmountUsd)}</div>
          <div class="stat-label">Max Per Tx</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">$${formatNumber(guardrails.confirmationThresholdUsd)}</div>
          <div class="stat-label">Confirm Above</div>
        </div>
      </div>
    </div>
  `;
}

function renderTxHistorySection(txHistory: TxHistoryEntry[]): TemplateResult {
  if (txHistory.length === 0) {
    return html`
      <div class="solana-section">
        <h3>Transaction History</h3>
        <div class="loading">No transactions. Use the chat to run: solana_defi tx_history</div>
      </div>
    `;
  }

  return html`
    <div class="solana-section">
      <h3>Transaction History</h3>
      <ul class="tx-list">
        ${txHistory.map(
          (tx) => html`
            <li class="tx-item">
              <span class="tx-sig" title=${tx.signature}>${tx.signature}</span>
              <span>Slot ${tx.slot.toLocaleString()}</span>
              <span>${tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString() : "—"}</span>
              <span class="tx-status ${tx.status}">${tx.status}</span>
            </li>
          `,
        )}
      </ul>
    </div>
  `;
}

function renderAutopilotSection(data: AutopilotData | null): TemplateResult {
  if (!data) {
    return html`
      <div class="solana-section">
        <h3>Autopilot</h3>
        <div class="loading">No autopilot data. Use the chat: solana_defi autopilot status</div>
      </div>
    `;
  }

  return html`
    <div class="solana-section">
      <h3>
        Autopilot
        <span class="status-badge ${data.running ? "active" : "stopped"}">
          ${data.running ? "Running" : "Stopped"}
        </span>
      </h3>
      <div class="guardrails-grid">
        <div class="guardrail-stat">
          <div class="stat-value">${data.strategy}</div>
          <div class="stat-label">Strategy</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">${data.cycleCount}</div>
          <div class="stat-label">Cycles</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">${data.successfulTrades}/${data.totalTrades}</div>
          <div class="stat-label">Trades (OK/Total)</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value ${data.pnlUsd >= 0 ? "positive" : "negative"}">
            ${data.pnlUsd >= 0 ? "+" : ""}$${formatNumber(Math.abs(data.pnlUsd))}
          </div>
          <div class="stat-label">Est. PnL</div>
        </div>
      </div>
      ${
        data.recentTrades.length > 0
          ? html`
            <h4 style="margin: 1rem 0 0.5rem; font-size: 0.813rem; color: var(--muted-color);">Recent Trades</h4>
            <ul class="tx-list">
              ${data.recentTrades.slice(0, 5).map(
                (t) => html`
                  <li class="tx-item">
                    <span class="trade-action ${t.action}">${t.action.toUpperCase()}</span>
                    <span>${t.token}</span>
                    <span>$${formatNumber(t.amountUsd)}</span>
                    <span class="tx-status ${t.success ? "success" : "error"}">
                      ${t.success ? "OK" : "Failed"}
                    </span>
                  </li>
                `,
              )}
            </ul>
          `
          : nothing
      }
    </div>
  `;
}

function renderDcaSection(data: DcaOrderData | null): TemplateResult {
  if (!data) {
    return html`
      <div class="solana-section">
        <h3>DCA Orders</h3>
        <div class="loading">No DCA data. Use the chat: solana_defi dca status</div>
      </div>
    `;
  }

  return html`
    <div class="solana-section">
      <h3>
        DCA Orders
        <span class="count-badge">${data.activeOrders} active</span>
      </h3>
      <div class="guardrails-grid">
        <div class="guardrail-stat">
          <div class="stat-value">${data.activeOrders}/${data.totalOrders}</div>
          <div class="stat-label">Active/Total</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">${data.totalExecutions}</div>
          <div class="stat-label">Executions</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">${data.successfulSwaps}</div>
          <div class="stat-label">Successful</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">${data.failedSwaps}</div>
          <div class="stat-label">Failed</div>
        </div>
      </div>
      ${
        data.orders.length > 0
          ? html`
            <table class="portfolio-table" style="margin-top: 1rem;">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Pair</th>
                  <th>Amount</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Next Run</th>
                </tr>
              </thead>
              <tbody>
                ${data.orders.map(
                  (o) => html`
                    <tr>
                      <td><code>${o.id}</code></td>
                      <td>${o.inputToken} &rarr; ${o.outputToken}</td>
                      <td>${formatNumber(o.amountPerInterval)}</td>
                      <td>${o.executionCount}/${o.maxExecutions} ($${formatNumber(o.spent)}/$${formatNumber(o.totalBudget)})</td>
                      <td>
                        <span class="status-badge ${o.active ? "active" : "stopped"}">
                          ${o.active ? "Active" : "Done"}
                        </span>
                      </td>
                      <td>${o.active ? formatRelativeTime(o.nextExecutionAt) : "—"}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          `
          : nothing
      }
    </div>
  `;
}

function renderSniperSection(data: SniperData | null): TemplateResult {
  if (!data) {
    return html`
      <div class="solana-section">
        <h3>Token Sniper</h3>
        <div class="loading">No sniper data. Use the chat: solana_defi sniper status</div>
      </div>
    `;
  }

  return html`
    <div class="solana-section">
      <h3>
        Token Sniper
        <span class="count-badge">${data.safeTargets} safe</span>
      </h3>
      <div class="guardrails-grid">
        <div class="guardrail-stat">
          <div class="stat-value">${data.totalScanned}</div>
          <div class="stat-label">Scanned</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">${data.safeTargets}</div>
          <div class="stat-label">Safe</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">${data.boughtTargets}</div>
          <div class="stat-label">Bought</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">${data.config.autoBuy ? "ON" : "OFF"}</div>
          <div class="stat-label">Auto-Buy</div>
        </div>
        <div class="guardrail-stat">
          <div class="stat-value">${data.config.buyAmountSol} SOL</div>
          <div class="stat-label">Buy Size</div>
        </div>
      </div>
      ${
        data.lastScan
          ? html`<div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 0.5rem;">
              Last scan: ${new Date(data.lastScan).toLocaleString()}
            </div>`
          : nothing
      }
      ${
        data.targets.length > 0
          ? html`
            <table class="portfolio-table" style="margin-top: 1rem;">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Market Cap</th>
                  <th>Risk</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${data.targets.slice(0, 10).map(
                  (t) => html`
                    <tr>
                      <td><strong>${t.symbol}</strong> <span style="color: var(--muted-color)">${t.name}</span></td>
                      <td>$${formatCompact(t.usdMarketCap)}</td>
                      <td><span class="risk-level ${t.riskLevel}">${t.riskLevel}</span></td>
                      <td>
                        ${
                          t.bought
                            ? html`
                                <span class="tx-status success">Bought</span>
                              `
                            : html`
                                <span style="color: var(--muted-color)">Watching</span>
                              `
                        }
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          `
          : nothing
      }
    </div>
  `;
}

function renderWebhookSection(data: WebhookData | null): TemplateResult {
  if (!data) {
    return html`
      <div class="solana-section">
        <h3>Webhooks</h3>
        <div class="loading">No webhook data. Use the chat: solana_defi webhook list</div>
      </div>
    `;
  }

  if (data.webhooks.length === 0) {
    return html`
      <div class="solana-section">
        <h3>Webhooks</h3>
        <div class="loading">No webhooks configured. Use the chat: solana_defi webhook create</div>
      </div>
    `;
  }

  return html`
    <div class="solana-section">
      <h3>Webhooks <span class="count-badge">${data.webhooks.length}</span></h3>
      <table class="portfolio-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>URL</th>
            <th>Type</th>
            <th>Addresses</th>
          </tr>
        </thead>
        <tbody>
          ${data.webhooks.map(
            (w) => html`
              <tr>
                <td><code>${w.webhookID.slice(0, 12)}...</code></td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${w.webhookURL}</td>
                <td>${w.webhookType}</td>
                <td>${w.accountAddresses.length} addr</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;
}

function formatRelativeTime(timestamp: number): string {
  const diff = timestamp - Date.now();
  if (diff <= 0) {
    return "now";
  }
  if (diff < 60_000) {
    return `${Math.round(diff / 1000)}s`;
  }
  if (diff < 3_600_000) {
    return `${Math.round(diff / 60_000)}m`;
  }
  return `${Math.round(diff / 3_600_000)}h`;
}

function formatNumber(n: number): string {
  if (n >= 1000) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (n >= 1) {
    return n.toFixed(2);
  }
  if (n >= 0.01) {
    return n.toFixed(4);
  }
  return n.toFixed(6);
}

function formatCompact(n: number): string {
  if (n >= 1e9) {
    return (n / 1e9).toFixed(1) + "B";
  }
  if (n >= 1e6) {
    return (n / 1e6).toFixed(1) + "M";
  }
  if (n >= 1e3) {
    return (n / 1e3).toFixed(1) + "K";
  }
  return n.toFixed(0);
}
