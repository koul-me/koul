/**
 * GET ?wallet=C...&handle=name: what /join needs before anyone signs. `entered`: the handle this wallet is already
 * entered as, or null. `handleTaken`: whether another wallet holds the handle (compared in lower case, as register
 * claims it), or null when no handle was asked about. Both are public anyway: handles and wallets are on the board.
 */
import { COMP_KEYS, HANDLE_PATTERN, RESERVED_HANDLES, type EntrantRecord } from "@koul/core";
import { store } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const wallet = q.get("wallet");
  const handle = q.get("handle");
  if (wallet !== null && !/^C[A-Z2-7]{55}$/.test(wallet)) return Response.json({ error: "Not a wallet address" }, { status: 400 });
  const redis = store();
  if (!redis) return Response.json({ error: "Registration is not open" }, { status: 503 });
  try {
    const [record, owner] = await Promise.all([
      wallet ? redis.get<EntrantRecord>(COMP_KEYS.entrant(wallet)) : null,
      handle && HANDLE_PATTERN.test(handle) && !RESERVED_HANDLES.has(handle.toLowerCase()) ? redis.get<string>(COMP_KEYS.handle(handle)) : null,
    ]);
    const handleTaken = handle === null ? null : !HANDLE_PATTERN.test(handle) || RESERVED_HANDLES.has(handle.toLowerCase()) || (owner !== null && owner !== wallet);
    return Response.json({ entered: record?.verifiedAt ? record.handle : null, handleTaken }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", route: "/api/competition/status", message: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "Status is unavailable" }, { status: 503 });
  }
}
