"use client";

/**
 * A day of quarter hours as thin bars, one series, one axis: the status page's pass time and trades. Hovering a bar
 * (or focusing it) shows its time and value; a missing quarter is a gap, not a zero.
 */
import * as React from "react";

export interface BarPoint { at: number; value: number | null }

const W = 960, H = 140, PAD_TOP = 4, PAD_BOTTOM = 0;
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** `unit` and `units`: "trade" / "trades", or the same word twice ("s"). */
export function BarChart({ points, unit, units = unit, decimals = 0, label }: { points: BarPoint[]; unit: string; units?: string; decimals?: number; label: string }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value ?? 0));
  const slot = W / points.length;
  const bar = Math.max(2, slot - 2); // a 2 px gap between bars
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;
  const fmt = (v: number) => `${v.toFixed(decimals)} ${Number(v.toFixed(decimals)) === 1 ? unit : units}`;
  const h = hover !== null ? points[hover] : null;
  return (
    <figure className="relative" aria-label={label}>
      {/* Labels are HTML, not SVG text: the plot scales to its tile and SVG text would shrink with it. */}
      <div className="mono mb-1 text-muted">{fmt(max)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-36 w-full" role="img" aria-label={`${label}, last 24 hours, up to ${fmt(max)}`} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={PAD_TOP + plotH} y2={PAD_TOP + plotH} className="stroke-line" strokeWidth={1} />
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
      <div className="mono mt-1 flex justify-between text-muted"><span>24 h ago</span><span>now</span></div>
      {h && (
        <figcaption
          className="pointer-events-none absolute top-6 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-sm"
          style={{ left: `clamp(0px, calc(${((hover! + 0.5) / points.length) * 100}% - 70px), calc(100% - 140px))` }}
        >
          <div className="mono text-muted">{hhmm(h.at)} – {hhmm(h.at + 15 * 60_000)}</div>
          <div className="mono text-text">{h.value === null ? "no data" : fmt(h.value)}</div>
        </figcaption>
      )}
    </figure>
  );
}
