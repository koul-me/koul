/**
 * What the competition pages show, worked out from what the indexer stored: the phase (before, during, after), the
 * dates in Turkey time and UTC, and the number formats. Pure, so the server pages and the join page agree. The preview
 * data lets the pages be looked at locally before a competition is configured (?preview=upcoming|live|ended, never in
 * production).
 */
import type { CompetitionConfig, CompetitionInfo, EntrantView, HistoryPoint, Leaderboard, LeaderboardRow } from "@koul/core";

export type Phase = "none" | "upcoming" | "live" | "ended";

export function phaseOf(config: CompetitionConfig | null, now: number): Phase {
  if (!config) return "none";
  const start = config.startsAt ? Date.parse(config.startsAt) : null;
  const end = config.endsAt ? Date.parse(config.endsAt) : null;
  if (start !== null && now < start) return "upcoming";
  if (end !== null && now >= end) return "ended";
  return "live";
}

const DAY = (tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
const TIME = (tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const TR = "Europe/Istanbul";

/** "Fri 6 Nov" in Turkey time. */
export const dayOf = (iso: string) => DAY(TR).format(new Date(iso)).replace(",", "");
/** "15:00 TRT · 12:00 UTC". */
export const timeOf = (iso: string) => `${TIME(TR).format(new Date(iso))} TRT · ${TIME("UTC").format(new Date(iso))} UTC`;
/** "Fri 6 Nov – Fri 20 Nov", or the start alone while the end is open. */
export function windowOf(config: CompetitionConfig): string | null {
  if (!config.startsAt) return null;
  return config.endsAt ? `${dayOf(config.startsAt)} – ${dayOf(config.endsAt)}` : `From ${dayOf(config.startsAt)}`;
}
/** Whole days between start and end: "2 weeks" for 14, otherwise "10 days". */
export function lengthOf(config: CompetitionConfig): string | null {
  if (!config.startsAt || !config.endsAt) return null;
  const days = Math.round((Date.parse(config.endsAt) - Date.parse(config.startsAt)) / 86_400_000);
  return days % 7 === 0 ? `${days / 7} week${days === 7 ? "" : "s"}` : `${days} days`;
}

/** "+6.84%", "-1.20%", or a dash when there is no return yet. */
export const fmtPct = (v: number | null) => (v === null || !Number.isFinite(v) ? "–" : `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(2)}%`);
export const fmtUsd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtSignedUsd = (v: number) => `${v >= 0 ? "+" : "-"}${fmtUsd(Math.abs(v))}`;

/** "2 min ago" for the scoring time; the pages pass the server's clock. */
export function agoOf(t: number | null, now: number): string {
  if (t === null) return "not yet";
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86_400)} d ago`;
}

// ------------------------------------------------------------------ preview data, development only

const HANDLES = ["ninebps", "lumen", "mira", "quietbull", "kadikoy", "sato", "orbitfi", "deltaflat", "ankara_algo", "slowmoney", "tidal", "bosphorus"];

export type Preview = "upcoming" | "live" | "ended";
export const previewOf = (v: string | string[] | undefined): Preview | null =>
  process.env.NODE_ENV !== "production" && (v === "upcoming" || v === "live" || v === "ended") ? v : null;

function previewConfig(p: Preview, now: number): CompetitionConfig {
  const start = p === "upcoming" ? now + 6 * 86_400_000 + 3 * 3_600_000 : p === "live" ? now - 5 * 86_400_000 : now - 16 * 86_400_000;
  return {
    id: "preview", name: "Koul Trading Competition", startLedger: 1, endLedger: null,
    startsAt: new Date(start).toISOString(), endsAt: new Date(start + 14 * 86_400_000).toISOString(),
    startingCapitalUsd: 100, autopilotOnly: true, prize: "$500 prize pool",
  };
}

function previewRows(p: Preview): LeaderboardRow[] {
  if (p === "upcoming") return [];
  const rows: LeaderboardRow[] = HANDLES.map((handle, i) => {
    const r = 6.84 - i * 0.61 + (i % 3) * 0.07;
    return { rank: i + 1, handle, wallet: `C${String(i).padStart(55, "A")}`, valueUsd: 100 + r, pnlUsd: r, returnPct: r, flagged: false };
  });
  rows.push({ rank: null, handle: "manualmike", wallet: "C".padEnd(56, "B"), valueUsd: 131.2, pnlUsd: 31.2, returnPct: 31.2, flagged: true });
  return rows;
}

export function previewInfo(p: Preview, now: number): CompetitionInfo {
  return { config: previewConfig(p, now), entrants: p === "upcoming" ? 47 : 13, updatedAt: p === "upcoming" ? null : now - 90_000 };
}

export function previewBoard(p: Preview, now: number, offset = 0, limit = 50): Leaderboard {
  const rows = previewRows(p);
  return { rows: rows.slice(offset, offset + limit), total: rows.length, offset, updatedAt: p === "upcoming" ? null : now - 90_000 };
}

export function previewEntrant(p: Preview, handle: string, now: number): EntrantView | null {
  const row = previewRows(p).find((r) => r.handle === handle);
  if (!row) return null;
  const history: HistoryPoint[] = Array.from({ length: 40 }, (_, i) => {
    const u = i / 39;
    const r = (row.returnPct ?? 0) * u + Math.sin(i * 0.9) * 0.4 * u;
    return { at: now - (39 - i) * 3 * 3_600_000, valueUsd: 100 + r, returnPct: r };
  });
  return {
    rank: row.rank, registeredAt: now - 7 * 86_400_000, history,
    score: {
      wallet: row.wallet, handle: row.handle, valueUsd: row.valueUsd, pnlUsd: row.pnlUsd, returnPct: row.returnPct, unpriced: [], swapEdgeUsd: 0,
      flagged: row.flagged, flagReasons: row.flagged ? ["3 moves not made by the autopilot"] : [], ledger: 1, updatedAt: now - 90_000,
      netInUsd: 100, inUsd: 100, outUsd: 0, manualTxs: row.flagged ? 3 : 0,
    },
  };
}
