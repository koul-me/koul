/**
 * Traction: who uses Koul and how much, from the router's own events and views. The keeper's `pnpm traction` script
 * reads the router's events hourly and folds them in here; the private /status/traction page reads the result. Pure
 * functions only, so a re-run over the same events changes nothing and every number is testable.
 *
 * Where it lives (Upstash Redis, the free plan's 500,000 commands a month shared with the keeper and the indexer):
 * the whole state, cursor included, is one JSON string written with one SET, so the cursor and the aggregates it
 * covers can never disagree. Live counts go on a capped list once a run. Team wallets are a set the team can add to.
 * Per-day numbers are kept per wallet, so tagging a wallet as team later moves its history out of organic too.
 */
import type { Prices } from "./competition";
import { SWAP_TOKENS, USDC_TESTNET } from "./tokens";

export const TRACTION_KEYS = {
  /** JSON `TractionState`: cursor and every aggregate, one SET a run. */
  state: "koul:traction:state",
  /** LIST of JSON `TractionSnapshot`, newest first, `SNAPSHOT_POINTS` long: the live counts over time. */
  snapshots: "koul:traction:snapshots",
  /** SET of team wallets, shown apart from organic users. `SADD koul:traction:team <wallet>` tags one more. */
  team: "koul:traction:team",
  /** ZSET wallet -> ms, added by the test USDC route on a wallet's first grant: wallets created, autopilot or not. */
  created: "koul:traction:created",
} as const;

/** An hourly snapshot for 60 days. */
export const SNAPSHOT_POINTS = 24 * 60;
/** Hours kept for the rolling 24 h and 7 d trade counts. */
const HOURS_KEPT = 7 * 24 + 1;
const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

/** The team's own bots (2026-10-31), always team whether or not the set has them yet. */
export const TEAM_WALLETS = [
  "CAVKIFUHM6AOSVEGTSG2V7KEOMDH2Q54F4IAY6ZEKRIDJZ7BBV3PYSBG",
  "CALZD4CAUC2QVPL274YPHPCUYX676C3YIE3ERNDEUTKTOYQ5EAJ65E5J",
  "CAHJNL2VE5S7G5KXOB4666W33YPUOZKIK7GERXVBQY7CWX5Z6XFULVVH",
] as const;

/**
 * The 2026-10-28 load test (PLAN.md): wallets made on app.koul.me between 14:22 and 15:27 UTC, each looping USDC and
 * ETH through the keeper for under an hour. A wallet is tagged when its first autopilot was saved in this window and
 * everything it ever ran was a USDC/ETH swap; 57 wallets match (PLAN.md says 56; the first two, at 14:22 and 14:24,
 * look like the trial before the batch).
 */
export const LOAD_TEST = { from: Date.parse("2026-10-28T14:00:00Z"), to: Date.parse("2026-10-28T16:00:00Z"), tokens: ["USDC", "ETH"] } as const;

export type TractionGroup = "organic" | "team" | "loadtest";

export interface TractionWallet {
  address: string;
  /** First AutopilotSet seen, ms; null for a wallet only the views know (its first save is older than the history). */
  firstSeen: number | null;
  lastTrade: number | null;
  /** Hash of the transaction of the last trade, for checking it on an explorer. Absent in state written before it existed. */
  lastTx?: string;
  /** Fired events: every rule the router ran, a swap or a lending move. */
  trades: number;
  swaps: number;
  volumeUsd: number;
  /** What the swaps paid out, at the same prices (USDC at $1): testnet pools overpay, so this runs well above volumeUsd. Absent in state written before it existed. */
  volumeOutUsd?: number;
  sets: number;
  clears: number;
  /** Autopilot ids ever saved. */
  ids: number[];
  kinds: Record<string, number>;
  /** Symbols this wallet's swaps moved (a contract id where the token is unknown). */
  tokens: string[];
  /** From the views at the last run: autopilots stored now and their rules. */
  live: { autopilots: number; rules: number };
}

/** One wallet's day: [fired, swaps, volumeUsd, sets, clears, volumeOutUsd]; cells written before the last one existed have five. */
export type DayCell = [number, number, number, number, number, number?];

