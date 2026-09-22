"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Label, Loadable, Sk, TextSegmented, Tile, TileLabel } from "@/components/signal";
import { MOCK_HISTORY, mockedHistory } from "@/lib/mock";
import { lastDays, type HistoryPoint } from "@/lib/model/history";
import { cn } from "@/lib/utils";
import { agoShort } from "@/lib/model/labels";

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
    {/* The line is revealed from left to right in 700 ms. A clip, not pathLength: the stretched drawing and its
        unstretched stroke measure length differently, and a dash-based draw leaves gaps in the line. */}
    <motion.svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full min-h-24 w-full" role="img" aria-label="Balance over time" initial={{ clipPath: "inset(0 100% 0 0)" }} animate={{ clipPath: "inset(0 0% 0 0)" }} transition={{ duration: 0.7, ease: "easeOut" }}>
      <polyline points={d} fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </motion.svg>
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

/** Less than this much history and a line would only be a step: the tile shows where it started instead. */
const MIN_SPAN_MS = 24 * 3_600_000;

/**
 * The balance line, from the wallet's own deposits and sends (lib/model/history). It starts at the first deposit,
 * never on the empty stretch before it, and only once there is a day of history; before that the tile says where
 * the line begins. The range cuts the same series. The mock line only draws behind its demo flag.
 */
export function ChartTile({ balance, series, loading, now, className }: { balance: number | null; series: HistoryPoint[] | null; loading: boolean; now: number; className?: string }) {
  const [range, setRange] = React.useState<Range>("30D");
  const days = range === "7D" ? 7 : range === "30D" ? 30 : null;
  const firstFunded = series?.findIndex((p) => p.v > 0) ?? -1;
  const funded = series && firstFunded >= 0 ? series.slice(firstFunded) : null;
  const start = funded?.[0] ?? null;
  const enough = start !== null && now - start.t >= MIN_SPAN_MS;
  const real = funded && enough ? lastDays(funded, days, now).filter((p) => p.t >= start.t) : null;
  const drawn = real && real.length >= 2 ? real : MOCK_HISTORY && balance !== null && balance > 0 ? mockedHistory(balance, days ?? 60).series : null;
  return (
    <Tile className={cn("flex flex-col", className)}>
      <div className="flex min-h-11 items-center justify-between">
        <TileLabel>Balance</TileLabel>
        {drawn && <TextSegmented label="Range" value={range} onChange={setRange} options={[{ value: "7D", label: "7D" }, { value: "30D", label: "30D" }, { value: "ALL", label: "ALL" }]} />}
      </div>
      <Loadable loading={loading} skeleton={<Sk className="h-24 w-full rounded-xl" />} className="mt-4 flex min-h-24 flex-1 items-center justify-center">
        {drawn ? <Line key={range} points={drawn} /> : (
          <div className="flex w-full flex-col justify-end gap-2 self-stretch">
            {start ? (
              <>
                <span className="text-[17px] font-bold">Your line starts here</span>
                <Label>First deposit {start.v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC · {agoShort(start.t, now)} ago</Label>
              </>
            ) : (
              <>
                <span className="text-[17px] font-bold">No balance yet</span>
                <Label>Deposit to start the line</Label>
              </>
            )}
          </div>
        )}
      </Loadable>
    </Tile>
  );
}
