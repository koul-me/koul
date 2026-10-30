import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { HANDLE_PATTERN } from "@koul/core";
import { AutoRefresh } from "@/components/status/auto-refresh";
import { ThemeColor } from "@/components/shell/theme-color";
import { Label, Tile, TileLabel, fitValueClass } from "@/components/signal";
import { CompeteFooter, CompeteHeader } from "@/components/compete/header";
import { HistoryChart } from "@/components/compete/history-chart";
import { loadEntrant } from "@/lib/competition-load";
import { agoOf, entriesFull, fmtPct, fmtSignedUsd, fmtUsd, phaseOf, previewOf } from "@/lib/competition-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return { title: `${handle} · Leaderboard`, description: `${handle}'s autopilot in the Koul trading competition.` };
}

export default async function EntrantPage({ params, searchParams }: Props) {
  const { handle } = await params;
  if (!HANDLE_PATTERN.test(handle)) notFound();
  const preview = previewOf((await searchParams).preview);
  const { info, view, now } = await loadEntrant(preview, handle);
  if (!view) notFound();
  const s = view.score;
  const phase = phaseOf(info.config, now);
  return (
    <>
      <ThemeColor />
      <AutoRefresh everyMs={60_000} />
      <main className="mx-auto grid w-full max-w-[1100px] gap-5 px-4 py-6 md:px-8 md:py-10">
        <CompeteHeader active={null} joinable={(phase === "upcoming" || phase === "live") && !entriesFull(info)} />
        <div className="grid gap-2">
          <h1 className="t-title break-all">{handle}</h1>
          <Label>{s ? `Scored ${agoOf(s.updatedAt, now)}` : "Waiting for the first score"}</Label>
        </div>
        {s?.flagged && (
          <Tile tone="outlined" className="grid gap-2 border-danger">
            <TileLabel className="text-danger">Not ranked</TileLabel>
            <ul className="grid gap-1 text-[16px]">{s.flagReasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="text-[15px] text-muted">Why this happens is in the <Link href="/compete/terms" className="text-accent-text">competition terms</Link>.</p>
          </Tile>
        )}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Score">
          <Stat label="Rank" value={view.rank === null ? "–" : `#${view.rank}`} lime={view.rank === 1} />
          <Stat label="Return" value={fmtPct(s?.returnPct ?? null)} />
          <Stat label="Value" value={s ? fmtUsd(s.valueUsd) : "–"} />
          <Stat label="P&L" value={s ? fmtSignedUsd(s.pnlUsd) : "–"} />
        </section>
        <Tile className="grid gap-4">
          <TileLabel>Return over time</TileLabel>
          <HistoryChart points={view.history} />
          {view.history.length > 1 && (
            <details>
              <summary className="label cursor-pointer text-muted">Show as table</summary>
              <div className="mt-3 max-h-64 overflow-y-auto">
                <table className="mono w-full text-left">
                  <thead><tr className="text-muted"><th className="py-1 font-normal">Time</th><th className="py-1 text-right font-normal">Value</th><th className="py-1 text-right font-normal">Return</th></tr></thead>
                  <tbody>
                    {[...view.history].reverse().map((p) => (
                      <tr key={p.at} className="border-t border-line">
                        <td className="py-1">{new Date(p.at).toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} UTC</td>
                        <td className="py-1 text-right">{fmtUsd(p.valueUsd)}</td>
                        <td className="py-1 text-right">{fmtPct(p.returnPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </Tile>
        {s && (
          <a href={`https://stellar.expert/explorer/testnet/contract/${s.wallet}`} target="_blank" rel="noopener noreferrer" className="label inline-flex min-h-11 items-center gap-2 text-muted transition-colors hover:text-text">
            See the wallet on Stellar Expert<ArrowUpRight className="size-4" aria-hidden />
          </a>
        )}
        <CompeteFooter />
      </main>
    </>
  );
}

function Stat({ label, value, lime }: { label: string; value: string; lime?: boolean }) {
  return (
    <Tile tone={lime ? "lime" : "surface"} className="grid gap-2 p-5">
      <TileLabel className={lime ? "text-on-lime" : undefined}>{label}</TileLabel>
      <span className={fitValueClass(value)}>{value}</span>
    </Tile>
  );
}
