import "server-only";
import { emptyTraction, TRACTION_KEYS, tractionSummary, type TractionSnapshot, type TractionState, type TractionSummary } from "@koul/core";
import { KOUL } from "@/lib/koul";
import { store } from "@/lib/redis";

/**
 * What /status/traction shows, from what `pnpm traction` (keeper/scripts/traction.ts, hourly) stores. Four reads a
 * view: the state, the snapshots, the team set and the created wallets; the numbers move once an hour, so the page
 * refreshes every ten minutes rather than the status page's 30 s.
 */
export interface Traction { summary: TractionSummary; collected: boolean; readAt: number }

export async function readTraction(now = Date.now()): Promise<Traction | null> {
  const redis = store();
  if (!redis) return null;
  const [state, snapshots, team, created] = await Promise.all([
    redis.get<TractionState>(TRACTION_KEYS.state),
    redis.lrange<TractionSnapshot>(TRACTION_KEYS.snapshots, 0, -1),
    redis.smembers(TRACTION_KEYS.team),
    redis.zrange<(string | number)[]>(TRACTION_KEYS.created, 0, -1, { withScores: true }),
  ]);
  const pairs: [string, number][] = [];
  for (let i = 0; i + 1 < created.length; i += 2) pairs.push([String(created[i]), Number(created[i + 1])]);
  return { summary: tractionSummary(state ?? emptyTraction(KOUL.router), snapshots, new Set(team), pairs, now), collected: state !== null, readAt: now };
}
