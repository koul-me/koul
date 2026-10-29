/**
 * The trading competition: its settings, how an entry is scored, and the shapes the leaderboard API returns. Pure
 * functions only; the indexer (keeper/scripts/competition.ts) reads the chain and the web routes read what it wrote.
 *
 * Scoring. An entry's value is everything the wallet holds, in US dollars at the Reflector price (never a testnet DEX
 * price, which anyone can push around): idle USDC, USDC supplied minus borrowed on XOXNO, and every swap token. Money
 * that came in from outside (the welcome grant, a deposit, a send from another wallet) is not profit, so it is netted
 * out: `pnl = value - net external inflows`, `return = pnl / net external inflows`. Swaps, supplies and repays move
 * money inside the wallet and change nothing until prices or interest do.
 */

/** Settings a run of the competition is held to. Stored by the organiser; null fields are not decided yet. */
export interface CompetitionConfig {
  id: string;
  name: string;
  /** Ledgers bound the window exactly; dates are for people. */
  startLedger: number;
  endLedger: number | null;
  startsAt: string | null;
  endsAt: string | null;
  /** The capital every entry starts with, in USD (the welcome grant). */
  startingCapitalUsd: number;
  /** When true, a move the autopilot did not make (a manual swap, supply or withdraw) flags the entry. */
  autopilotOnly: boolean;
  /**
   * Tokens left out of value and flows. Default ["XLM"]: every new wallet gets 10,000 test XLM for fees, which would
   * otherwise be most of its value and make every score follow the XLM price.
   */
  excludeTokens?: string[];
}

/** One token the scoring values. `feed` is its Reflector symbol; null means it is worth $1 (USDC). */
export interface ScoredToken { symbol: string; id: string; decimals: number; feed: string | null }

export interface Holdings {
  /** Base units per token symbol, USDC included as idle USDC. */
  tokens: Record<string, bigint>;
  /** XOXNO positions in USDC base units (7 decimals). */
  supplied: bigint;
  borrowed: bigint;
}

/** USD per whole token, by Reflector feed symbol. */
export type Prices = Record<string, number>;

const units = (amount: bigint, decimals: number) => Number(amount) / 10 ** decimals;

/** The wallet's value in USD. A token without a price counts as 0 and is listed in `unpriced`. */
export function valueUsd(h: Holdings, tokens: readonly ScoredToken[], prices: Prices): { usd: number; unpriced: string[] } {
  let usd = units(h.supplied - h.borrowed, 7);
  const unpriced: string[] = [];
  for (const t of tokens) {
    const amount = h.tokens[t.symbol] ?? 0n;
    if (amount === 0n) continue;
    const price = t.feed === null ? 1 : prices[t.feed];
    if (price === undefined || !Number.isFinite(price)) { unpriced.push(t.symbol); continue; }
    usd += units(amount, t.decimals) * price;
  }
  return { usd, unpriced };
}

/**
 * Who a transfer was with, from the wallet's side. A classic account (G...) is always outside money. A contract is
 * outside money when it is another smart wallet (same wasm as the entrants' wallets); any other contract is a protocol
 * (XOXNO, the aggregator, a DEX pair) and the transfer is a move inside the wallet's own money.
 */
export function counterpartyKind(address: string, isSmartWallet: (contract: string) => boolean): "external" | "internal" {
  if (address.startsWith("G") || address.startsWith("M")) return "external";
  return isSmartWallet(address) ? "external" : "internal";
}

export interface Flow {
  ledger: number;
  txHash: string;
  token: string;
  /** Signed from the wallet's side: + in, - out, in the token's base units. */
  amount: string;
  usd: number;
  counterparty: string;
}

export interface EntryTotals {
  /** External money in minus external money out, in USD at the price when it moved. */
  netInUsd: number;
  inUsd: number;
  outUsd: number;
  /** Transactions that moved the wallet's money inside it without the autopilot. */
  manualTxs: number;
}

export function score(value: number, netInUsd: number): { pnlUsd: number; returnPct: number | null } {
  const pnlUsd = value - netInUsd;
  return { pnlUsd, returnPct: netInUsd > 0 ? (pnlUsd / netInUsd) * 100 : null };
}

/** What the indexer stores per entry after each run. */
export interface EntrantScore extends EntryTotals {
  wallet: string;
  handle: string;
  valueUsd: number;
  pnlUsd: number;
  returnPct: number | null;
  /** Tokens it holds that had no price this run (valued at 0). */
  unpriced: string[];
  /** What swaps paid above fair value at the oracle price; netted out of the return (see EntryState). */
  swapEdgeUsd: number;
  /** autopilotOnly and a manual move, or capital above the starting amount. */
  flagged: boolean;
  flagReasons: string[];
  ledger: number;
  updatedAt: number;
}

