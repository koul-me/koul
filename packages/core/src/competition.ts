/**
 * The trading competition: its settings, how an entry is scored, and the shapes the leaderboard API returns. Pure
 * functions only; the indexer (keeper/scripts/competition.ts) reads the chain and the web routes read what it wrote.
 *
 * Scoring. An entry's value is everything the wallet holds, in US dollars at the Reflector price (never a testnet DEX
 * price, which anyone can push around): idle USDC, USDC supplied minus borrowed on XOXNO, and every swap token. Money
 * that came in from outside (the welcome grant, a deposit, a send from another wallet) is not profit, so it is netted
 * out: `pnl = value - net external inflows`, `return = pnl / net external inflows`. Swaps, supplies and repays move
 * money inside the wallet and change nothing until prices or interest do.
 *
 * XLM counts like any other token. Every entry starts with the same basket (100 USDC and the 10,000 test XLM friendbot
 * puts in a new wallet); XLM the autopilot sells is an ordinary swap, and XLM sent in from outside is added capital.
 * The wallet never pays its own fees (a transaction's source account does: the relayer or the keeper), so its XLM only
 * moves when it is sent or swapped.
 */
import type { Autopilot } from "./schema";

/** Settings a run of the competition is held to. Stored by the organiser; null fields are not decided yet. */
export interface CompetitionConfig {
  id: string;
  name: string;
  /** Ledgers bound the window exactly; dates are for people. */
  startLedger: number;
  endLedger: number | null;
  startsAt: string | null;
  endsAt: string | null;
  /** What the competition page shows as the starting capital, in USD; the capital check without `startingBasket`. */
  startingCapitalUsd: number;
  /**
   * What every entry starts with, in whole tokens by symbol ({ USDC: 100, XLM: 10000 }). Outside money above it, valued
   * at the entry's opening prices, flags the entry. Absent: the check compares outside USD with `startingCapitalUsd`.
   */
  startingBasket?: Record<string, number>;
  /** The most entries registration accepts (enforced by the register route; the indexer ignores it). Absent or null: no cap. */
  maxEntrants?: number | null;
  /** What the winners get, as the competition page shows it ("$500 prize pool"); null or absent shows no prize. */
  prize?: string | null;
  /** When true, a swap the autopilot did not make flags the entry; moving USDC in or out of lending does not. */
  autopilotOnly: boolean;
  /**
   * Tokens left out of value and flows. Default none. Leaving XLM out opens a hole: a rule sells XLM for USDC, the XLM
   * leg is not seen, and the USDC that comes back counts as a move inside the wallet, so value jumps with no flag.
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

const priceOf = (t: ScoredToken, prices: Prices): number | undefined => {
  const p = t.feed === null ? 1 : prices[t.feed];
  return p !== undefined && Number.isFinite(p) ? p : undefined;
};

/** The wallet's value in USD. A token without a price counts as 0 and is listed in `unpriced`. */
export function valueUsd(h: Holdings, tokens: readonly ScoredToken[], prices: Prices): { usd: number; unpriced: string[] } {
  let usd = units(h.supplied - h.borrowed, 7);
  const unpriced: string[] = [];
  for (const t of tokens) {
    const amount = h.tokens[t.symbol] ?? 0n;
    if (amount === 0n) continue;
    const price = priceOf(t, prices);
    if (price === undefined) { unpriced.push(t.symbol); continue; }
    usd += units(amount, t.decimals) * price;
  }
  return { usd, unpriced };
}

/** The starting basket in USD. A token the scoring does not value (excluded or unknown) counts 0; one without a price is listed. */
export function basketUsd(basket: Record<string, number>, tokens: readonly ScoredToken[], prices: Prices): { usd: number; unpriced: string[] } {
  let usd = 0;
  const unpriced: string[] = [];
  for (const [symbol, amount] of Object.entries(basket)) {
    const t = tokens.find((x) => x.symbol === symbol);
    if (!t || !amount) continue;
    const price = priceOf(t, prices);
    if (price === undefined) unpriced.push(symbol); else usd += amount * price;
  }
  return { usd, unpriced };
}

/**
 * Outside money for the capital check: the opening value no flow explains plus every token that came in from outside
 * minus what went out, all at the opening prices. Counting units rather than USD at the time means a price move between
 * creation and the first scoring changes nothing; the basket is valued at the same prices.
 */
export function outsideUsd(moved: Record<string, string>, openingUsd: number, tokens: readonly ScoredToken[], prices: Prices): number {
  let usd = openingUsd;
  for (const [symbol, amount] of Object.entries(moved)) {
    const t = tokens.find((x) => x.symbol === symbol);
    const price = t && priceOf(t, prices);
    if (t && price !== undefined) usd += units(BigInt(amount), t.decimals) * price;
  }
  return usd;
}

/** What the first scoring fixes for the capital check: the value no flow explains, flows at the opening prices; 0 under OPENING_TOLERANCE_USD. */
export function capitalOpening(value: number, moved: Record<string, string>, swapEdgeUsd: number, tokens: readonly ScoredToken[], prices: Prices): number {
  const unexplained = value - outsideUsd(moved, 0, tokens, prices) - swapEdgeUsd;
  return unexplained > OPENING_TOLERANCE_USD ? unexplained : 0;
}

/** Slack on the basket: 1% for interest and swaps before the window, plus a dollar for rounding and the 1 USDC that opens the XOXNO account. */
export const BASKET_TOLERANCE = 0.01;
export const BASKET_SLACK_USD = 1;

/** Outside money and the basket, both in USD at the entry's opening prices. */
export interface CapitalCheck { outsideUsd: number; basketUsd: number }

/** The capital check for an entry with a starting basket, once its opening prices are fixed; undefined otherwise. */
export function capitalCheck(state: Pick<EntryState, "openingPrices" | "capitalOpeningUsd" | "outsideUnits">, basket: Record<string, number> | undefined, tokens: readonly ScoredToken[]): CapitalCheck | undefined {
  if (!basket || !state.openingPrices) return undefined;
  return { outsideUsd: outsideUsd(state.outsideUnits ?? {}, state.capitalOpeningUsd ?? 0, tokens, state.openingPrices), basketUsd: basketUsd(basket, tokens, state.openingPrices).usd };
}

/** Rules that read the team's mock FX oracle (USD/TRY): a price the team sets, so a rule on it is not a fair trade. */
export function fxRules(autopilots: readonly (Pick<Autopilot, "rules"> | null)[]): number {
  return autopilots.reduce((n, ap) => n + (ap?.rules.filter((r) => r.conditions.some((c) => c.type === "FxPrice")).length ?? 0), 0);
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


/** One transfer of a scored token with a protocol (not outside money), from the wallet's side. */
export interface InsideMove { txHash: string; token: string; incoming: boolean; amount: bigint; usd: number }

/**
 * Sorts the moves inside the wallet by transaction. One the autopilot did not fire is manual, except the supply that
 * opens the XOXNO account. A token out and a different one back is a swap: what came back above what went out, both at
 * the oracle price, is the venue's edge (capital, not profit); a swap that paid less is a real loss.
 */
export function insideMoves(moves: readonly InsideMove[], fired: ReadonlySet<string>): { manualTxs: number; swapEdgeUsd: number } {
  const byTx = new Map<string, { outUsd: number; inUsd: number; tokens: Set<string> }>();
  for (const m of moves) {
    const t = byTx.get(m.txHash) ?? { outUsd: 0, inUsd: 0, tokens: new Set<string>() };
    if (m.incoming) t.inUsd += m.usd; else t.outUsd += m.usd;
    t.tokens.add(m.token);
    byTx.set(m.txHash, t);
  }
  let manualTxs = 0, swapEdgeUsd = 0;
  for (const [hash, t] of byTx) {
    // Only a swap the autopilot did not make is a manual move. USDC alone going to or coming back from lending
    // (Put to work, a withdraw, the 1 USDC that opens the XOXNO account) moves the person's own money and trades
    // nothing, so it no longer takes an entry off the board (changed 2026-10-31, after the app's own Put to work
    // button flagged two entries).
    if (!fired.has(hash) && t.tokens.size >= 2) manualTxs++;
    if (t.tokens.size >= 2 && t.outUsd > 0 && t.inUsd > t.outUsd) swapEdgeUsd += t.inUsd - t.outUsd;
  }
  return { manualTxs, swapEdgeUsd };
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
  /** autopilotOnly and a manual move, capital above the starting basket, or a rule on the mock FX oracle. */
  flagged: boolean;
  flagReasons: string[];
  ledger: number;
  updatedAt: number;
}

/**
 * Why an entry is flagged. `capital` (with a starting basket) compares outside money with the basket at the opening
 * prices; without it, outside USD is held to `startingCapitalUsd`. `fx`: the autopilot used a USD/TRY rule in the window.
 */
export function flagsFor(totals: EntryTotals & { swapEdgeUsd?: number }, config: Pick<CompetitionConfig, "autopilotOnly" | "startingCapitalUsd">, extra: { capital?: CapitalCheck; fx?: boolean } = {}): string[] {
  const reasons: string[] = [];
  if (config.autopilotOnly && totals.manualTxs > 0) reasons.push(`${totals.manualTxs} move${totals.manualTxs === 1 ? "" : "s"} not made by the autopilot`);
  if (extra.capital) {
    const { outsideUsd: o, basketUsd: b } = extra.capital;
    if (o > b * (1 + BASKET_TOLERANCE) + BASKET_SLACK_USD) reasons.push(`added capital: ${o.toFixed(2)} USD in at opening prices, starting basket worth ${b.toFixed(2)}`);
  } else {
    // Capital is outside money only; a swap's edge is netted out but is not something the person added. A cent of
    // slack for rounding in the grant's own price.
    const capital = totals.netInUsd - (totals.swapEdgeUsd ?? 0);
    if (capital > config.startingCapitalUsd + 0.01) reasons.push(`added capital: ${capital.toFixed(2)} USD in, ${config.startingCapitalUsd} allowed`);
  }
  if (extra.fx) reasons.push("a rule on USD/TRY, a test price the team sets");
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
/** Handles that would collide with the competition's own pages (/compete/leaderboard). */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set(["leaderboard", "join", "rules", "admin", "koul"]);

// What the web routes return (GET /api/competition, /leaderboard, /entrant/:handle).

export interface CompetitionInfo { config: CompetitionConfig | null; entrants: number; updatedAt: number | null }

export interface LeaderboardRow {
  rank: number | null; handle: string; wallet: string; valueUsd: number; pnlUsd: number; returnPct: number | null; flagged: boolean;
  /** Confirmed but not scored yet (the indexer runs every 15 minutes): listed so a new entrant sees themselves at once. */
  pending?: boolean;
}
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
export interface EntrantRecord { wallet: string; handle: string; email: string; registeredAt: number; verifiedAt: number | null; acceptedTermsAt?: number }

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
  /** Reflector prices at the first scoring: the capital check values the basket and outside money at these. */
  openingPrices?: Prices;
  /** `openingUsd` again with the window's flows valued at `openingPrices`, for the capital check. */
  capitalOpeningUsd?: number;
  /** Net outside base units per token symbol over the window (+ in, - out), for the capital check. */
  outsideUnits?: Record<string, string>;
  /** The first ledger a run saw the autopilot with a USD/TRY rule; once set it stays, and rules are no longer read. */
  fxSeenLedger?: number;
  /** Points pushed onto the history list, so it is only trimmed once it can be over HISTORY_POINTS. */
  historyPoints?: number;
}

/** Below this, an unexplained opening value is interest or rounding, not money from before the window. */
export const OPENING_TOLERANCE_USD = 1;

// ---- The indexer's Redis budget ----
//
// Production Redis is Upstash's free plan: 500,000 commands a month, each command inside a pipeline counted, but one
// MGET or MSET is one command whatever the number of keys. So the indexer reads and writes the per-entry strings in a
// few MGET/MSETs a run, and only the lists (flows, history) cost a command per entry.

/** The longest an entry's history list gets (hourly points: about four months); its flows list keeps FLOW_POINTS. */
export const HISTORY_POINTS = 3000;
export const FLOW_POINTS = 500;
/** History pushes a day across all entries. Up to 300 entries that is a point an hour each; past it the interval stretches. */
export const HISTORY_PUSHES_PER_DAY = 7200;
const HOUR_MS = 3600_000;

/** How often each entry gets a history point: hourly, or longer once the field is big enough to spend HISTORY_PUSHES_PER_DAY. */
export function historyEveryMs(entries: number): number {
  return Math.max(HOUR_MS, Math.ceil((entries * 24 * HOUR_MS) / HISTORY_PUSHES_PER_DAY));
}

/** Largest request body the indexer sends (an MSET, a pipeline of list pushes); Upstash's free plan refuses over 1 MB. */
export const REQUEST_MAX_BYTES = 400_000;

const utf8 = (s: string) => new TextEncoder().encode(s).length;

/** A command's size in a request body: each part as a JSON string, with its quotes and comma. */
export const commandBytes = (parts: readonly (string | number)[]): number => parts.reduce<number>((n, p) => n + utf8(String(p)) + 3, 2);

/** Items in order, in groups whose sizes add up to at most `maxBytes`; an item larger than that goes alone. */
export function chunkBySize<T>(items: readonly T[], bytes: (item: T) => number, maxBytes = REQUEST_MAX_BYTES): T[][] {
  const out: T[][] = [];
  let group: T[] = [], size = 0;
  for (const item of items) {
    const n = bytes(item);
    if (group.length && size + n > maxBytes) { out.push(group); group = []; size = 0; }
    group.push(item);
    size += n;
  }
  if (group.length) out.push(group);
  return out;
}

/** Key-value pairs in groups that each fit one MSET request. */
export function chunkPairs(pairs: readonly (readonly [string, string])[], maxBytes = REQUEST_MAX_BYTES): (readonly [string, string])[][] {
  return chunkBySize(pairs, ([k, v]) => utf8(k) + utf8(v) + 6, maxBytes);
}
