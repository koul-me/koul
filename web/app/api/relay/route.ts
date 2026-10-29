/**
 * The relayer the wallet kit talks to (`relayerUrl` in app/providers.tsx). Deploys of Koul's account build and calls
 * into Koul's own contracts are paid here, from the channel accounts (lib/relay-server.ts); anything else is passed to
 * SDF's relayer as it came. Same wire format both ways: the kit
 * posts `{ func, auth }` or `{ xdr }` and reads `{ success, hash }` or `{ success: false, error }`.
 */
import { xdr } from "@stellar/stellar-sdk";
import { SDF_RELAYER, isAccountDeploy, isKoulCall, recordRelayFailure, submitSponsored } from "@/lib/relay-server";

export const runtime = "nodejs";
/** A sponsored call waits for its result and may resubmit twice after an on-chain race; about 15 s a try. */
export const maxDuration = 60;

/** Pay for it with the keeper account, answering in the relayer's wire format. */
async function sponsor(func: xdr.HostFunction, rawAuth: unknown[], what: string): Promise<Response> {
  const secret = process.env.KEEPER_SECRET;
  if (!secret) return Response.json({ success: false, error: "Fee sponsoring is not configured on this server" }, { status: 503 });
  try {
    const auth = rawAuth.map((a) => xdr.SorobanAuthorizationEntry.fromXDR(String(a), "base64"));
    return Response.json({ success: true, hash: await submitSponsored(func, auth, secret) });
  } catch (err) {
    console.error(`Relay: ${what} failed:`, err instanceof Error ? err.message : err);
    await recordRelayFailure(what, err instanceof Error ? err.message : String(err));
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
    // Koul's own flows are paid here, not by SDF: this relay retries a call that lost a race on-chain, SDF's does not.
    if (func && (await isKoulCall(func))) return sponsor(func, body.auth as unknown[], "Koul contract call");
  }

  const forwarded = await fetch(SDF_RELAYER, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client-name": request.headers.get("x-client-name") ?? "koul", "x-client-version": request.headers.get("x-client-version") ?? "" },
    body: text,
  });
  const answer = await forwarded.text();
  if (forwarded.status === 403 && /not allowlisted/i.test(answer) && func && (await isKoulCall(func))) return sponsor(func, body.auth as unknown[], "Koul contract call");
  if (forwarded.status >= 500) await recordRelayFailure("SDF relayer", `${forwarded.status} ${answer}`);
  return new Response(answer, { status: forwarded.status, headers: { "content-type": "application/json" } });
}
