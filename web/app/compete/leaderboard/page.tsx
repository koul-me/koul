import type { Metadata } from "next";
import { PAGE_TITLE, STAT_VALUE } from "@/components/compete/type";
import { AutoRefresh } from "@/components/status/auto-refresh";
import { ThemeColor } from "@/components/shell/theme-color";
import { FitValue, Label, PillButton, Tile, TileLabel } from "@/components/signal";
import { BoardTable } from "@/components/compete/board-table";
import { CompeteFooter, CompetePage } from "@/components/compete/header";
import { loadBoard } from "@/lib/competition-load";
import { previewOf, scoredOf } from "@/lib/competition-view";
import { readTraction } from "@/lib/traction-server";

export const metadata: Metadata = { title: "Leaderboard", description: "Every Koul wallet on Stellar testnet, ranked by return, with live autopilot stats." };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usdWhole = (v: number) => `$${whole.format(v)}`;

/**
 * Every wallet the router lists, ranked by return (the indexer's live board), under four numbers from the traction
 * collector: live autopilots, trades executed, trades in the last 24 hours and swap volume. Both count every wallet,
 * Koul's own included, and the footnote says so.
 */
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const preview = previewOf(sp.preview);
  const page = Math.max(1, Number(sp.page ?? 1) | 0);
  const [{ info, board, now }, traction] = await Promise.all([loadBoard(preview, (page - 1) * PER_PAGE, PER_PAGE), readTraction().catch(() => null)]);
  const pages = Math.max(1, Math.ceil(board.total / PER_PAGE));
  const at = (p: number) => `/compete/leaderboard?page=${p}${preview ? `&preview=${preview}` : ""}`;
  const t = traction?.collected ? traction.summary.all : null;
  return (
    <>
      <ThemeColor />
      <AutoRefresh everyMs={60_000} />
      <CompetePage section={null} joinable={false}>
        <div className="grid gap-2">
          <h1 className={PAGE_TITLE}>Leaderboard</h1>
          <Label>
            Every Koul wallet, ranked by return · {board.total} {board.total === 1 ? "wallet" : "wallets"} · {scoredOf(info.config, board.updatedAt, now)}
          </Label>
        </div>
        {t && (
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Koul in numbers">
            <Stat label="Live autopilots" value={whole.format(t.autopilots)} />
            <Stat label="Trades executed" value={whole.format(t.trades)} />
            <Stat label="Trades, last 24 h" value={whole.format(t.trades24h)} />
            <Stat label="Swap volume" value={usdWhole(t.volumeUsd)} />
          </section>
        )}
        <Tile>
          {board.rows.length > 0 ? (
            <BoardTable rows={board.rows} preview={preview} invites={false} />
          ) : (
            <p className="py-6 text-[16px] text-muted">The board fills in a few minutes after the next scoring run.</p>
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
          <p>Return is value against the money that came into the wallet, so a deposit never counts as profit.</p>
          <p>All numbers are Stellar testnet and count every wallet, Koul&apos;s own test wallets included. Swap volume is each swap&apos;s input at the Reflector price.</p>
        </div>
        <CompeteFooter terms={false} />
      </CompetePage>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Tile className="grid gap-2 p-5">
      <TileLabel>{label}</TileLabel>
      <FitValue text={value} base={STAT_VALUE} />
    </Tile>
  );
}
