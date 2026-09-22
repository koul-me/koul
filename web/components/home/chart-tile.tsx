"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Label, Loadable, Sk, TextSegmented, Tile, TileLabel } from "@/components/signal";
import { MOCK_HISTORY, mockedHistory } from "@/lib/mock";
import { lastDays, type HistoryPoint } from "@/lib/model/history";
import { cn } from "@/lib/utils";

type Range = "7D" | "30D" | "ALL";

function Line({ points }: { points: HistoryPoint[] }) {
  const w = 100;
  const h = 40;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const y = (v: number) => h - ((v - min) / span) * (h - 6) - 3;
  // Placed by time, so a deposit reads as the step it was and a quiet month as a flat line.
  const t0 = points[0]!.t;
  const tSpan = points[points.length - 1]!.t - t0 || 1;
  const d = points.map((p) => `${((p.t - t0) / tSpan) * w},${y(p.v)}`).join(" ");
  const endTop = (y(points[points.length - 1]!.v) / h) * 100;
  return (
    <div className="relative h-full w-full">
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full min-h-24 w-full" role="img" aria-label="Balance over time">
      {/* The line draws itself from left to right in 700 ms when the series lands. */}
      <motion.polyline points={d} fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: "easeOut" }} />
    </svg>
      {/* Today: a ring on the end of the line, placed in HTML so the stretched drawing does not squash it. */}
      <motion.span
        className="absolute right-0 size-3 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-accent-text bg-surface"
        style={{ top: `${endTop}%` }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.65, duration: 0.25 }}
        aria-hidden
      />
    </div>
  );
}

/**
 * The balance line, from the wallet's own deposits and sends (lib/model/history). The range cuts the same series;
 * a wallet with nothing yet says so. The mock line only draws behind its demo flag.
 */
export function ChartTile({ balance, series, loading, className }: { balance: number | null; series: HistoryPoint[] | null; loading: boolean; className?: string }) {
  const [range, setRange] = React.useState<Range>("30D");
  const days = range === "7D" ? 7 : range === "30D" ? 30 : null;
  const real = series ? lastDays(series, days) : null;
  const drawn = real && real.length >= 2 && real.some((p) => p.v > 0) ? real : MOCK_HISTORY && balance !== null && balance > 0 ? mockedHistory(balance, days ?? 60).series : null;
  const empty = !loading && (balance === null || balance <= 0);
  return (
    <Tile className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between">
        <TileLabel>Balance</TileLabel>
        <TextSegmented label="Range" value={range} onChange={setRange} options={[{ value: "7D", label: "7D" }, { value: "30D", label: "30D" }, { value: "ALL", label: "ALL" }]} />
      </div>
      <Loadable loading={loading} skeleton={<Sk className="h-24 w-full rounded-xl" />} className="mt-4 flex min-h-24 flex-1 items-center justify-center">
        {drawn ? <Line key={range} points={drawn} /> : (
          <div className="flex w-full flex-col items-center gap-3">
            <Label>{empty ? "Deposit to start the chart" : "No chart yet"}</Label>
            <span aria-hidden className="w-full border-t border-dashed border-line" />
          </div>
        )}
      </Loadable>
    </Tile>
  );
}
