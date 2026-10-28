import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { COMP_KEYS } from "@koul/core";
import { HEARTBEAT_KEY, LEASES_KEY, judge, type Heartbeat, type LeaseReport } from "@/lib/keeper-status";
import { channelKeypair, RELAY_CHANNELS } from "@/lib/relay-server";
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
  tradesLastHour: number;
  buckets: Bucket[];
  historySince: number | null;
  competition: { running: boolean; entrants: number; updatedAt: number | null };
}

interface HistoryPoint { at: number; passMs: number; wallets: number; submitted: number; failed: number }

export async function publicStatus(now = Date.now()): Promise<PublicStatus | null> {
  const redis = store();
  if (!redis) return null;
  const [beat, leases, history, compConfig, entrants, compUpdated] = await Promise.all([
    redis.get<Heartbeat>(HEARTBEAT_KEY), redis.get<LeaseReport>(LEASES_KEY), redis.lrange<HistoryPoint>(HISTORY_KEY, 0, -1),
    redis.get(COMP_KEYS.config), redis.scard(COMP_KEYS.entrants), redis.get<number>(COMP_KEYS.updatedAt),
  ]);
  const verdict = judge(beat, leases, now);
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
  const tradesLastHour = history.filter((p) => p.at >= now - 3600_000).reduce((n, p) => n + p.submitted, 0);
  return {
    readAt: now,
    healthy: verdict.healthy,
    headline: verdict.healthy ? "All systems running" : keeperLate ? "Autopilots are delayed" : "Running, with maintenance pending",
    lastPassAt: beat?.at ?? null,
    passSec: beat ? Math.round(beat.passMs / 100) / 10 : null,
    wallets: beat?.wallets ?? null,
    tradesLastHour,
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

export async function privateStatus(now = Date.now()): Promise<PrivateStatus | null> {
  const redis = store();
  const secret = process.env.KEEPER_SECRET;
  if (!redis || !secret) return null;
  const [beat, leases] = await Promise.all([redis.get<Heartbeat>(HEARTBEAT_KEY), redis.get<LeaseReport>(LEASES_KEY)]);
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
  const shortest = (leases?.leases ?? []).filter((l) => l.days !== null).sort((a, b) => a.days! - b.days!)[0];
  return {
    problems: judge(beat, leases, now).problems,
    heartbeat: beat,
    leases,
    shortestLease: shortest ? { name: shortest.name, part: shortest.part, days: shortest.days! } : null,
    balances,
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
