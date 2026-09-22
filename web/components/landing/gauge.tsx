"use client";

/**
 * A reading against a level: a track, a tick where the level sits, a bar that grows to the reading and a marker on
 * its end. One animated value drives the bar, the marker, the number and the colour, so they move together and the
 * bar turns accent at the exact moment the reading crosses the level. Only transforms move.
 */
import * as React from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { Label } from "@/components/signal";
import { cn } from "@/lib/utils";

/** The track's width in pixels, so the bar and the marker can share one pixel position. */
function useTrackWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export function Gauge({ label, value, level, min, max, below = true, unit = "", durationMs = 2200, decimals = 2 }: {
  label: string;
  value: number;
  level: number;
  min: number;
  max: number;
  /** The condition holds under the level (true) or at and above it (false). */
  below?: boolean;
  unit?: string;
  durationMs?: number;
  decimals?: number;
}) {
  const track = React.useRef<HTMLDivElement>(null);
  const width = useTrackWidth(track);
  const reading = useMotionValue(value);
  const holds = (v: number) => (below ? v < level : v >= level);
  const [held, setHeld] = React.useState(() => holds(value));

  React.useEffect(() => {
    const controls = animate(reading, value, { duration: durationMs / 1000, ease: "easeInOut" });
    return () => controls.stop();
  }, [reading, value, durationMs]);
  useMotionValueEvent(reading, "change", (v) => setHeld(holds(v)));

  const pct = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  const scale = useTransform(reading, (v) => pct(v));
  const x = useTransform(reading, (v) => pct(v) * width);
  const text = useTransform(reading, (v) => `${v.toFixed(decimals)}${unit}`);

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <Label>{label}</Label>
        <motion.span className={cn("mono num text-[15px] transition-colors", held ? "text-accent-text" : "text-text")}>{text}</motion.span>
      </div>
      <div ref={track} className="relative h-2">
        {/* The track clips the bar, so its end stays square under the marker instead of a squashed round cap. */}
        <div className="absolute inset-0 overflow-hidden rounded-full bg-surface-2">
          <motion.div className={cn("h-full w-full origin-left transition-colors", held ? "bg-lime" : "bg-line")} style={{ scaleX: scale }} />
        </div>
        {/* The level: a tick that never moves, so the reading is always read against it. */}
        <span className="absolute inset-y-[-6px] w-0.5 bg-text/70" style={{ left: `${pct(level) * 100}%` }} aria-hidden />
        <motion.span
          className={cn("pointer-events-none absolute left-0 top-1/2 -ml-[7px] size-3.5 -translate-y-1/2 rounded-full transition-colors", held ? "bg-lime" : "bg-text")}
          style={{ x }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between">
        <Label tone="muted">{min.toFixed(decimals)}{unit}</Label>
        <Label tone={held ? "lime" : "muted"}>level {level.toFixed(decimals)}{unit}</Label>
        <Label tone="muted">{max.toFixed(decimals)}{unit}</Label>
      </div>
    </div>
  );
}