export interface TractionState {
  v: 1;
  router: string;
  /** RPC paging token after the last event read; null before the first run. */
  cursor: string | null;
  /** Id of the last event counted: events at or before it are skipped, so a re-run never counts one twice. */
  lastEventId: string | null;
  toLedger: number;
  /** Close time of the oldest ledger the first run could read: nothing before it is in here. */
  historyFrom: number | null;
  /** Stretches of ledgers lost because no run read them inside the RPC's seven days. */
  gaps: { fromLedger: number; toLedger: number }[];
  wallets: TractionWallet[];
  /** UTC date ("2026-10-28") -> wallet index -> that wallet's day. */
  days: Record<string, Record<string, DayCell>>;
  /** Hour start (ms) -> wallet index -> fired that hour, the last seven days only. */
  hours: Record<string, Record<string, number>>;
  /** Swaps whose input token had no price at the run that read them (counted as $0). */
  unpriced: number;
  updatedAt: number;
}

export interface TractionSnapshot {
  at: number;
  ledger: number;
  /** Per group at the time: users with an autopilot, autopilots, rules. `team` includes the load test. */
  organic: LiveCounts;
  team: LiveCounts;
}
export interface LiveCounts { users: number; autopilots: number; rules: number }

export type RouterEvent =
  | { id: string; at: number; type: "autopilot_set"; user: string; autopilotId: number; rules: number }
  | { id: string; at: number; type: "autopilot_cleared"; user: string; autopilotId: number }
  | { id: string; at: number; type: "fired"; user: string; kind: string; amount: bigint; tx?: string }
  | { id: string; at: number; type: "swapped"; user: string; tokenIn: string; tokenOut: string; amountIn: bigint; amountOut: bigint };

export function emptyTraction(router: string): TractionState {
  return { v: 1, router, cursor: null, lastEventId: null, toLedger: 0, historyFrom: null, gaps: [], wallets: [], days: {}, hours: {}, unpriced: 0, updatedAt: 0 };
}

/** The ledger an RPC paging token points at: the high 32 bits of its TOID. */
export function cursorLedger(cursor: string): number {
  return Number(BigInt(cursor.split("-")[0]!) >> 32n);
}

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * A router event from its decoded topics and body (`scValToNative`), or null for anything else. The router names its
 * events after the structs (`fired`, `swapped`, `autopilot_set`, `autopilot_cleared`) with the user as the second topic.
 */
