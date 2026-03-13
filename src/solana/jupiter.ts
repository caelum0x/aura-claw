import { VersionedTransaction } from "@solana/web3.js";
import { getTokenBySymbol } from "./tokens.js";

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputSymbol: string;
  outputSymbol: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: { label: string; inputMint: string; outputMint: string };
    percent: number;
  }>;
  raw: unknown;
}

export interface SwapTransaction {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

export async function getSwapQuote(params: {
  inputSymbol: string;
  outputSymbol: string;
  amount: number;
  slippageBps?: number;
  /** Use Jupiter dynamic slippage (recommended for volatile pairs). */
  dynamicSlippage?: boolean;
  /** Input mint address (use instead of inputSymbol for arbitrary tokens). */
  inputMint?: string;
  /** Output mint address (use instead of outputSymbol for arbitrary tokens). */
  outputMint?: string;
}): Promise<SwapQuote> {
  let inputMint = params.inputMint;
  let outputMint = params.outputMint;
  let inputDecimals = 9;

  if (!inputMint) {
    const inputToken = getTokenBySymbol(params.inputSymbol);
    if (!inputToken) {
      throw new Error(`Unknown input token: ${params.inputSymbol}`);
    }
    inputMint = inputToken.mint.toBase58();
    inputDecimals = inputToken.decimals;
  }

  if (!outputMint) {
    const outputToken = getTokenBySymbol(params.outputSymbol);
    if (!outputToken) {
      throw new Error(`Unknown output token: ${params.outputSymbol}`);
    }
    outputMint = outputToken.mint.toBase58();
  }

  const amountInSmallestUnit = Math.round(params.amount * 10 ** inputDecimals);

  const url = new URL(`${JUPITER_QUOTE_API}/quote`);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amountInSmallestUnit.toString());

  if (params.dynamicSlippage) {
    // Dynamic slippage: Jupiter auto-adjusts based on market conditions
    url.searchParams.set("dynamicSlippage", "true");
  } else {
    const slippageBps = params.slippageBps ?? 50;
    url.searchParams.set("slippageBps", slippageBps.toString());
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter quote failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    inputMint: inputMint,
    outputMint: outputMint,
    inputSymbol: params.inputSymbol,
    outputSymbol: params.outputSymbol,
    inAmount: String(data.inAmount),
    outAmount: String(data.outAmount),
    otherAmountThreshold: String(data.otherAmountThreshold),
    priceImpactPct: String(data.priceImpactPct),
    routePlan: (data.routePlan as SwapQuote["routePlan"]) ?? [],
    raw: data,
  };
}

export async function buildSwapTransaction(params: {
  quoteResponse: unknown;
  userPublicKey: string;
}): Promise<SwapTransaction> {
  const res = await fetch(`${JUPITER_QUOTE_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter swap transaction build failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { swapTransaction: string; lastValidBlockHeight: number };
  return data;
}

export async function deserializeSwapTransaction(
  swapTransactionBase64: string,
  _rpcUrl?: string,
): Promise<VersionedTransaction> {
  const txBuf = Buffer.from(swapTransactionBase64, "base64");
  return VersionedTransaction.deserialize(txBuf);
}
