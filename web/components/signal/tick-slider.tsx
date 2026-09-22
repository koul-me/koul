"use client";

/**
 * A value picked by dragging across a row of ticks. The ticks up to the value are ink, the one under the value is
 * lime, the rest are faint; the row has a gentle wave so it reads as a level, not a ruler. While a drag is on, the
 * number follows the finger and a small "+12" says how far it moved; the value is committed once, on release, so a
 * drag is one change (one Undo), not forty. A real range input sits on top, so keys, screen readers and touch work.
 */
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { tween } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** The wave the ticks follow, 0.45 to 1 of the full height: a rise, a soft dip, a second rise. */
const wave = (t: number) => 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(Math.PI * (2.2 * t - 0.35))) ** 0.8;

export function TickSlider({ value, min, max, step = 1, onCommit, format, label, ticks = 36, empty, size = "md", className }: {
  /** Null shows no value yet ("Mixed"): every tick faint until the first drag. */
  value: number | null;
  min: number;
  max: number;
  step?: number;
  onCommit: (v: number) => void;
  /** The number and its unit, drawn apart so the unit can be quiet: { main: "60", unit: "%" }. */
  format: (v: number) => { main: string; unit?: string };
  /** What the value is, for screen readers. */
  label: string;
  ticks?: number;
  /** What to show when value is null. */
  empty?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [draft, setDraft] = React.useState<number | null>(null);
  const [start, setStart] = React.useState<number | null>(null);
  const shown = draft ?? value;
  const pct = shown === null ? -1 : (shown - min) / (max - min || 1);
  const at = shown === null ? -1 : Math.round(pct * (ticks - 1));
  const delta = draft !== null && start !== null ? Math.round((draft - start) / step) * step : 0;
  const text = shown === null ? { main: empty ?? "–" } : format(shown);

  const begin = () => { if (start === null) setStart(value ?? min); };
  const finish = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
    setStart(null);
  };

  return (
    <div className={cn("group relative grid gap-2", className)}>
      <div className="flex items-baseline gap-2">
        <span className={cn("num font-bold leading-none tracking-tight", size === "sm" ? "text-[22px]" : "text-[32px]")}>{text.main}</span>
        {text.unit && <span className="text-[15px] text-muted">{text.unit}</span>}
        <AnimatePresence>
          {delta !== 0 && (
            <motion.span
              key="delta"
              className={cn("mono num text-[13px]", delta > 0 ? "text-accent-text" : "text-danger")}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { delay: 0.6, duration: 0.3 } }}
              transition={tween()}
            >
              {delta > 0 ? "+" : "−"}{Math.abs(delta)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className={cn("relative flex items-end justify-between gap-[3px]", size === "sm" ? "h-10" : "h-14")} aria-hidden>
        {Array.from({ length: ticks }, (_, i) => (
          <span
            key={i}
            className={cn("w-full max-w-[6px] rounded-full", i === at ? "bg-lime" : i < at ? "bg-text" : "bg-line")}
            style={{ height: `${wave(i / (ticks - 1)) * 100}%` }}
          />
        ))}
        {/* The real control, invisible, covering the ticks: drag, tap, arrows, Home and End all work. */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={shown ?? min}
          aria-label={label}
          aria-valuetext={shown === null ? empty : `${text.main}${text.unit ?? ""}`}
          onPointerDown={begin}
          onKeyDown={begin}
          onChange={(e) => { begin(); setDraft(Number(e.target.value)); }}
          onPointerUp={finish}
          onKeyUp={finish}
          onBlur={finish}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      {/* Focus shows on the whole control, since the input itself is invisible. */}
      <span className="pointer-events-none absolute -inset-2 rounded-[var(--radius-group)] border-2 border-accent-text opacity-0 group-has-[input:focus-visible]:opacity-100" aria-hidden />
    </div>
  );
}
