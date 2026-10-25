import { STELLAR_NETWORKS, encodeStrategyPayloadToRouteXdr, getStellarAggregatorQuote, mapQuoteResponseToStrategySwap, verifyStellarRouteBytes, type StellarQuoteResponse, type StellarSwapVenue } from "@xoxno/sdk-js/stellar-lending";

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
export interface SwapHop { dex: string; pool: string; from: string; to: string }
export interface SwapQuote {
  from: string;
  to: string;
  amountIn: bigint;
  amountOut: bigint;
  /** The floor encoded in the route: the router reverts with SlippageExceeded below it. */
  minOut: bigint;
  priceImpact: number | null;
  rate: number;
  hops: SwapHop[];
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

/** Quote-server venue labels to the router's adapters; the router runs Aquarius CLMM pools through its Aquarius adapter. */
const VENUES: Record<string, StellarSwapVenue> = { Aquarius: "Aquarius", AquariusClmm: "Aquarius", Soroswap: "Soroswap", Phoenix: "Phoenix", Sushi: "Sushi", Comet: "CometDex", Curve: "Curve" };

/** The same pools walked the other way: a route one direction found, for the opposite swap. */
export function reverseHops(hops: SwapHop[]): SwapHop[] {
  return [...hops].reverse().map((h) => ({ dex: h.dex, pool: h.pool, from: h.to, to: h.from }));
}

/**
 * A single-path route over known pools, without the quote server's search. Useful when the server's best route runs
 * through archived pools. The floor is `expectedOut` less `slippage`; take `expectedOut` from a simulation of the same
 * route with a floor of one unit, since nothing here prices the pools.
 */
export function pathRoute(r: { from: string; to: string; amountIn: bigint; expectedOut: bigint; slippage: number; hops: SwapHop[] }): SwapQuote {
  if (!r.hops.length || r.hops[0]!.from !== r.from || r.hops.at(-1)!.to !== r.to || r.hops.some((h, i) => i > 0 && r.hops[i - 1]!.to !== h.from)) throw new Error("Hops do not chain from the input to the output token");
  if (!(r.slippage >= 0 && r.slippage < 0.5)) throw new Error("slippage must be in [0, 0.5)");
  const venue = (dex: string) => { const v = VENUES[dex]; if (!v) throw new Error(`No router adapter for ${dex}`); return v; };
  const minOut = r.expectedOut * BigInt(1_000_000 - Math.floor(r.slippage * 1_000_000)) / 1_000_000n;
  if (minOut < 1n) throw new Error("expectedOut leaves no minimum output");
  const routeXdr = encodeStrategyPayloadToRouteXdr({
    tokenIn: r.from, tokenOut: r.to, totalMinOut: minOut.toString(),
    paths: [{ splitPpm: 1_000_000, hops: r.hops.map((h) => ({ venue: venue(h.dex), pool: h.pool, tokenIn: h.from, tokenOut: h.to })) }],
  });
  const route = verifyStellarRouteBytes(routeXdr, { tokenIn: r.from, tokenOut: r.to, amountIn: r.amountIn, minOut });
  return { from: r.from, to: r.to, amountIn: r.amountIn, amountOut: r.expectedOut, minOut: route.totalMinOut, priceImpact: null, rate: 0, hops: r.hops, snapshotLedger: null, routeXdr };
}
