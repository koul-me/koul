import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Keypair, rpc, xdr } from "@stellar/stellar-sdk";
import { COMP_KEYS } from "@koul/core";
import { HEARTBEAT_KEY, LEASES_KEY, judge, type Heartbeat, type LeaseReport } from "@/lib/keeper-status";
import { KOUL } from "@/lib/koul";
import { channelKeypair, RELAY_CHANNELS, RELAY_FAILURES_KEY, type RelayFailure } from "@/lib/relay-server";
import { store } from "@/lib/redis";

/**
 * Everything the /status pages show. The public part says whether Koul is running and how busy the keeper is; the
 * private part (balances, leases, failure reasons) is only read behind STATUS_SECRET (see statusCookie).
 */
const HISTORY_KEY = "koul:keeper:history";
const KEEPER_CHANNELS = Number(process.env.KEEPER_CHANNELS ?? 8);
const BUCKET_MS = 15 * 60_000;
const DAY_MS = 24 * 3600_000;

export interface Bucket { at: number; passSec: number | null; trades: number }
export interface PublicStatus {
  /** When this was read; "3 min ago" is measured from it. */
  readAt: number;
  healthy: boolean;
  /** A short public headline; reasons stay private. */
  headline: string;
  lastPassAt: number | null;
  passSec: number | null;
  wallets: number | null;
  /** From the chain; null when the RPC did not answer. */
  tradesLastHour: number | null;
  buckets: Bucket[];
  historySince: number | null;
  competition: { running: boolean; entrants: number; updatedAt: number | null };
}

interface HistoryPoint { at: number; passMs: number; wallets: number; submitted: number; failed: number }

const TRADES_CACHE = "koul:status:trades-hour";
/** An hour of ledgers at about five seconds each. */
const HOUR_LEDGERS = 720;

/**
 * Autopilot runs in the last hour, counted from the router's own `fired` events: the chain's record, so the number is
 * right however long the keeper has been running (the keeper's history only starts at its last restart). Cached a
 * minute so page refreshes do not each walk the events.
 */
async function tradesLastHour(redis: NonNullable<ReturnType<typeof store>>): Promise<number | null> {
  const cached = await redis.get<number>(TRADES_CACHE);
  if (typeof cached === "number") return cached;
  try {
    const server = new rpc.Server(KOUL.rpcUrl);
    const latest = (await server.getLatestLedger()).sequence;
    const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [KOUL.router], topics: [[xdr.ScVal.scvSymbol("fired").toXDR("base64"), "**"]] }];
    let count = 0;
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const res = cursor ? await server.getEvents({ cursor, limit: 200, filters }) : await server.getEvents({ startLedger: latest - HOUR_LEDGERS, limit: 200, filters });
      count += res.events.filter((e) => e.ledger <= latest).length;
      if (res.events.length < 200) break;
      cursor = res.cursor;
    }
    await redis.set(TRADES_CACHE, count, { ex: 60 });
    return count;
  } catch {
    return null;
  }
}

