import { STELLAR_NETWORKS, getStellarAggregatorQuote, mapQuoteResponseToStrategySwap, verifyStellarRouteBytes, type StellarQuoteResponse } from "@xoxno/sdk-js/stellar-lending";

/** XOXNO swap aggregator on testnet: the quote server searches Soroban DEX liquidity, the router executes the route. */
export const XOXNO_SWAP = {
  quoteUrl: STELLAR_NETWORKS.stellarTestnet.quoteUrl,
  router: STELLAR_NETWORKS.stellarTestnet.aggregatorRouter,
  networkPassphrase: STELLAR_NETWORKS.stellarTestnet.passphrase,
} as const;

export interface SwapRequest {
  from: string; // token contract C...
  to: string;
  amountIn: bigint; // base units of `from`
  slippage: number; // 0.01 = 1%
  /** Lowest output the caller accepts. Defaults to the quote's own floor, which is what a UI shows. */
  minOut?: bigint;
  /** Route limits; fewer hops and splits keep the transaction inside the network's budget. */
  maxHops?: number;
  maxSplits?: number;
}
export interface SwapQuote {
  from: string;
  to: string;
  amountIn: bigint;
  amountOut: bigint;
  /** The floor encoded in the route: the router reverts with SlippageExceeded below it. */
  minOut: bigint;
  priceImpact: number | null;
  rate: number;
  hops: Array<{ dex: string; pool: string; from: string; to: string }>;
  snapshotLedger: number | null;
  /** Execution input, never for display. */
  routeXdr: string;
}
export interface SwapDeployment { quoteUrl: string; router: string; networkPassphrase: string }

/** The quote server is unauthenticated: its deployment must match the router and network we trust before any quote is used. */
export async function checkSwapDeployment(d: SwapDeployment = XOXNO_SWAP, fetcher: typeof fetch = fetch): Promise<void> {
  const res = await fetcher(new URL("/api/v1/config", d.quoteUrl));
  if (!res.ok) throw new Error(`Swap quote server returned ${res.status} for /api/v1/config`);
  const config = await res.json() as { networkPassphrase?: string; router?: string | null; protocolVersion?: number };
  if (config.networkPassphrase !== d.networkPassphrase || config.router !== d.router) throw new Error(`Swap quote server is on another deployment (router ${config.router}, network ${config.networkPassphrase})`);
  if (config.protocolVersion !== 1) throw new Error(`Swap route protocol ${config.protocolVersion} is not supported`);
}

/** A fresh, executable quote whose route bytes are checked against the request, not against the response itself. */
export async function quoteSwap(req: SwapRequest, d: SwapDeployment = XOXNO_SWAP): Promise<SwapQuote> {
  if (req.from === req.to) throw new Error("from and to must differ");
  if (req.amountIn <= 0n) throw new Error("amountIn must be positive");
  if (!(req.slippage > 0 && req.slippage < 0.5)) throw new Error("slippage must be in (0, 0.5)");
  const q: StellarQuoteResponse = await getStellarAggregatorQuote({ from: req.from, to: req.to, amountIn: req.amountIn.toString(), slippage: req.slippage, maxHops: req.maxHops, maxSplits: req.maxSplits, fresh: true }, { baseUrl: d.quoteUrl });
  if (!q.routeXdr || !q.amountOutMin) throw new Error("Quote has no executable route");
  if (q.from !== req.from || q.to !== req.to || q.amountIn !== req.amountIn.toString()) throw new Error("Quote does not match the request");
  const accepted = req.minOut ?? BigInt(q.amountOutMin);
  mapQuoteResponseToStrategySwap(q, { expected: { tokenIn: req.from, tokenOut: req.to, amountIn: req.amountIn, minOut: accepted } });
  const route = verifyStellarRouteBytes(q.routeXdr, { tokenIn: req.from, tokenOut: req.to, amountIn: req.amountIn, minOut: accepted });
  return {
    from: q.from, to: q.to, amountIn: req.amountIn, amountOut: BigInt(q.amountOut), minOut: route.totalMinOut,
    priceImpact: q.priceImpact ?? null, rate: q.rate,
    hops: q.hops.map((h) => ({ dex: h.dex, pool: h.address, from: h.from, to: h.to })),
    snapshotLedger: q.snapshot?.ledger ?? null, routeXdr: q.routeXdr,
  };
}
