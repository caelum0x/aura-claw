import { css } from "lit";

export const solanaDashboardStyles = css`
  .solana-dashboard {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .solana-section {
    background: var(--card-bg, #1a1a2e);
    border: 1px solid var(--border-color, #333);
    border-radius: 12px;
    padding: 1.25rem;
  }

  .solana-section h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--heading-color, #e0e0e0);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .portfolio-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .portfolio-table th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-color, #333);
    color: var(--muted-color, #888);
    font-weight: 500;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .portfolio-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-color-subtle, #222);
    color: var(--text-color, #ccc);
  }

  .portfolio-table tr:last-child td {
    border-bottom: none;
  }

  .portfolio-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-color, #333);
  }

  .portfolio-total .label {
    color: var(--muted-color, #888);
    font-size: 0.875rem;
  }

  .portfolio-total .value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent-color, #7c5cfc);
  }

  .swap-form {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0.75rem;
    align-items: end;
  }

  .swap-form .arrow {
    font-size: 1.25rem;
    color: var(--muted-color, #888);
    padding-bottom: 0.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .form-group label {
    font-size: 0.75rem;
    color: var(--muted-color, #888);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .form-group input,
  .form-group select {
    background: var(--input-bg, #0d0d1a);
    border: 1px solid var(--border-color, #333);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    color: var(--text-color, #ccc);
    font-size: 0.875rem;
    outline: none;
  }

  .form-group input:focus,
  .form-group select:focus {
    border-color: var(--accent-color, #7c5cfc);
  }

  .signals-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .signal-card {
    background: var(--input-bg, #0d0d1a);
    border: 1px solid var(--border-color-subtle, #222);
    border-radius: 8px;
    padding: 0.75rem;
  }

  .signal-card .token-name {
    font-weight: 600;
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }

  .signal-card .price {
    font-size: 1.125rem;
    font-weight: 700;
  }

  .signal-card .change {
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }

  .change.positive {
    color: var(--green, #4ade80);
  }

  .change.negative {
    color: var(--red, #f87171);
  }

  .guardrails-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .guardrail-stat {
    background: var(--input-bg, #0d0d1a);
    border-radius: 8px;
    padding: 0.75rem;
    text-align: center;
  }

  .guardrail-stat .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--accent-color, #7c5cfc);
  }

  .guardrail-stat .stat-label {
    font-size: 0.7rem;
    color: var(--muted-color, #888);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 0.25rem;
  }

  .tx-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .tx-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-color-subtle, #222);
    font-size: 0.813rem;
  }

  .tx-item:last-child {
    border-bottom: none;
  }

  .tx-sig {
    font-family: monospace;
    color: var(--accent-color, #7c5cfc);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-status {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
  }

  .tx-status.success {
    background: rgba(74, 222, 128, 0.15);
    color: var(--green, #4ade80);
  }

  .tx-status.error {
    background: rgba(248, 113, 113, 0.15);
    color: var(--red, #f87171);
  }

  .ai-analysis {
    white-space: pre-wrap;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--text-color, #ccc);
    background: var(--input-bg, #0d0d1a);
    border-radius: 8px;
    padding: 1rem;
  }

  .loading {
    color: var(--muted-color, #888);
    font-style: italic;
    padding: 2rem;
    text-align: center;
  }

  .error-msg {
    color: var(--red, #f87171);
    font-size: 0.875rem;
    padding: 0.5rem;
  }

  .btn {
    background: var(--accent-color, #7c5cfc);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    cursor: pointer;
    font-weight: 500;
    transition: opacity 0.15s;
  }

  .btn:hover {
    opacity: 0.85;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--border-color, #333);
  }

  .risk-badge {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .risk-badge.low {
    background: rgba(74, 222, 128, 0.15);
    color: var(--green, #4ade80);
  }

  .risk-badge.medium {
    background: rgba(250, 204, 21, 0.15);
    color: #facc15;
  }

  .risk-badge.high {
    background: rgba(248, 113, 113, 0.15);
    color: var(--red, #f87171);
  }

  .status-badge {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .status-badge.active {
    background: rgba(74, 222, 128, 0.15);
    color: var(--green, #4ade80);
  }

  .status-badge.stopped {
    background: rgba(248, 113, 113, 0.15);
    color: var(--red, #f87171);
  }

  .count-badge {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    background: rgba(124, 92, 252, 0.15);
    color: var(--accent-color, #7c5cfc);
  }

  .trade-action {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    text-transform: uppercase;
  }

  .trade-action.buy {
    background: rgba(74, 222, 128, 0.15);
    color: var(--green, #4ade80);
  }

  .trade-action.sell {
    background: rgba(248, 113, 113, 0.15);
    color: var(--red, #f87171);
  }

  .stat-value.positive {
    color: var(--green, #4ade80);
  }

  .stat-value.negative {
    color: var(--red, #f87171);
  }

  .risk-level {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  .risk-level.safe {
    color: var(--green, #4ade80);
  }

  .risk-level.caution {
    color: #facc15;
  }

  .risk-level.warning {
    color: #fb923c;
  }

  .risk-level.danger {
    color: var(--red, #f87171);
  }

  .risk-level.unknown {
    color: var(--muted-color, #888);
  }

  .solana-section h4 {
    margin: 0;
    font-weight: 500;
  }

  .solana-section code {
    font-family: monospace;
    font-size: 0.813rem;
    color: var(--accent-color, #7c5cfc);
  }
`;
