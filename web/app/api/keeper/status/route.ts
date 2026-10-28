/**
 * The keeper's health for the app ("Last check 12 s ago") and the watchers. Public on purpose: it says when the
 * keeper last ran and whether anything needs a person, nothing more. Asking also raises the owner alert when needed.
 */
import { after } from "next/server";
import { alertOwner, readKeeperStatus } from "@/lib/keeper-status";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const status = await readKeeperStatus();
    if (!status) return Response.json({ error: "Keeper status is not set up" }, { status: 503 });
    if (!status.healthy) after(() => alertOwner(status));
    return Response.json(status, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", route: "/api/keeper/status", message: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "Keeper status is unavailable" }, { status: 502 });
  }
}
