import "server-only";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { store } from "@/lib/redis";

/**
 * Limits on the routes anyone can call and that cost us something: the chat and parser spend model credits, the test
 * USDC and faucet routes spend the keeper's XLM and drain the testnet DEX, the waitlist sends email. Each route has a
 * per-IP budget, and the money routes a per-wallet one too. Without a store, or when the store fails, requests pass:
 * a limiter outage must not take the app down.
 */
const LIMITS = {
  // Generous per IP: a venue or an office shares one address, and a launch event must not trip it.
  chat: [[60, "1 m"], [1000, "1 d"]],
  parse: [[60, "1 m"], [1000, "1 d"]],
  // Friendbot pays for test USDC, not us, and each wallet is held to two a day; the IP budget only stops a script
  // farming new wallets, so it allows a crowded launch event (and a 60-wallet load test) from one address.
  testUsdc: [[300, "1 d"]],
  faucet: [[20, "1 d"]],
  waitlist: [[5, "1 m"], [30, "1 d"]],
  funds: [[20, "1 h"]],
  register: [[10, "1 m"], [50, "1 d"]],
} satisfies Record<string, [number, Duration][]>;
/** Per wallet, on top of the IP budget: a fresh IP cannot refill the same wallet again and again. */
const PER_WALLET: Partial<Record<keyof typeof LIMITS, [number, Duration]>> = { testUsdc: [2, "1 d"], faucet: [2, "1 d"] };

export type LimitName = keyof typeof LIMITS;

const limiters = new Map<string, Ratelimit>();
function limiter(key: string, [n, window]: [number, Duration]): Ratelimit | null {
  const redis = store();
  if (!redis) return null;
  let l = limiters.get(key);
  if (!l) { l = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(n, window), prefix: `koul:rl:${key}` }); limiters.set(key, l); }
  return l;
}

/** The caller's IP as Vercel reports it. */
export function clientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const human = (window: Duration) => ({ "1 m": "minute", "1 h": "hour", "1 d": "day" } as Record<string, string>)[window] ?? window;

/** Null when the request may go on; otherwise the 429 to return. */
export async function rateLimit(request: Request, name: LimitName, wallet?: string): Promise<Response | null> {
  const checks: [string, string, [number, Duration]][] = LIMITS[name].map((rule, i) => [`${name}:ip:${i}`, clientIp(request), rule as [number, Duration]]);
  const perWallet = PER_WALLET[name];
  if (wallet && perWallet) checks.push([`${name}:wallet`, wallet, perWallet]);
  try {
    for (const [key, id, rule] of checks) {
      const l = limiter(key, rule);
      if (!l) return null;
      const r = await l.limit(id);
      if (!r.success) {
        const retry = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
        return Response.json({ error: `Too many requests. Try again in ${retry < 120 ? `${retry} seconds` : `about ${Math.ceil(retry / 60)} minutes`}. The limit is ${rule[0]} per ${human(rule[1])}.` }, { status: 429, headers: { "retry-after": String(retry) } });
      }
    }
  } catch (error) {
    console.error(JSON.stringify({ level: "error", rateLimit: name, message: error instanceof Error ? error.message : String(error) }));
  }
  return null;
}