export function flagsFor(totals: EntryTotals & { swapEdgeUsd?: number }, config: Pick<CompetitionConfig, "autopilotOnly" | "startingCapitalUsd">): string[] {
  const reasons: string[] = [];
  if (config.autopilotOnly && totals.manualTxs > 0) reasons.push(`${totals.manualTxs} move${totals.manualTxs === 1 ? "" : "s"} not made by the autopilot`);
  // Capital is outside money only; a swap's edge is netted out but is not something the person added. A cent of
  // slack for rounding in the grant's own price.
  const capital = totals.netInUsd - (totals.swapEdgeUsd ?? 0);
  if (capital > config.startingCapitalUsd + 0.01) reasons.push(`added capital: ${capital.toFixed(2)} USD in, ${config.startingCapitalUsd} allowed`);
  return reasons;
}

/** Best return first; entries without a return (nothing in yet) last; ties share a rank. */
export function rank<T extends Pick<EntrantScore, "returnPct" | "flagged">>(rows: T[]): (T & { rank: number | null })[] {
  const sorted = [...rows].sort((a, b) => (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity));
  let last: number | null = null, lastRank = 0, counted = 0;
  return sorted.map((r) => {
    if (r.flagged || r.returnPct === null) return { ...r, rank: null };
    counted++;
    const rounded = Math.round(r.returnPct * 10_000) / 10_000;
    if (rounded !== last) { lastRank = counted; last = rounded; }
    return { ...r, rank: lastRank };
  });
}

/** Handles: 3 to 20 letters, digits or underscores, compared in lower case. */
export const HANDLE_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

// What the web routes return (GET /api/competition, /leaderboard, /entrant/:handle).

export interface CompetitionInfo { config: CompetitionConfig | null; entrants: number; updatedAt: number | null }

export interface LeaderboardRow { rank: number | null; handle: string; wallet: string; valueUsd: number; pnlUsd: number; returnPct: number | null; flagged: boolean }
export interface Leaderboard { rows: LeaderboardRow[]; total: number; offset: number; updatedAt: number | null }

export interface HistoryPoint { at: number; valueUsd: number; returnPct: number | null }
export interface EntrantView { score: EntrantScore | null; rank: number | null; history: HistoryPoint[]; registeredAt: number }

/** Where everything lives in Redis; the indexer writes, the web routes read and register. */
export const COMP_KEYS = {
  config: "koul:comp:config",
  /** SET of wallets whose email is verified: the ones the indexer scores. */
  entrants: "koul:comp:entrants",
  entrant: (wallet: string) => `koul:comp:entrant:${wallet}`,
  handle: (handle: string) => `koul:comp:handle:${handle.toLowerCase()}`,
  /** Per entry: totals, the ledger its flows are read up to, the last history point. */
  totals: (wallet: string) => `koul:comp:totals:${wallet}`,
  flows: (wallet: string) => `koul:comp:flows:${wallet}`,
  score: (wallet: string) => `koul:comp:score:${wallet}`,
  history: (wallet: string) => `koul:comp:history:${wallet}`,
  /** The whole ranked board as one JSON array of LeaderboardRow, rewritten each run. */
  board: "koul:comp:board",
  updatedAt: "koul:comp:updated",
  challenge: (wallet: string) => `koul:comp:challenge:${wallet}`,
  pending: (token: string) => `koul:comp:pending:${token}`,
} as const;

/** What the registration stores per entrant. The email stays out of every public response. */
export interface EntrantRecord { wallet: string; handle: string; email: string; registeredAt: number; verifiedAt: number | null }

/** The indexer's running totals per entry. `toLedger` is the last ledger its events were read through. */
export interface EntryState extends EntryTotals {
  toLedger: number;
  lastHistoryAt: number;
  flows: number;
  /**
   * What swaps paid above their fair value at the Reflector price, summed over the window. Testnet pools price their
   * token copies loosely, so a buy-then-sell loop can mint USDC (load test, 2026-10-28: 100 USDC became 194 in four
   * round trips). That edge is counted as capital, not profit, so only price moves over time score.
   */
  swapEdgeUsd: number;
  /** The wallet's XOXNO account (its position NFT), once found; null while it has none, re-checked now and then. */
  accountId?: string | null;
  accountCheckedAt?: number;
  /** Tokens the wallet has sent or received in the window; custom tokens are only read for these. */
  tokensSeen?: string[];
  /**
   * Value the wallet already had that no flow in the window explains (money that came in before the network's event
   * window), fixed at the entry's first scoring and counted as capital, so it can never show up as profit.
   */
  openingUsd: number;
}

/** Below this, an unexplained opening value is interest or rounding, not money from before the window. */
export const OPENING_TOLERANCE_USD = 1;