export async function publicStatus(now = Date.now()): Promise<PublicStatus | null> {
  const redis = store();
  if (!redis) return null;
  const [beat, leases, history, compConfig, entrants, compUpdated, trades] = await Promise.all([
    redis.get<Heartbeat>(HEARTBEAT_KEY), redis.get<LeaseReport>(LEASES_KEY), redis.lrange<HistoryPoint>(HISTORY_KEY, 0, -1),
    redis.get(COMP_KEYS.config), redis.scard(COMP_KEYS.entrants), redis.get<number>(COMP_KEYS.updatedAt), tradesLastHour(redis),
  ]);
  const keeperVerdict = judge(beat, leases, now);
  const extra = await opsProblems(now).catch(() => []);
  const verdict = { ...keeperVerdict, healthy: keeperVerdict.healthy && extra.length === 0, problems: [...keeperVerdict.problems, ...extra] };
  const keeperLate = verdict.problems.some((p) => p.startsWith("The keeper"));
  // 96 quarter hours, oldest first: the average pass length and the trades sent in each.
  const start = Math.floor((now - DAY_MS) / BUCKET_MS) * BUCKET_MS + BUCKET_MS;
  const buckets: Bucket[] = Array.from({ length: 96 }, (_, i) => ({ at: start + i * BUCKET_MS, passSec: null, trades: 0 }));
  const sums = buckets.map(() => ({ pass: 0, n: 0 }));
  for (const p of history) {
    const i = Math.floor((p.at - start) / BUCKET_MS);
    if (i < 0 || i >= buckets.length) continue;
    buckets[i]!.trades += p.submitted;
    sums[i]!.pass += p.passMs; sums[i]!.n++;
  }
  buckets.forEach((b, i) => { if (sums[i]!.n) b.passSec = Math.round(sums[i]!.pass / sums[i]!.n / 100) / 10; });
  return {
    readAt: now,
    healthy: verdict.healthy,
    headline: verdict.healthy ? "All systems running" : keeperLate ? "Autopilots are delayed" : "Running, with maintenance pending",
    lastPassAt: beat?.at ?? null,
    passSec: beat ? Math.round(beat.passMs / 100) / 10 : null,
    wallets: beat?.wallets ?? null,
    tradesLastHour: trades,
    buckets,
    historySince: history.length ? history[history.length - 1]!.at : null,
    competition: { running: compConfig !== null, entrants, updatedAt: compUpdated ?? null },
  };
}

export interface Balance { label: string; address: string; xlm: number | null; low: boolean }
export interface PrivateStatus {
  problems: string[];
  heartbeat: Heartbeat | null;
  leases: LeaseReport | null;
  shortestLease: { name: string; part: string; days: number } | null;
  balances: Balance[];
  relayFailures: RelayFailure[];
}

async function xlm(address: string): Promise<number | null> {
  try {
    const r = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    const a = (await r.json()) as { balances: { asset_type: string; balance: string }[] };
    return Number(a.balances.find((b) => b.asset_type === "native")?.balance ?? 0);
  } catch {
    return null;
  }
}

const BALANCES_CACHE = "koul:status:balances";

/** The keeper and channel balances, cached five minutes so the page and the alert check do not each call Horizon. */
export async function readBalances(): Promise<Balance[]> {
  const redis = store();
  const secret = process.env.KEEPER_SECRET;
  if (!redis || !secret) return [];
  const cached = await redis.get<Balance[]>(BALANCES_CACHE);
  if (cached) return cached;
  const keeper = Keypair.fromSecret(secret);
  const keeperChannel = (i: number) => Keypair.fromRawEd25519Seed(createHash("sha256").update(`koul-keeper-channel:${i}:${secret}`).digest());
  // The keeper account funds the channels; a channel under 60 XLM is topped up by the daily leases workflow.
  const accounts: [string, string, number][] = [
    ["Keeper", keeper.publicKey(), 1000],
    ...Array.from({ length: RELAY_CHANNELS }, (_, i) => [`Relay channel ${i}`, channelKeypair(secret, i).publicKey(), 60] as [string, string, number]),
    ...Array.from({ length: KEEPER_CHANNELS }, (_, i) => [`Keeper channel ${i}`, keeperChannel(i).publicKey(), 60] as [string, string, number]),
  ];
  const balances = await Promise.all(accounts.map(async ([label, address, min]) => {
    const v = await xlm(address);
    return { label, address, xlm: v, low: v !== null && v < min };
  }));
  await redis.set(BALANCES_CACHE, balances, { ex: 300 });
  return balances;
}

/** What the relay failed at recently, newest first. */
export async function readRelayFailures(): Promise<RelayFailure[]> {
  const redis = store();
  return redis ? redis.lrange<RelayFailure>(RELAY_FAILURES_KEY, 0, 19) : [];
}

/**
 * Problems beyond the keeper and the leases: a payer running low (a channel with no XLM fails every transaction it
 * would pay for) and the relay failing repeatedly. They join the keeper's in the owner alert and on the pages.
 */
