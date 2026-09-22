"use client";

/**
 * A reading against a level: a track, a tick where the level sits, a bar that grows to the reading and a marker on
 * its end. The bar turns accent once the reading is past the level, which is the whole idea of a condition in one
 * picture. Only transforms move.
 */
import { motion } from "motion/react";
import { Label } from "@/components/signal";
import { Rolling } from "@/components/signal/rolling";
import { cn } from "@/lib/utils";

export function Gauge({ label, value, level, min, max, held, unit = "", durationMs = 2200, decimals = 2 }: {
  label: string;
  value: number;
  level: number;
  min: number;
  max: number;
  /** The condition holds: the bar and the reading turn accent. */
  held: boolean;
  unit?: string;
  durationMs?: number;
  decimals?: number;
}) {
  const pct = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  const seconds = durationMs / 1000;
  const text = `${value.toFixed(decimals)}${unit}`;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <Label>{label}</Label>
        <span className={cn("mono num text-[15px]", held ? "text-accent-text" : "text-text")}><Rolling text={text} durationMs={durationMs} /></span>
      </div>
      <div className="relative h-2 rounded-full bg-surface-2">
        <motion.div
          className={cn("absolute inset-y-0 left-0 w-full origin-left rounded-full", held ? "bg-lime" : "bg-line")}
          style={{ transformOrigin: "left" }}
          animate={{ scaleX: pct(value) }}
          initial={false}
          transition={{ duration: seconds, ease: "easeInOut" }}
        />
        {/* The level: a tick that never moves, so the reading is always read against it. */}
        <span className="absolute inset-y-[-6px] w-0.5 bg-text/70" style={{ left: `${pct(level) * 100}%` }} aria-hidden />
        <div className="pointer-events-none absolute inset-0">
          <motion.div className="h-full w-full" animate={{ x: `${pct(value) * 100}%` }} initial={false} transition={{ duration: seconds, ease: "easeInOut" }}>
            <span className={cn("absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full", held ? "bg-lime" : "bg-text")} aria-hidden />
          </motion.div>
        </div>
      </div>
      <div className="flex justify-between">
        <Label tone="dim">{min.toFixed(decimals)}{unit}</Label>
        <Label tone={held ? "lime" : "dim"}>level {level.toFixed(decimals)}{unit}</Label>
        <Label tone="dim">{max.toFixed(decimals)}{unit}</Label>
      </div>
    </div>
  );
}
