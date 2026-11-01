"use client";

/**
 * A day of quarter hours as thin bars, one series, one axis: the status page's pass time and trades. Hovering a bar
 * (or focusing it) shows its time and value; a missing quarter is a gap, not a zero. `slot="day"` draws one bar per UTC
 * day instead (the traction page), labelled by date. `marks` (day slots only) puts a numbered dashed line on the day of
 * each event, and its label in that day's tooltip.
 */
import * as React from "react";

export interface BarPoint { at: number; value: number | null }
export interface BarMark { at: number; label: string }

const W = 960, H = 140, PAD_TOP = 4, PAD_BOTTOM = 0;
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const date = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** `unit` and `units`: "trade" / "trades", or the same word twice ("s"). */
export function BarChart({ points, unit, units = unit, decimals = 0, label, slot: bucket = "quarter", marks = [] }: { points: BarPoint[]; unit: string; units?: string; decimals?: number; label: string; slot?: "quarter" | "day"; marks?: BarMark[] }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  const slot = W / points.length;
  const bar = Math.max(2, slot - 2); // a 2 px gap between bars
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;
  const fmt = (v: number) => `${v.toFixed(decimals)} ${Number(v.toFixed(decimals)) === 1 ? unit : units}`;
  const h = hover !== null ? points[hover] : null;
  // Each mark on the bar of its UTC day, numbered in the order given; marks outside the chart's days are left out.
  const placed = bucket === "day" ? marks.map((m, n) => ({ ...m, n: n + 1, i: points.findIndex((p) => utcDay(p.at) === utcDay(m.at)) })).filter((m) => m.i >= 0) : [];
  const hoverMarks = h ? placed.filter((m) => m.i === hover) : [];
  return (
    <figure className="relative" aria-label={label}>
      {/* Labels are HTML, not SVG text: the plot scales to its tile and SVG text would shrink with it. */}
      <div className="relative">
        <div className="mono mb-1 text-muted">{fmt(max)}</div>
        {placed.map((m) => (
          <span key={m.n} title={m.label} className="mono absolute top-0 -translate-x-1/2 rounded-full border border-line bg-surface px-1.5 text-[12px] text-muted" style={{ left: `${((m.i + 0.5) / points.length) * 100}%` }}>{m.n}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-36 w-full" role="img" aria-label={`${label}, ${bucket === "day" ? `${points.length} days` : "last 24 hours"}, up to ${fmt(max)}`} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={PAD_TOP + plotH} y2={PAD_TOP + plotH} className="stroke-line" strokeWidth={1} />
        {placed.map((m) => <line key={m.n} x1={(m.i + 0.5) * slot} x2={(m.i + 0.5) * slot} y1={0} y2={PAD_TOP + plotH} className="stroke-muted" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />)}
        {points.map((p, i) => {
          const x = i * slot + (slot - bar) / 2;
          const top = p.value !== null ? y(p.value) : PAD_TOP + plotH;
          const height = Math.max(0, PAD_TOP + plotH - top);
          return (
            <g key={p.at}>
              {p.value !== null && height > 0 && (
                <path
                  d={`M${x},${PAD_TOP + plotH} V${top + Math.min(4, height)} Q${x},${top} ${x + Math.min(2, bar / 2)},${top} H${x + bar - Math.min(2, bar / 2)} Q${x + bar},${top} ${x + bar},${top + Math.min(4, height)} V${PAD_TOP + plotH} Z`}
                  className={hover === null || hover === i ? "fill-chart-1" : "fill-chart-1 opacity-40"}
                />
              )}
              {/* A hit target taller and wider than the bar. */}
              <rect x={i * slot} y={0} width={slot} height={H - PAD_BOTTOM} fill="transparent" tabIndex={-1} onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {bucket === "day"
        ? <div className="mono mt-1 flex justify-between text-muted"><span>{points.length ? date(points[0]!.at) : ""}</span><span>{points.length ? date(points[points.length - 1]!.at) : ""}</span></div>
        : <div className="mono mt-1 flex justify-between text-muted"><span>24 h ago</span><span>now</span></div>}
      {h && (
        <figcaption
          className="pointer-events-none absolute top-6 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-sm"
          style={{ left: `clamp(0px, calc(${((hover! + 0.5) / points.length) * 100}% - 70px), calc(100% - 140px))` }}
        >
          <div className="mono text-muted">{bucket === "day" ? date(h.at) : `${hhmm(h.at)} – ${hhmm(h.at + 15 * 60_000)}`}</div>
          <div className="mono text-text">{h.value === null ? "no data" : fmt(h.value)}</div>
          {hoverMarks.map((m) => <div key={m.n} className="mt-1 max-w-[220px] text-muted">{m.n}. {m.label}</div>)}
        </figcaption>
      )}
    </figure>
  );
}
