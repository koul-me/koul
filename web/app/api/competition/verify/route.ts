/** GET ?token=: the link in the confirmation email. Marks the entry verified so the indexer starts scoring it. */
import { COMP_KEYS, type EntrantRecord } from "@koul/core";
import { store } from "@/lib/redis";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const page = (title: string, body: string, status = 200) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} · Koul</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#000;color:#fff;font:17px/1.5 system-ui,sans-serif;padding:16px}main{max-width:440px}h1{font-size:32px;line-height:1.1;margin:0 0 12px}p{color:#a3a3a3}a{color:#c8f23a}</style></head><body><main><h1>${escape(title)}</h1>${body}</main></body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const redis = store();
  if (!redis || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return page("Link not valid", "<p>This confirmation link is broken.</p>", 400);
  const wallet = await redis.get<string>(COMP_KEYS.pending(token));
  if (!wallet) return page("Link expired", "<p>This link was used or has expired. Enter again from the app to get a new one.</p>", 410);
  const rec = await redis.get<EntrantRecord>(COMP_KEYS.entrant(wallet));
  if (!rec) return page("Entry not found", "<p>Enter again from the app.</p>", 404);
  await Promise.all([
    redis.set(COMP_KEYS.entrant(wallet), { ...rec, verifiedAt: rec.verifiedAt ?? Date.now() }),
    redis.sadd(COMP_KEYS.entrants, wallet),
    redis.del(COMP_KEYS.pending(token)),
  ]);
  return page("You're in", `<p><b>${escape(rec.handle)}</b> is entered. Your score shows on the leaderboard within a few minutes.</p><p><a href="https://koul.me/compete/leaderboard">See the leaderboard</a> · <a href="https://app.koul.me/autopilot">Check your autopilot</a></p>`);
}