export async function opsProblems(now = Date.now()): Promise<string[]> {
  const [balances, failures] = await Promise.all([readBalances().catch(() => []), readRelayFailures().catch(() => [])]);
  const out = balances.filter((b) => b.low || b.xlm === null).map((b) => b.xlm === null ? `${b.label} is missing on chain.` : `${b.label} is low: ${b.xlm.toFixed(2)} XLM.`);
  const lastHour = failures.filter((f) => now - f.at < 3600_000);
  if (lastHour.length >= 3) out.push(`The relay failed ${lastHour.length} times in the last hour; last: ${lastHour[0]!.what}: ${lastHour[0]!.error}`);
  return [...out, ...(await loadProblems(now).catch(() => []))];
}

/** A pass slower than this means rules react late; past it the keeper needs more channels, a faster RPC or a split. */
const SLOW_PASS_MS = 60_000;
/** The indexer runs every 15 minutes; a board older than three runs while the competition runs means it stopped. */
const STALE_BOARD_MS = 45 * 60_000;

/** What grows with users: keeper ticks failing, passes slowing down, the competition board going stale. */
async function loadProblems(now: number): Promise<string[]> {
  const redis = store();
  if (!redis) return [];
  const [beat, config, boardAt] = await Promise.all([
    redis.get<Heartbeat>(HEARTBEAT_KEY), redis.get<{ startsAt: string | null; endsAt: string | null }>(COMP_KEYS.config), redis.get<number>(COMP_KEYS.updatedAt),
  ]);
  const out: string[] = [];
  if (beat && beat.failed >= 5 && beat.failed > beat.submitted) out.push(`The keeper's last pass failed ${beat.failed} ticks and sent ${beat.submitted}; first reasons: ${(beat.errors ?? []).slice(0, 2).join("; ") || "none recorded"}.`);
  if (beat && beat.passMs > SLOW_PASS_MS) out.push(`A keeper pass takes ${Math.round(beat.passMs / 1000)} s for ${beat.wallets} wallets: rules react late.`);
  const starts = config?.startsAt ? Date.parse(config.startsAt) : null, ends = config?.endsAt ? Date.parse(config.endsAt) : null;
  const running = starts !== null && now > starts + STALE_BOARD_MS && (ends === null || now < ends + 3600_000);
  if (running && (!boardAt || now - Number(boardAt) > STALE_BOARD_MS)) out.push(`The competition board was last written ${boardAt ? `${Math.round((now - Number(boardAt)) / 60_000)} min ago` : "never"}: the indexer is not running.`);
  return out;
}

export async function privateStatus(now = Date.now()): Promise<PrivateStatus | null> {
  const redis = store();
  if (!redis || !process.env.KEEPER_SECRET) return null;
  const [beat, leases, balances, relayFailures, extra] = await Promise.all([
    redis.get<Heartbeat>(HEARTBEAT_KEY), redis.get<LeaseReport>(LEASES_KEY), readBalances(), readRelayFailures(), opsProblems(now),
  ]);
  const shortest = (leases?.leases ?? []).filter((l) => l.days !== null).sort((a, b) => a.days! - b.days!)[0];
  return {
    problems: [...judge(beat, leases, now).problems, ...extra],
    heartbeat: beat,
    leases,
    shortestLease: shortest ? { name: shortest.name, part: shortest.part, days: shortest.days! } : null,
    balances,
    relayFailures,
  };
}

/**
 * The private page's key. `/api/status/unlock?key=STATUS_SECRET` sets a cookie holding an HMAC of the secret (never the
 * secret itself); changing STATUS_SECRET locks every browser out again. Without STATUS_SECRET the private page is off.
 */
export const STATUS_COOKIE = "koul_status";
export function statusCookieValue(): string | null {
  const secret = process.env.STATUS_SECRET;
  return secret ? createHmac("sha256", secret).update("koul-status-private").digest("base64url") : null;
}
export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
