import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/status/auto-refresh";
import { ThemeColor } from "@/components/shell/theme-color";
import { Label, PillButton, Tile } from "@/components/signal";
import { BoardTable } from "@/components/compete/board-table";
import { CompeteFooter, CompeteHeader } from "@/components/compete/header";
import { loadBoard } from "@/lib/competition-load";
import { TELEGRAM_URL } from "@/lib/community";
import { agoOf, entriesFull, phaseOf, previewOf } from "@/lib/competition-view";

export const metadata: Metadata = { title: "Leaderboard", description: "The Koul trading competition, ranked by return." };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const preview = previewOf(sp.preview);
  const page = Math.max(1, Number(sp.page ?? 1) | 0);
  const { info, board, now } = await loadBoard(preview, (page - 1) * PER_PAGE, PER_PAGE);
  const phase = phaseOf(info.config, now);
  const pages = Math.max(1, Math.ceil(board.total / PER_PAGE));
  const at = (p: number) => `/compete/leaderboard?page=${p}${preview ? `&preview=${preview}` : ""}`;
  return (
    <>
      <ThemeColor />
      <AutoRefresh everyMs={60_000} />
      <main className="mx-auto grid w-full max-w-[1100px] gap-5 px-4 py-6 md:px-8 md:py-10">
        <CompeteHeader active="leaderboard" joinable={(phase === "upcoming" || phase === "live") && !entriesFull(info)} />
        <div className="grid gap-2">
          <h1 className="t-title">Leaderboard</h1>
          <Label>
            Return on the starting basket · {board.total} {board.total === 1 ? "trader" : "traders"} · scored {agoOf(board.updatedAt, now)}
          </Label>
        </div>
        <Tile>
          {board.rows.length > 0 ? (
            <BoardTable rows={board.rows} preview={preview} />
          ) : (
            <p className="py-6 text-[16px] text-muted">
              {phase === "none" ? "There is no competition running right now." : phase === "upcoming" ? "The board fills when the competition starts." : "Scores show here a few minutes after the first entries are confirmed."}
            </p>
          )}
        </Tile>
        {pages > 1 && (
          <nav className="flex items-center justify-between gap-3" aria-label="Pages">
            <PillButton href={at(page - 1)} variant="outline" disabled={page <= 1}>Previous</PillButton>
            <Label>Page {page} of {pages}</Label>
            <PillButton href={at(page + 1)} variant="outline" disabled={page >= pages}>Next</PillButton>
          </nav>
        )}
        <div className="grid gap-2 text-[15px] text-muted">
          <p>Not ranked: the entry made a move its autopilot did not, added money or XLM, or has a rule on USD/TRY. See the <Link href="/compete#rules" className="text-accent-text">rules</Link> and the <Link href="/compete/terms" className="text-accent-text">full terms</Link>.</p>
          {TELEGRAM_URL && <p>Winners are contacted in the <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="text-accent-text">Koul Telegram group</a>. Join it if you entered.</p>}
        </div>
        <CompeteFooter />
      </main>
    </>
  );
}
