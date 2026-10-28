import "server-only";
import { COMP_KEYS, type CompetitionConfig, type CompetitionInfo, type EntrantRecord, type EntrantScore, type EntrantView, type HistoryPoint, type Leaderboard, type LeaderboardRow } from "@koul/core";
import { store } from "@/lib/redis";

/**
 * Reads what the competition indexer (keeper/scripts/competition.ts) writes, for the public routes. Emails never
 * leave this module.
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
  const [board, updatedAt] = await Promise.all([r.get<LeaderboardRow[]>(COMP_KEYS.board), r.get<number>(COMP_KEYS.updatedAt)]);
  const rows = board ?? [];
  return { rows: rows.slice(offset, offset + limit), total: rows.length, offset, updatedAt: updatedAt ?? null };
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
  return { score: score ?? null, rank: board?.find((b) => b.wallet === wallet)?.rank ?? null, history, registeredAt: rec.registeredAt };
}
