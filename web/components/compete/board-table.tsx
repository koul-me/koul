import type { LeaderboardRow } from "@koul/core";
import { Label } from "@/components/signal";
import { fmtPct, fmtSignedUsd, fmtUsd } from "@/lib/competition-view";
import { cn } from "@/lib/utils";

/**
 * The ranked board. Rank, handle and return always show; value and P&L join from tablet width. An entry the indexer
 * flagged (a manual move, added money) stays visible with "Not ranked" instead of a rank.
 */
export function BoardTable({ rows, preview }: { rows: LeaderboardRow[]; preview?: string | null }) {
  const href = (h: string) => `/compete/${encodeURIComponent(h)}${preview ? `?preview=${preview}` : ""}`;
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="label text-muted">
          <th scope="col" className="w-14 py-3 font-normal">Rank</th>
          <th scope="col" className="py-3 font-normal">Trader</th>
          <th scope="col" className="hidden py-3 text-right font-normal md:table-cell">Value</th>
          <th scope="col" className="hidden py-3 text-right font-normal md:table-cell">P&amp;L</th>
          <th scope="col" className="py-3 text-right font-normal">Return</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.wallet} className={cn("border-t border-line", r.flagged && "text-muted")}>
            <td className="mono py-3 text-[14px] text-muted">{r.rank ?? "–"}</td>
            <td className="py-3">
              <a href={href(r.handle)} className="text-[15px] font-semibold transition-colors hover:text-accent-text">{r.handle}</a>
              {r.flagged && <Label tone="dim" className="ml-3">Not ranked</Label>}
              {r.pending && <Label tone="dim" className="ml-3">Scoring soon</Label>}
            </td>
            <td className="mono hidden py-3 text-right text-[14px] md:table-cell">{r.pending ? "–" : fmtUsd(r.valueUsd)}</td>
            <td className="mono hidden py-3 text-right text-[14px] md:table-cell">{r.pending ? "–" : fmtSignedUsd(r.pnlUsd)}</td>
            <td className={cn("mono py-3 text-right text-[14px]", !r.flagged && r.rank === 1 && "text-accent-text")}>{fmtPct(r.returnPct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
