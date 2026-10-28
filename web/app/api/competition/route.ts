/** GET: the competition's settings and how many verified entrants it has. `CompetitionInfo` in @koul/core. */
import { competitionInfo } from "@/lib/competition-server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await competitionInfo(), { headers: { "cache-control": "public, max-age=30" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", route: "/api/competition", message: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "The competition is unavailable" }, { status: 503 });
  }
}