export function routerEvent(id: string, at: number, topics: unknown[], value: unknown, tx?: string): RouterEvent | null {
  const [name, user] = topics;
  if (typeof user !== "string" || !value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (name === "autopilot_set") return { id, at, type: name, user, autopilotId: Number(v.autopilot_id), rules: Number(v.rules) };
  if (name === "autopilot_cleared") return { id, at, type: name, user, autopilotId: Number(v.autopilot_id) };
  // Router v1 (before 2026-09-20) emitted `Fired { branch, ... }`, not an autopilot run.
  if (name === "fired" && typeof v.kind === "string") return { id, at, type: name, user, kind: v.kind, amount: BigInt(v.amount as bigint), ...(tx ? { tx } : {}) };
  if (name === "swapped") return { id, at, type: name, user, tokenIn: String(v.token_in), tokenOut: String(v.token_out), amountIn: BigInt(v.amount_in as bigint), amountOut: BigInt(v.amount_out as bigint) };
  return null;
}

const KNOWN = [{ symbol: USDC_TESTNET.symbol, id: USDC_TESTNET.id, decimals: USDC_TESTNET.decimals, feed: null as string | null }, ...SWAP_TOKENS.map((t) => ({ symbol: t.symbol as string, id: t.id as string, decimals: t.decimals as number, feed: t.feed as string | null }))];
const BY_ID = new Map(KNOWN.map((t) => [t.id, t]));
export const tokenSymbol = (id: string) => BY_ID.get(id)?.symbol ?? id;
/** Feeds a swap's input or output can need a price from. */
export const TRACTION_FEEDS = [...new Set(KNOWN.map((t) => t.feed).filter((f): f is string => f !== null))];

/**
 * An amount of a token in USD at the Reflector price when the run reads it (USDC at $1); null when it has no price.
 * Volume is the input this way. The output priced the same way is shown beside it: testnet pools pay several times
 * the oracle price, so it runs well above the input and would not survive mainnet.
 */
export function swapUsd(token: string, amount: bigint, prices: Prices): number | null {
  const t = BY_ID.get(token);
  if (!t) return null;
  const price = t.feed === null ? 1 : prices[t.feed];
  return price === undefined ? null : (Number(amount) / 10 ** t.decimals) * price;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The state after `events` (in ledger order). Works on a copy; events at or before `lastEventId` are skipped, so the
 * same events applied twice, or overlapping batches, count once. Hours older than seven days before `now` are dropped.
 */
export function applyEvents(prev: TractionState, events: RouterEvent[], prices: Prices, now: number): TractionState {
  const s: TractionState = structuredClone(prev);
  const index = new Map(s.wallets.map((w, i) => [w.address, i]));
  const walletOf = (address: string) => {
    let i = index.get(address);
    if (i === undefined) {
      i = s.wallets.push({ address, firstSeen: null, lastTrade: null, trades: 0, swaps: 0, volumeUsd: 0, sets: 0, clears: 0, ids: [], kinds: {}, tokens: [], live: { autopilots: 0, rules: 0 } }) - 1;
      index.set(address, i);
    }
    return i;
  };
  for (const e of events) {
    if (s.lastEventId !== null && e.id <= s.lastEventId) continue;
    s.lastEventId = e.id;
    const i = walletOf(e.user);
    const w = s.wallets[i]!;
    const day = (s.days[utcDay(e.at)] ??= {});
    const cell = (day[i] ??= [0, 0, 0, 0, 0]);
    if (e.type === "autopilot_set") {
      w.sets++; cell[3]++;
      // The first save in the history; a wallet seen first through its runs (history cut) still gets its first save.
      w.firstSeen = w.firstSeen === null ? e.at : Math.min(w.firstSeen, e.at);
      if (!w.ids.includes(e.autopilotId)) w.ids.push(e.autopilotId);
    } else if (e.type === "autopilot_cleared") {
      w.clears++; cell[4]++;
    } else if (e.type === "fired") {
      w.trades++; cell[0]++;
      w.kinds[e.kind] = (w.kinds[e.kind] ?? 0) + 1;
      if (e.tx && e.at >= (w.lastTrade ?? 0)) w.lastTx = e.tx;
      w.lastTrade = Math.max(w.lastTrade ?? 0, e.at);
      const hour = String(Math.floor(e.at / HOUR_MS) * HOUR_MS);
      const h = (s.hours[hour] ??= {});
      h[i] = (h[i] ?? 0) + 1;
    } else {
      const usd = swapUsd(e.tokenIn, e.amountIn, prices);
      if (usd === null) s.unpriced++;
      w.swaps++; cell[1]++;
      const out = swapUsd(e.tokenOut, e.amountOut, prices) ?? 0;
      w.volumeUsd = cents(w.volumeUsd + (usd ?? 0));
      w.volumeOutUsd = cents((w.volumeOutUsd ?? 0) + out);
      cell[2] = cents(cell[2] + (usd ?? 0));
      cell[5] = cents((cell[5] ?? 0) + out);
      for (const t of [tokenSymbol(e.tokenIn), tokenSymbol(e.tokenOut)]) if (!w.tokens.includes(t)) w.tokens.push(t);
    }
  }
  const cutoff = now - HOURS_KEPT * HOUR_MS;
  for (const h of Object.keys(s.hours)) if (Number(h) < cutoff) delete s.hours[h];
  return s;
}

/**
 * Sets every wallet's live autopilots and rules from the views (`list_users`, `list_ids`, `get_autopilot`); a wallet
 * the views know but no event in the history mentions is added with no first-seen time. Works on a copy.
 */
export function applyLive(prev: TractionState, live: Map<string, { autopilots: number; rules: number }>): TractionState {
  const s: TractionState = structuredClone(prev);
  const known = new Set(s.wallets.map((w) => w.address));
  for (const address of live.keys()) {
    if (!known.has(address)) s.wallets.push({ address, firstSeen: null, lastTrade: null, trades: 0, swaps: 0, volumeUsd: 0, sets: 0, clears: 0, ids: [], kinds: {}, tokens: [], live: { autopilots: 0, rules: 0 } });
  }
  for (const w of s.wallets) w.live = live.get(w.address) ?? { autopilots: 0, rules: 0 };
  return s;
}

/** The load test's pattern: first save inside its window, and only USDC/ETH swaps ever run. */
export function isLoadTest(w: TractionWallet): boolean {
  return w.firstSeen !== null && w.firstSeen >= LOAD_TEST.from && w.firstSeen < LOAD_TEST.to && w.trades > 0
    && Object.keys(w.kinds).every((k) => k === "swap") && w.tokens.every((t) => (LOAD_TEST.tokens as readonly string[]).includes(t));
}

/** Team when tagged (or one of the bots), load test when it matches the pattern, organic otherwise. */
export function groupOf(w: TractionWallet, team: ReadonlySet<string>): TractionGroup {
  if (team.has(w.address) || (TEAM_WALLETS as readonly string[]).includes(w.address)) return "team";
  return isLoadTest(w) ? "loadtest" : "organic";
}

/** organic, or everyone else (team and load test) for the "team" side of a headline. */
const side = (g: TractionGroup): "organic" | "team" => (g === "organic" ? "organic" : "team");

export function snapshotOf(s: TractionState, team: ReadonlySet<string>, at: number, ledger: number): TractionSnapshot {
  const out: TractionSnapshot = { at, ledger, organic: { users: 0, autopilots: 0, rules: 0 }, team: { users: 0, autopilots: 0, rules: 0 } };
  for (const w of s.wallets) {
    const c = out[side(groupOf(w, team))];
    if (w.live.autopilots > 0) c.users++;
    c.autopilots += w.live.autopilots; c.rules += w.live.rules;
  }
  return out;
}

// ---- What the page shows ----

export interface TractionCounts {
  /** Users with an autopilot stored now, live autopilots and their rules (from the views at the last run). */
  users: number;
  autopilots: number;
  rules: number;
  /** Wallets that ever saved an autopilot, in the history. */
  usersEver: number;
  trades24h: number;
  trades7d: number;
  trades: number;
  swaps: number;
  volumeUsd: number;
  volumeOutUsd: number;
  /** Trades over autopilots ever saved; null with none. */
  tradesPerAutopilot: number | null;
  /** From `koul:traction:created`, which only counts from the deploy that added it. */
  created: number;
  kinds: Record<string, number>;
}
export interface TractionDay { day: string; at: number; newUsers: number; cumulativeUsers: number; trades: number; swaps: number; volumeUsd: number; volumeOutUsd: number; active: number; sets: number; clears: number }
export interface TractionRow { address: string; group: TractionGroup; firstSeen: number | null; lastTrade: number | null; lastTx: string | null; trades: number; swaps: number; volumeUsd: number; volumeOutUsd: number; autopilots: number; rules: number; tokens: string[] }
export interface TractionSummary {
  updatedAt: number;
  toLedger: number;
  historyFrom: number | null;
  gaps: TractionState["gaps"];
  unpriced: number;
  /** Every wallet; the page shows only this. organic and team stay for asking how much of it is the team's. */
  all: TractionCounts;
  organic: TractionCounts;
  team: TractionCounts;
  /** Every UTC day from the first event to `now`: organic only, every wallet, and every wallet but the load test. */
  days: { organic: TractionDay[]; all: TractionDay[]; noLoadTest: TractionDay[] };
  /** The last snapshot of each UTC day, oldest first. */
  live: TractionSnapshot[];
  /** Created, then saved an autopilot, then traded: every wallet created since `since`. */
  funnel: { since: number | null; created: number; withAutopilot: number; traded: number };
  wallets: TractionRow[];
  loadTest: number;
  /** Live autopilots the load test wallets hold now; nobody touches them, so it is also what each snapshot held. */
  loadTestLive: number;
}

const zeroCounts = (): TractionCounts => ({ users: 0, autopilots: 0, rules: 0, usersEver: 0, trades24h: 0, trades7d: 0, trades: 0, swaps: 0, volumeUsd: 0, volumeOutUsd: 0, tradesPerAutopilot: null, created: 0, kinds: {} });

/**
 * Everything the page shows, split organic / team with today's team set (so a newly tagged wallet leaves organic in
 * every past day too, except in the live-autopilots history, whose snapshots were split when they were taken).
 * `created` is the ZSET as [wallet, ms] pairs; `snapshots` newest first, as the list holds them.
 */
export function tractionSummary(s: TractionState, snapshots: TractionSnapshot[], team: ReadonlySet<string>, created: [string, number][], now: number): TractionSummary {
  const groups = s.wallets.map((w) => groupOf(w, team));
  const counts = { all: zeroCounts(), organic: zeroCounts(), team: zeroCounts() };
  const autopilotsEver = { all: 0, organic: 0, team: 0 };
  s.wallets.forEach((w, i) => {
    for (const k of [side(groups[i]!), "all"] as const) {
      const c = counts[k];
      if (w.live.autopilots > 0) c.users++;
      c.autopilots += w.live.autopilots; c.rules += w.live.rules;
      if (w.firstSeen !== null || w.sets > 0) c.usersEver++;
      c.trades += w.trades; c.swaps += w.swaps; c.volumeUsd += w.volumeUsd; c.volumeOutUsd += w.volumeOutUsd ?? 0;
      autopilotsEver[k] += w.ids.length;
      for (const [kind, n] of Object.entries(w.kinds)) c.kinds[kind] = (c.kinds[kind] ?? 0) + n;
    }
  });
  for (const [hour, cells] of Object.entries(s.hours)) {
    const age = now - Number(hour);
    for (const [i, n] of Object.entries(cells)) {
      for (const c of [counts[side(groups[Number(i)] ?? "organic")], counts.all]) {
        // An hour counts when it ends inside the window: within one hour of exact.
        if (age < DAY_MS) c.trades24h += n;
        if (age < 7 * DAY_MS) c.trades7d += n;
      }
    }
  }
  for (const k of ["all", "organic", "team"] as const) {
    counts[k].volumeUsd = cents(counts[k].volumeUsd);
    counts[k].volumeOutUsd = cents(counts[k].volumeOutUsd);
    counts[k].tradesPerAutopilot = autopilotsEver[k] ? counts[k].trades / autopilotsEver[k] : null;
  }
  const index = new Map(s.wallets.map((w, i) => [w.address, i]));
  const createdTeam = (w: string) => { const i = index.get(w); return i !== undefined ? side(groups[i]!) === "team" : team.has(w) || (TEAM_WALLETS as readonly string[]).includes(w); };
  const funnel = { since: created.length ? Math.min(...created.map(([, t]) => t)) : null, created: 0, withAutopilot: 0, traded: 0 };
  for (const [w] of created) {
    counts[createdTeam(w) ? "team" : "organic"].created++;
    counts.all.created++;
    funnel.created++;
    const i = index.get(w);
    const ww = i !== undefined ? s.wallets[i]! : null;
    if (ww && (ww.sets > 0 || ww.live.autopilots > 0)) funnel.withAutopilot++;
    if (ww && ww.trades > 0) funnel.traded++;
  }
  // Days: from the first day with an event (the history's first day when there is none yet) to today.
  const firstDay = Object.keys(s.days).sort()[0] ?? (s.historyFrom !== null ? utcDay(s.historyFrom) : undefined);
  const series = (keep: (g: TractionGroup) => boolean): TractionDay[] => {
    if (!firstDay) return [];
    const out: TractionDay[] = [];
    const newBy = new Map<string, number>();
    let before = 0;
    s.wallets.forEach((w, i) => {
      if (!keep(groups[i]!)) return;
      if (w.firstSeen === null) { if (w.sets > 0 || w.live.autopilots > 0) before++; return; }
      const d = utcDay(w.firstSeen);
      newBy.set(d, (newBy.get(d) ?? 0) + 1);
    });
    let total = before;
    for (let at = Date.parse(`${firstDay}T00:00:00Z`); at <= now; at += DAY_MS) {
      const day = utcDay(at);
      const row: TractionDay = { day, at, newUsers: newBy.get(day) ?? 0, cumulativeUsers: 0, trades: 0, swaps: 0, volumeUsd: 0, volumeOutUsd: 0, active: 0, sets: 0, clears: 0 };
      for (const [i, c] of Object.entries(s.days[day] ?? {})) {
        if (!keep(groups[Number(i)]!)) continue;
        row.trades += c[0]; row.swaps += c[1]; row.volumeUsd += c[2]; row.sets += c[3]; row.clears += c[4]; row.volumeOutUsd += c[5] ?? 0;
        if (c[0] > 0) row.active++;
      }
      row.volumeUsd = cents(row.volumeUsd);
      row.volumeOutUsd = cents(row.volumeOutUsd);
      total += row.newUsers;
      row.cumulativeUsers = total;
      out.push(row);
    }
    return out;
  };
  const lastOfDay = new Map<string, TractionSnapshot>();
  for (const p of [...snapshots].sort((a, b) => a.at - b.at)) lastOfDay.set(utcDay(p.at), p);
  const wallets: TractionRow[] = s.wallets.map((w, i) => ({ address: w.address, group: groups[i]!, firstSeen: w.firstSeen, lastTrade: w.lastTrade, lastTx: w.lastTx ?? null, trades: w.trades, swaps: w.swaps, volumeUsd: w.volumeUsd, volumeOutUsd: w.volumeOutUsd ?? 0, autopilots: w.live.autopilots, rules: w.live.rules, tokens: w.tokens }))
    .sort((a, b) => b.trades - a.trades || b.volumeUsd - a.volumeUsd || (a.firstSeen ?? 0) - (b.firstSeen ?? 0));
  return {
    updatedAt: s.updatedAt, toLedger: s.toLedger, historyFrom: s.historyFrom, gaps: s.gaps, unpriced: s.unpriced,
    all: counts.all, organic: counts.organic, team: counts.team,
    days: { organic: series((g) => g === "organic"), all: series(() => true), noLoadTest: series((g) => g !== "loadtest") },
    live: [...lastOfDay.values()],
    funnel, wallets, loadTest: groups.filter((g) => g === "loadtest").length,
    loadTestLive: s.wallets.reduce((n, w, i) => n + (groups[i] === "loadtest" ? w.live.autopilots : 0), 0),
  };
}
