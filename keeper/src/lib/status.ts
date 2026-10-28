/**
 * What the keeper reports about itself, in the Upstash Redis the web app reads (the Vercel integration's
 * KV_REST_API_URL / KV_REST_API_TOKEN, also set as GitHub secrets for the Actions runs). Plain REST calls, no client:
 * a missing store or a failed write is logged once and never stops a tick.
 */
export const HEARTBEAT_KEY = "koul:keeper:heartbeat";
export const LEASES_KEY = "koul:leases";

export interface Heartbeat {
  /** When the pass finished, ms since epoch. */
  at: number;
  passMs: number;
  intervalSec: number;
  wallets: number;
  autopilots: number;
  submitted: number;
  failed: number;
  ledger: number;
}

let warned = false;

export async function redis(env: Record<string, string | undefined>, ...command: (string | number)[]): Promise<unknown> {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warned) { console.log(`${new Date().toISOString()} status   no KV_REST_API_URL / KV_REST_API_TOKEN, not reporting`); warned = true; }
    return null;
  }
  try {
    const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(command.map(String)) });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return ((await r.json()) as { result?: unknown }).result ?? null;
  } catch (err) {
    console.log(`${new Date().toISOString()} status   write failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Kept a day: an old heartbeat must still be readable so the app can say how long ago the keeper stopped. */
export const writeHeartbeat = (env: Record<string, string | undefined>, beat: Heartbeat) => redis(env, "SET", HEARTBEAT_KEY, JSON.stringify(beat), "EX", 86400);

/** Several commands in one round trip; each result in order, null where the store is missing. */
export async function pipeline(env: Record<string, string | undefined>, commands: (string | number)[][]): Promise<unknown[]> {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || commands.length === 0) return commands.map(() => null);
  const r = await fetch(`${url}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(commands.map((c) => c.map(String))) });
  if (!r.ok) throw new Error(`redis pipeline ${r.status} ${await r.text()}`);
  return ((await r.json()) as { result?: unknown; error?: string }[]).map((x) => (x.error ? null : x.result ?? null));
}
