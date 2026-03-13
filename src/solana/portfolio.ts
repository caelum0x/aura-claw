import { PublicKey } from "@solana/web3.js";
import { getSolanaConnection } from "./connection.js";
import { getAllTokens, getTokenByMint, type TokenInfo } from "./tokens.js";

export interface TokenBalance {
  token: TokenInfo;
  balance: number;
  usdValue: number | null;
}

export interface PortfolioSummary {
  wallet: string;
  totalUsdValue: number;
  balances: TokenBalance[];
  timestamp: string;
}

async function fetchPrices(coingeckoIds: string[]): Promise<Record<string, number>> {
  if (coingeckoIds.length === 0) {
    return {};
  }
  const ids = coingeckoIds.join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  const res = await fetch(url);
  if (!res.ok) {
    return {};
  }
  const data = (await res.json()) as Record<string, { usd?: number }>;
  const prices: Record<string, number> = {};
  for (const [id, val] of Object.entries(data)) {
    if (val.usd !== undefined) {
      prices[id] = val.usd;
    }
  }
  return prices;
}

export async function getWalletBalances(
  walletAddress: string,
  rpcUrl?: string,
  opts?: { includeUnknown?: boolean },
): Promise<TokenBalance[]> {
  const conn = getSolanaConnection(rpcUrl);
  const pubkey = new PublicKey(walletAddress);
  const balances: TokenBalance[] = [];

  // SOL balance
  const solLamports = await conn.getBalance(pubkey);
  const solToken = getAllTokens().find((t) => t.symbol === "SOL");
  if (solToken) {
    balances.push({
      token: solToken,
      balance: solLamports / 10 ** solToken.decimals,
      usdValue: null,
    });
  }

  // SPL token accounts
  const tokenAccounts = await conn.getParsedTokenAccountsByOwner(pubkey, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  });

  for (const account of tokenAccounts.value) {
    const parsed = account.account.data.parsed?.info;
    if (!parsed) {
      continue;
    }
    const mint = parsed.mint as string;
    const amount = Number(parsed.tokenAmount?.uiAmount ?? 0);
    if (amount === 0) {
      continue;
    }

    const token = getTokenByMint(mint);
    if (token) {
      balances.push({ token, balance: amount, usdValue: null });
    } else if (opts?.includeUnknown) {
      // Include non-registry SPL tokens with mint as identifier
      const decimals = Number(parsed.tokenAmount?.decimals ?? 0);
      balances.push({
        token: {
          symbol: mint.slice(0, 6) + "...",
          name: `Unknown (${mint.slice(0, 8)}...)`,
          mint: new PublicKey(mint),
          decimals,
        },
        balance: amount,
        usdValue: null,
      });
    }
  }

  // Fetch USD prices
  const coingeckoIds = balances.map((b) => b.token.coingeckoId).filter((id): id is string => !!id);
  const prices = await fetchPrices(coingeckoIds);

  for (const b of balances) {
    if (b.token.coingeckoId && prices[b.token.coingeckoId] !== undefined) {
      b.usdValue = b.balance * prices[b.token.coingeckoId];
    }
  }

  return balances;
}

export async function getPortfolio(
  walletAddress: string,
  rpcUrl?: string,
  opts?: { includeUnknown?: boolean },
): Promise<PortfolioSummary> {
  const balances = await getWalletBalances(walletAddress, rpcUrl, opts);
  const totalUsdValue = balances.reduce((sum, b) => sum + (b.usdValue ?? 0), 0);
  return {
    wallet: walletAddress,
    totalUsdValue,
    balances,
    timestamp: new Date().toISOString(),
  };
}
