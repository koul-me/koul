import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { KoulMark } from "@/components/brand/koul-mark";
import { Label, Tile, TileLabel } from "@/components/signal";
import { BarChart } from "@/components/status/bar-chart";
import type { PublicStatus } from "@/lib/status-server";
import { cn } from "@/lib/utils";

const ago = (t: number | null, now: number) => {
  if (t === null) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Tile className="grid gap-2 p-5">
      <TileLabel>{label}</TileLabel>
      <span className="t-value">{value}</span>
      {note && <Label>{note}</Label>}
    </Tile>
  );
}

export function ChartTile({ title, unit, units, decimals, points, slot = "quarter" }: { title: string; unit: string; units?: string; decimals?: number; points: { at: number; value: number | null }[]; slot?: "quarter" | "day" }) {
  const rows = points.filter((p) => p.value !== null);
  return (
    <Tile className="grid gap-4 p-5">
      <TileLabel>{title}</TileLabel>
      <BarChart points={points} unit={unit} units={units} decimals={decimals} label={title} slot={slot} />
      <details>
        <summary className="label cursor-pointer text-muted">Show as table</summary>
        <div className="mt-3 max-h-64 overflow-y-auto">
        <table className="mono w-full text-left">
          <thead><tr className="text-muted"><th className="py-1 font-normal">{slot === "day" ? "Day (UTC)" : "Quarter hour"}</th><th className="py-1 text-right font-normal">{title}</th></tr></thead>
          <tbody>
            {rows.map((p) => <tr key={p.at} className="border-t border-line"><td className="py-1">{slot === "day" ? new Date(p.at).toISOString().slice(0, 10) : new Date(p.at).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</td><td className="py-1 text-right">{p.value!.toFixed(decimals ?? 0)} {p.value === 1 ? unit : units ?? unit}</td></tr>)}
          </tbody>
        </table>
        </div>
      </details>
    </Tile>
  );
}

/** The public status: one headline, the keeper's numbers, a day of charts. The private page adds to it. */
export function StatusView({ s, now, children }: { s: PublicStatus; now: number; children?: React.ReactNode }) {
  const Icon = s.healthy ? CheckCircle2 : AlertTriangle;
  return (
    <main className="mx-auto grid w-full max-w-[1100px] gap-5 px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-center justify-between">
        <a href="https://koul.me" className="inline-flex items-center gap-2 text-[24px] font-extrabold tracking-tight"><KoulMark className="size-7" />KOUL</a>
        <Label>Status<span className="hidden sm:inline"> · refreshes every 30 s</span></Label>
      </header>
      <Tile tone={s.healthy ? "lime" : "outlined"} className={cn("flex items-center gap-4 p-6 md:p-8", !s.healthy && "border-danger")}>
        <Icon className={cn("size-8 shrink-0", s.healthy ? "text-on-lime" : "text-danger")} aria-hidden />
        <div>
          <h1 className="t-title">{s.headline}</h1>
          <p className={cn("mt-2 text-[16px]", s.healthy ? "text-on-lime" : "text-muted")}>
            {s.healthy ? "The keeper is checking every autopilot and the contracts are in good shape." : "The team has been told and is looking at it."}
          </p>
        </div>
      </Tile>
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Keeper">
        <Stat label="Last check" value={ago(s.lastPassAt, now)} />
        <Stat label="Pass time" value={s.passSec === null ? "-" : `${s.passSec} s`} note="One check of every autopilot" />
        <Stat label="Autopilots watched" value={s.wallets === null ? "-" : String(s.wallets)} />
        <Stat label="Trades last hour" value={s.tradesLastHour === null ? "-" : String(s.tradesLastHour)} note="Autopilot runs on chain" />
      </section>
      {/* items-start: opening one chart's table must not stretch the other tile in the row. */}
      <section className="grid items-start gap-4 md:grid-cols-2" aria-label="Last 24 hours">
        <ChartTile title="Pass time" unit="s" decimals={1} points={s.buckets.map((b) => ({ at: b.at, value: b.passSec }))} />
        <ChartTile title="Trades sent by the keeper" unit="trade" units="trades" points={s.buckets.map((b) => ({ at: b.at, value: b.passSec === null ? null : b.trades }))} />
      </section>
      {s.historySince !== null && now - s.historySince < 23 * 3600_000 && <Label>History since {new Date(s.historySince).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</Label>}
      {s.competition.running && (
        <Tile className="flex flex-wrap items-center justify-between gap-3 p-5">
          <TileLabel>Competition</TileLabel>
          <span className="mono">{s.competition.entrants} entrants · scored {ago(s.competition.updatedAt, now)}</span>
        </Tile>
      )}
      {children}
    </main>
  );
}
