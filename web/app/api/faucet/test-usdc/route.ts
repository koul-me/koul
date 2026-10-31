import { TRACTION_KEYS } from "@koul/core";
import { sendTestUsdc } from "@/lib/test-usdc-server";
import { rateLimit } from "@/lib/rate-limit";
import { store } from "@/lib/redis";

/** Friendbot, a DEX buy and a transfer: about 15 seconds, well inside this. */
export const maxDuration = 60;

/** Sends 100 test USDC to a smart wallet, bought with friendbot XLM on the testnet DEX. No anchor involved. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { wallet?: string };
    if (!body.wallet) return Response.json({ error: "wallet is required" }, { status: 400 });
    const limited = await rateLimit(request, "testUsdc", body.wallet);
    if (limited) return limited;
    const sent = await sendTestUsdc(body.wallet);
    // Every new wallet asks once for its welcome USDC, so this counts wallets created, autopilot or not (the traction
    // page's funnel). NX keeps the first time; a failed write never fails the grant.
    await store()?.zadd(TRACTION_KEYS.created, { nx: true }, { score: Date.now(), member: body.wallet }).catch(() => null);
    return Response.json(sent);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test USDC failed";
    console.error(JSON.stringify({ level: "error", route: "/api/faucet/test-usdc", message }));
    return Response.json({ error: message }, { status: 502 });
  }
}
