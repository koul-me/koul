/** GET ?offset=0&limit=50: one page of the ranked board, refreshed by the indexer every couple of minutes. */
import { leaderboard } from "@/lib/competition-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) | 0);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) | 0));
  try {
    return Response.json(await leaderboard(offset, limit), { headers: { "cache-control": "public, max-age=30" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", route: "/api/competition/leaderboard", message: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "The leaderboard is unavailable" }, { status: 503 });
  }
}
