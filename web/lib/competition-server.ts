import "server-only";
import { createHash } from "node:crypto";
import { COMP_KEYS, type CompetitionConfig, type CompetitionInfo, type EntrantRecord, type EntrantScore, type EntrantView, type HistoryPoint, type Leaderboard, type LeaderboardRow } from "@koul/core";
import { TELEGRAM_URL } from "@/lib/community";
import { sendMail } from "@/lib/mail";
import { store } from "@/lib/redis";

/**
 * Reads what the competition indexer (keeper/scripts/competition.ts) writes, for the public routes, and writes the
 * entries the registration confirms. Emails never leave this module except in the note to the entrant.
 */
function redis() {
  const r = store();
  if (!r) throw new Error("The competition store is not configured");
  return r;
}

export async function competitionInfo(): Promise<CompetitionInfo> {
  const r = redis();
  const [config, entrants, updatedAt] = await Promise.all([r.get<CompetitionConfig>(COMP_KEYS.config), r.scard(COMP_KEYS.entrants), r.get<number>(COMP_KEYS.updatedAt)]);
  return { config: config ?? null, entrants, updatedAt: updatedAt ?? null };
}

export async function leaderboard(offset: number, limit: number): Promise<Leaderboard> {
  const r = redis();
  const [board, updatedAt, entrants] = await Promise.all([r.get<LeaderboardRow[]>(COMP_KEYS.board), r.get<number>(COMP_KEYS.updatedAt), r.smembers(COMP_KEYS.entrants)]);
  // Entrants confirmed since the last scoring run go at the end, marked pending, until the indexer scores them.
  const scored = new Set((board ?? []).map((b) => b.wallet));
  const fresh = entrants.filter((w) => !scored.has(w));
  const records = fresh.length ? await r.mget<(EntrantRecord | null)[]>(...fresh.map((w) => COMP_KEYS.entrant(w))) : [];
  const pending: LeaderboardRow[] = records.flatMap((rec) => (rec?.verifiedAt ? [{ rank: null, handle: rec.handle, wallet: rec.wallet, valueUsd: 0, pnlUsd: 0, returnPct: null, flagged: false, pending: true }] : []));
  const all = [...(board ?? []), ...pending];
  // Invite counts for the rows on this page only: one MGET.
  const page = all.slice(offset, offset + limit);
  const counts = page.length ? await r.mget<(number | null)[]>(...page.map((row) => COMP_KEYS.referrals(row.handle))) : [];
  page.forEach((row, i) => { const n = Number(counts[i] ?? 0); if (n > 0) row.referrals = n; });
  return { rows: page, total: all.length, offset, updatedAt: updatedAt ?? null };
}

export async function entrantView(handle: string): Promise<EntrantView | null> {
  const r = redis();
  const wallet = await r.get<string>(COMP_KEYS.handle(handle));
  if (!wallet) return null;
  const [rec, score, history, board] = await Promise.all([
    r.get<EntrantRecord>(COMP_KEYS.entrant(wallet)),
    r.get<EntrantScore>(COMP_KEYS.score(wallet)),
    r.lrange<HistoryPoint>(COMP_KEYS.history(wallet), 0, -1),
    r.get<LeaderboardRow[]>(COMP_KEYS.board),
  ]);
  if (!rec || !rec.verifiedAt) return null;
  const referrals = Number((await r.get<number>(COMP_KEYS.referrals(rec.handle))) ?? 0);
  return { score: score ?? null, rank: board?.find((b) => b.wallet === wallet)?.rank ?? null, history, registeredAt: rec.registeredAt, referrals };
}

/** Where links in the entrant's note point. */
const SITE = process.env.COMPETITION_BASE_URL ?? "https://koul.me";
const APP = process.env.WAITLIST_APP_URL ?? "https://app.koul.me";
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The email's claim: one entry per email, stored hashed. */
export const entryEmailKey = (email: string) => `koul:comp:email:${createHash("sha256").update(email).digest("hex")}`;

/** The store calls an entry needs; the Upstash client in production, an in-memory one in tests. */
export interface EntryStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { nx: true }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  eval(script: string, keys: string[], args: unknown[]): Promise<unknown>;
}

/** KEYS[1] the entrants set, ARGV[1] the wallet, ARGV[2] the cap (-1 for none): 1 when the wallet holds a place. */
export const PLACE_SCRIPT = `if redis.call("SISMEMBER", KEYS[1], ARGV[1]) == 1 then return 1 end
local max = tonumber(ARGV[2])
if max >= 0 and redis.call("SCARD", KEYS[1]) >= max then return 0 end
redis.call("SADD", KEYS[1], ARGV[1])
return 1`;

