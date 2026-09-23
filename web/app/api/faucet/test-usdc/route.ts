import { sendTestUsdc } from "@/lib/test-usdc-server";

/** Friendbot, a DEX buy and a transfer: about 15 seconds, well inside this. */
export const maxDuration = 60;

/** Sends 100 test USDC to a smart wallet, bought with friendbot XLM on the testnet DEX. No anchor involved. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { wallet?: string };
    if (!body.wallet) return Response.json({ error: "wallet is required" }, { status: 400 });
    return Response.json(await sendTestUsdc(body.wallet));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test USDC failed";
    console.error(JSON.stringify({ level: "error", route: "/api/faucet/test-usdc", message }));
    return Response.json({ error: message }, { status: 502 });
  }
}
