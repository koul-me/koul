import "server-only";
import type { CompetitionInfo, EntrantView, Leaderboard } from "@koul/core";
import { competitionInfo, entrantView, leaderboard } from "@/lib/competition-server";
import { previewBoard, previewEntrant, previewInfo, type Preview } from "@/lib/competition-view";

/**
 * The competition pages' reads, with the server's clock taken here (render stays pure) and the preview data in place
 * of the store when a page is opened with ?preview= in development. A store that cannot be read shows as no
 * competition rather than an error page.
 */
const EMPTY_INFO: CompetitionInfo = { config: null, entrants: 0, updatedAt: null };
const EMPTY_BOARD: Leaderboard = { rows: [], total: 0, offset: 0, updatedAt: null };

export async function loadCompetition(preview: Preview | null, boardSize: number): Promise<{ info: CompetitionInfo; board: Leaderboard; now: number }> {
  const now = Date.now();
  if (preview) return { info: previewInfo(preview, now), board: previewBoard(preview, now, 0, boardSize), now };
  const [info, board] = await Promise.all([competitionInfo().catch(() => EMPTY_INFO), leaderboard(0, boardSize).catch(() => EMPTY_BOARD)]);
  return { info, board, now };
}

export async function loadBoard(preview: Preview | null, offset: number, limit: number): Promise<{ info: CompetitionInfo; board: Leaderboard; now: number }> {
  const now = Date.now();
  if (preview) return { info: previewInfo(preview, now), board: previewBoard(preview, now, offset, limit), now };
  const [info, board] = await Promise.all([competitionInfo().catch(() => EMPTY_INFO), leaderboard(offset, limit).catch(() => EMPTY_BOARD)]);
  return { info, board, now };
}

export async function loadEntrant(preview: Preview | null, handle: string): Promise<{ info: CompetitionInfo; view: EntrantView | null; now: number }> {
  const now = Date.now();
  if (preview) return { info: previewInfo(preview, now), view: previewEntrant(preview, handle, now), now };
  const [info, view] = await Promise.all([competitionInfo().catch(() => EMPTY_INFO), entrantView(handle).catch(() => null)]);
  return { info, view, now };
}