/**
 * Takes a scored place for the wallet in COMP_KEYS.entrants, in one script so entries that arrive together can never
 * pass `max`. False when it is full. A wallet that already holds a place keeps it.
 */
export async function takePlace(r: EntryStore, wallet: string, max: number | null): Promise<boolean> {
  return Number(await r.eval(PLACE_SCRIPT, [COMP_KEYS.entrants], [wallet, max ?? -1])) === 1;
}

export type EntryOutcome = { ok: true; record: EntrantRecord } | { ok: false; error: string };

/**
 * Confirms an entry whose passkey signature has been checked: claims the handle and the email for the wallet, takes a
 * place under the cap and stores the record as verified, so the indexer scores it from its next run. One entry per
 * wallet, per handle and per email. A pending entry of the same wallet (from when entries waited for an email link)
 * is replaced, and the handle or email it no longer uses is let go.
 */
export async function confirmEntry(r: EntryStore, entry: { wallet: string; handle: string; email: string; max: number | null; now: number }): Promise<EntryOutcome> {
  const { wallet, handle, email, max, now } = entry;
  const existing = await r.get<EntrantRecord>(COMP_KEYS.entrant(wallet));
  if (existing?.verifiedAt) return { ok: false, error: `This wallet is already entered as ${existing.handle}` };

  // SET NX, so two wallets asking for the same handle or email at once cannot both get it.
  const claimed: string[] = [];
  const claim = async (key: string) => {
    if ((await r.set(key, wallet, { nx: true })) !== null) { claimed.push(key); return true; }
    return (await r.get<string>(key)) === wallet;
  };
  const release = async () => { if (claimed.length) await r.del(...claimed); };
  if (!(await claim(COMP_KEYS.handle(handle)))) return { ok: false, error: "That handle is taken" };
  if (!(await claim(entryEmailKey(email)))) { await release(); return { ok: false, error: "That email already has an entry" }; }
  if (!(await takePlace(r, wallet, max))) { await release(); return { ok: false, error: `Entries are full: all ${max} places are taken.` }; }

  const record: EntrantRecord = { wallet, handle, email, registeredAt: now, verifiedAt: now, acceptedTermsAt: now };
  await r.set(COMP_KEYS.entrant(wallet), record);
  if (existing) {
    const stale = [
      existing.handle.toLowerCase() !== handle.toLowerCase() ? COMP_KEYS.handle(existing.handle) : null,
      existing.email !== email ? entryEmailKey(existing.email) : null,
    ].filter((k): k is string => k !== null);
    const owners = await Promise.all(stale.map((k) => r.get<string>(k)));
    const mine = stale.filter((_, i) => owners[i] === wallet);
    if (mine.length) await r.del(...mine);
  }
  return { ok: true, record };
}

/**
 * The "You're in" note: the entrant page and the Telegram group. Nothing in it needs clicking for the entry to count,
 * and a send that fails (no RESEND_API_KEY, the daily quota) is only logged.
 */
export async function sendEntryNote(email: string, handle: string, competition: string): Promise<boolean> {
  const page = `${SITE}/compete/${handle}`;
  const autopilot = `${APP}/autopilot`;
  const lines = [
    `You're entered in ${competition} as ${handle}. Your page on the leaderboard: ${page}`,
    ...(TELEGRAM_URL ? [`Join the Koul Telegram group, where winners are contacted: ${TELEGRAM_URL}`] : []),
    `Only trades your autopilot makes count, so make sure it is running: ${autopilot}`,
  ];
  const html = [
    `<p>You're entered in ${escape(competition)} as <b>${escape(handle)}</b>. <a href="${escape(page)}">Your page on the leaderboard</a></p>`,
    ...(TELEGRAM_URL ? [`<p>Join the <a href="${escape(TELEGRAM_URL)}">Koul Telegram group</a>, where winners are contacted.</p>`] : []),
    `<p>Only trades your autopilot makes count, so make sure it is <a href="${escape(autopilot)}">running</a>.</p>`,
  ];
  return sendMail(email, `You're in: ${competition}`, `${lines.join("\n\n")}\n\nKoul\n${SITE}`, `${html.join("")}<p>Koul<br><a href="${escape(SITE)}">${escape(SITE.replace(/^https?:\/\//, ""))}</a></p>`);
}
