# AuraClaw — Autonomous Solana DeFi AI Agent

**AuraClaw** is an AI-powered autonomous trading agent for Solana DeFi, built by **DeAura**. It combines real on-chain execution with AI-driven market intelligence to trade, snipe, DCA, and manage portfolios — all through natural language.

Talk to Aura like you'd talk to a trader. Say "swap 2 SOL for BONK" or "snipe safe Pump.fun launches under 100k mcap" and it executes real transactions on-chain.

## Features

### Trading & Swaps

- **Jupiter DEX swaps** — best-route aggregation with configurable slippage
- **Limit orders** — Jupiter limit order placement and management
- **Token buying** — AI-powered buy with automatic rugcheck before execution
- **Pump.fun token launch** — create and launch tokens on bonding curves

### Autonomous Trading

- **Autopilot** — AI-driven trading engine using Claude Sonnet via OpenRouter. Gathers market data (Pyth + DexScreener), generates trading signals, and executes real Jupiter swaps. Strategies: conservative, balanced, aggressive, dip_buyer, momentum
- **DCA (Dollar Cost Averaging)** — recurring buys on schedule with real Jupiter swap execution. Supports intervals from 1m to 1w
- **Token Sniper** — monitors Pump.fun for new launches, runs rugcheck on each, and auto-buys tokens that pass safety filters

### Analysis & Intelligence

- **Rugcheck** — token security scoring before any trade (powered by rugcheck.xyz)
- **Pyth oracle prices** — real-time price feeds for major tokens
- **DexScreener** — pair search, volume, liquidity, and price action data
- **CoinGecko trending** — trending tokens and market overview
- **AI market signals** — Claude-powered analysis combining price data, volume, and risk assessment

### Portfolio Management

- **Balance & portfolio** — full holdings view with USD values and risk analysis
- **Auto-rebalance** — AI-suggested portfolio rebalancing
- **Close empty accounts** — reclaim SOL rent from zero-balance token accounts

### Aura Ecosystem (On-Chain Programs)

Three custom Anchor programs deployed on Solana:

| Program          | Address                                        | Purpose                                       |
| ---------------- | ---------------------------------------------- | --------------------------------------------- |
| **Aura Staking** | `AURAstk2xWBqHK4zTReCKrN6HJPAkwpJ8aXfpKqRtZ9e` | Stake AURA tokens, earn rewards               |
| **Aura Vault**   | `AURAvau1tNftGLwnBjSMx1tLHyvPQk3K7FsBudgt3yMh` | Managed vault with agent trading + guardrails |
| **Aura Fees**    | `AURAfee3RcNxM2bVjqFhKpLhyuvMWZgST1pGMuEnNkz7` | Fee collection and distribution               |

### Infrastructure

- **Helius webhooks** — real-time transaction monitoring via webhook CRUD
- **Transaction parsing** — Helius-powered transaction history and parsing
- **Spending guardrails** — per-tx caps, daily limits, hourly rate limits, recipient allowlists
- **Priority fees** — automatic priority fee estimation for faster confirmation

### Frontend Dashboard

Web UI with live panels for:

- Portfolio holdings and risk analysis
- Autopilot status, strategy, and trade history
- DCA order tracking with execution progress
- Token sniper scan results and auto-buy status
- Market signals and AI analysis
- Guardrails and spending limits
- Webhook management
- Transaction history

## Architecture

```
src/solana/
  wallet.ts              # Keypair loading, transaction signing
  jupiter.ts             # Jupiter swap quotes, tx building, deserialization
  guardrails.ts          # Spend tracking, tx validation, rate limiting
  autopilot.ts           # AI-driven autonomous trading engine
  dca.ts                 # Dollar cost averaging with real swap execution
  token-sniper.ts        # Pump.fun scanner + auto-buy
  pumpfun.ts             # Token launch + trading on bonding curves
  helius-webhooks.ts     # Webhook CRUD for transaction monitoring
  helius.ts              # Transaction parsing, asset queries
  rugcheck.ts            # Token security analysis
  portfolio.ts           # Holdings, USD values, risk scoring
  on-chain-analytics.ts  # Metadata, whale detection, portfolio risk
  pyth.ts                # Oracle price feeds
  dexscreener.ts         # DEX pair data and search
  aura-staking.ts        # Anchor program client (staking)
  aura-vault.ts          # Anchor program client (vault)
  aura-fees.ts           # Anchor program client (fees)
  connection.ts          # RPC connection management
  priority-fees.ts       # Priority fee estimation

src/agents/tools/
  solana-defi-tool.ts    # Single tool with 31 action dispatch

programs/
  aura-staking/          # Anchor program (Rust)
  aura-vault/            # Anchor program (Rust)
  aura-fees/             # Anchor program (Rust)

ui/src/ui/views/
  solana-dashboard.ts    # Lit web component dashboard
  solana-dashboard-styles.ts
```

## Setup

```bash
pnpm install
```

### Environment Variables

| Variable             | Required | Description                                      |
| -------------------- | -------- | ------------------------------------------------ |
| `SOLANA_PRIVATE_KEY` | Yes      | Base58-encoded wallet private key                |
| `SOLANA_RPC_URL`     | No       | Custom RPC endpoint (defaults to public mainnet) |
| `SOLANA_NETWORK`     | No       | `devnet`, `testnet`, or `mainnet-beta`           |
| `HELIUS_API_KEY`     | No       | For transaction parsing and webhooks             |
| `OPENROUTER_API_KEY` | No       | For AI-powered autopilot trading signals         |

### Configuration

Configure via `solana` section in the config:

```json
{
  "solana": {
    "network": "mainnet-beta",
    "rpcUrl": "https://your-rpc.com",
    "maxTxAmountUsd": 100,
    "dailySpendLimitUsd": 500,
    "maxTxPerHour": 20,
    "confirmationThresholdUsd": 25
  }
}
```

## Build & Test

```bash
pnpm build        # TypeScript build
pnpm test         # Run tests
pnpm check        # Lint + format + typecheck
```

## Usage Examples

```
> swap 1 SOL for USDC
> check rugcheck for BONK
> show my portfolio
> start autopilot with balanced strategy
> create DCA: buy 0.5 SOL of JUP every 4 hours, budget 10 SOL
> scan pump.fun for safe tokens under 50k mcap
> launch token "AuraDog" ADOG on pump.fun with 1 SOL initial buy
> show autopilot status
> stake 100 AURA
> set up webhook for my wallet transactions
```

## Security

- All transactions require explicit `confirm=true` to execute on-chain
- Rugcheck runs automatically before unfamiliar token trades
- Spending guardrails enforce per-tx, daily, and hourly limits
- Recipient allowlists restrict transfer destinations
- Transactions above the confirmation threshold require user approval

## Built With

- **Solana web3.js** — on-chain interaction
- **Jupiter** — DEX aggregation and swap execution
- **Helius** — transaction parsing and webhooks
- **Pyth** — oracle price feeds
- **DexScreener** — market data
- **Rugcheck.xyz** — token security analysis
- **OpenRouter + Claude** — AI trading signals
- **Pump.fun** — token launches and bonding curve trading
- **Anchor** — on-chain program framework (Rust)
- **Lit** — frontend web components

## License

MIT
