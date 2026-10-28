/** GET: one entrant's score, rank and value history, by handle. `EntrantView` in @koul/core. */
import { HANDLE_PATTERN } from "@koul/core";
import { entrantView } from "@/lib/competition-server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }): Promise<Response> {
  const { handle } = await params;
  if (!HANDLE_PATTERN.test(handle)) return Response.json({ error: "No such entrant" }, { status: 404 });
  try {
    const view = await entrantView(handle);
    if (!view) return Response.json({ error: "No such entrant" }, { status: 404 });
    return Response.json(view, { headers: { "cache-control": "public, max-age=30" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", route: "/api/competition/entrant", message: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "The entrant is unavailable" }, { status: 503 });
  }
}
