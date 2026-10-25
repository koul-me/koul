/**
 * The relayer the wallet kit talks to (`relayerUrl` in app/providers.tsx). Deploys of Koul's account build are paid by
 * the keeper account here; anything else is passed to SDF's relayer as it came. Same wire format both ways: the kit
 * posts `{ func, auth }` or `{ xdr }` and reads `{ success, hash }` or `{ success: false, error }`.
 */
import { xdr } from "@stellar/stellar-sdk";
import { SDF_RELAYER, isAccountDeploy, submitAccountDeploy } from "@/lib/relay-server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  let body: { func?: unknown; auth?: unknown } = {};
  try { body = JSON.parse(text) as typeof body; } catch { return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

  if (typeof body.func === "string" && Array.isArray(body.auth)) {
    let func: xdr.HostFunction | null = null;
    try { func = xdr.HostFunction.fromXDR(body.func, "base64"); } catch { func = null; }
    if (func && isAccountDeploy(func)) {
      const secret = process.env.KEEPER_SECRET;
      if (!secret) return Response.json({ success: false, error: "Wallet creation is not configured on this server" }, { status: 503 });
      try {
        const auth = (body.auth as unknown[]).map((a) => xdr.SorobanAuthorizationEntry.fromXDR(String(a), "base64"));
        const hash = await submitAccountDeploy(func, auth, secret);
        return Response.json({ success: true, hash });
      } catch (err) {
        console.error("Relay: account deploy failed:", err instanceof Error ? err.message : err);
        return Response.json({ success: false, error: err instanceof Error ? err.message : "The wallet could not be deployed" }, { status: 502 });
      }
    }
  }

  const forwarded = await fetch(SDF_RELAYER, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client-name": request.headers.get("x-client-name") ?? "koul", "x-client-version": request.headers.get("x-client-version") ?? "" },
    body: text,
  });
  return new Response(await forwarded.text(), { status: forwarded.status, headers: { "content-type": "application/json" } });
}
