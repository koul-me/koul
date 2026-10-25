/**
 * The relayer the wallet kit talks to (`relayerUrl` in app/providers.tsx). Deploys of Koul's account build are paid by
 * the keeper account here; anything else is passed to SDF's relayer as it came, and a call into one of Koul's own
 * contracts that SDF refuses as not allowlisted is paid here as well. Same wire format both ways: the kit
 * posts `{ func, auth }` or `{ xdr }` and reads `{ success, hash }` or `{ success: false, error }`.
 */
import { xdr } from "@stellar/stellar-sdk";
import { SDF_RELAYER, isAccountDeploy, isKoulCall, submitSponsored } from "@/lib/relay-server";

export const runtime = "nodejs";

/** Pay for it with the keeper account, answering in the relayer's wire format. */
async function sponsor(func: xdr.HostFunction, rawAuth: unknown[], what: string): Promise<Response> {
  const secret = process.env.KEEPER_SECRET;
  if (!secret) return Response.json({ success: false, error: "Fee sponsoring is not configured on this server" }, { status: 503 });
  try {
    const auth = rawAuth.map((a) => xdr.SorobanAuthorizationEntry.fromXDR(String(a), "base64"));
    return Response.json({ success: true, hash: await submitSponsored(func, auth, secret) });
  } catch (err) {
    console.error(`Relay: ${what} failed:`, err instanceof Error ? err.message : err);
    return Response.json({ success: false, error: err instanceof Error ? err.message : "The transaction could not be submitted" }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  let body: { func?: unknown; auth?: unknown } = {};
  try { body = JSON.parse(text) as typeof body; } catch { return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

  let func: xdr.HostFunction | null = null;
  if (typeof body.func === "string" && Array.isArray(body.auth)) {
    try { func = xdr.HostFunction.fromXDR(body.func, "base64"); } catch { func = null; }
    if (func && isAccountDeploy(func)) return sponsor(func, body.auth as unknown[], "account deploy");
  }

  const forwarded = await fetch(SDF_RELAYER, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client-name": request.headers.get("x-client-name") ?? "koul", "x-client-version": request.headers.get("x-client-version") ?? "" },
    body: text,
  });
  const answer = await forwarded.text();
  if (forwarded.status === 403 && /not allowlisted/i.test(answer) && func && isKoulCall(func)) return sponsor(func, body.auth as unknown[], "Koul contract call");
  return new Response(answer, { status: forwarded.status, headers: { "content-type": "application/json" } });
}
