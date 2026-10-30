import type { HistoryPoint } from "@koul/core";
import { fmtPct } from "@/lib/competition-view";

/**
 * One entry's return over the competition: a single 2 px line on a recessive zero line, the latest value labelled at
 * its end. One series, so no legend; the table under it carries the same numbers.
 */
export function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const pts = points.filter((p) => p.returnPct !== null) as (HistoryPoint & { returnPct: number })[];
  if (pts.length < 2) return <p className="text-[15px] text-muted">The chart starts after a few scoring runs.</p>;
  const W = 720, H = 220, PX = 8, PY = 18;
  const t0 = pts[0]!.at, t1 = pts[pts.length - 1]!.at;
  const lo = Math.min(0, ...pts.map((p) => p.returnPct)), hi = Math.max(0, ...pts.map((p) => p.returnPct));
  const span = hi - lo || 1;
  const x = (t: number) => PX + ((t - t0) / (t1 - t0 || 1)) * (W - PX * 2 - 96);
  const y = (v: number) => PY + (1 - (v - lo) / span) * (H - PY * 2);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)} ${y(p.returnPct).toFixed(1)}`).join("");
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Return over time, now ${fmtPct(last.returnPct)}`}>
      <line x1={PX} x2={W - PX} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.at)} cy={y(last.returnPct)} r="5" fill="var(--accent-text)" stroke="var(--surface)" strokeWidth="2" />
      <text x={x(last.at) + 12} y={y(last.returnPct) + 5} fill="var(--text)" fontSize="20" fontFamily="var(--font-mono)">{fmtPct(last.returnPct)}</text>
    </svg>
  );
}
