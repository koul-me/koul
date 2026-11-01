"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Label, Sk, StatusDot, Tile, TileLabel, useDelayed } from "@/components/signal";
import { RuleLine } from "@/components/rules/rule-line";
import type { AutopilotLiveState } from "@/hooks/use-autopilot-live";
import { agoShort, observedLabel } from "@/lib/model/labels";
import { cn } from "@/lib/utils";
import { useAppHref } from "@/lib/app-base";
import { BorderBeam } from "@/components/ui/border-beam";
import { ShimmerButton } from "@/components/ui/shimmer-button";

const SHOWN = 4;

/** Read-only. Watching with the first four rules, or the dashed Off tile. The whole tile leads to Autopilot. */
export function AutopilotTile({ ap, now }: { ap: AutopilotLiveState; now: number }) {
  const appHref = useAppHref();
  const router = useRouter();
  const loading = ap.loading && ap.status === "off";
  const showSkeleton = useDelayed(loading);
  if (loading) {
    if (!showSkeleton) return <Tile className="min-h-[220px]" aria-busy />;
    return (
      <Tile className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]" aria-busy>
        <div><TileLabel>Autopilot</TileLabel><Sk className="mt-4 h-12 w-48 rounded-xl" /><Sk className="mt-4 h-3.5 w-24" /></div>
        <div className="divide-y divide-line">{[0, 1, 2].map((i) => <div key={i} className="flex items-center justify-between py-5"><Sk className="h-4 w-56" /><Sk className="h-4 w-20" /></div>)}</div>
      </Tile>
    );
  }
  if (ap.status === "off") {
    return (
      <Tile tone="dashed" className="grid animate-fade-in gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] md:items-center">
        <div>
          <TileLabel>Autopilot</TileLabel>
          <div className="mt-2 flex items-center gap-3"><StatusDot on={false} size="md" /><span className="t-value">Off</span></div>
          <Label className="mt-3 block">No rules yet</Label>
        </div>
        <p className="text-[22px] font-bold leading-tight md:text-[26px]">Set the rules once.<br />Koul does the rest.</p>
        {/* Research: Magic UI Shimmer Button, lime ground with a light running round its edge. */}
        <ShimmerButton
          onClick={() => router.push(appHref("/autopilot"))}
          background="var(--lime)"
          shimmerColor="#ffffff"
          className="h-14 w-full px-7 text-[17px] font-bold text-on-lime md:w-auto"
        >
          Set up autopilot
        </ShimmerButton>
      </Tile>
    );
  }
  const on = ap.rules.filter((r) => r.rule.enabled).length;
  const more = ap.rules.length - SHOWN;
  const paused = ap.status === "paused";
  return (
    <Link href={appHref("/autopilot")} className="block animate-fade-in rounded-[var(--radius-tile)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text" aria-label="Autopilot">
      <Tile className="relative grid gap-6 overflow-hidden transition-colors hover:bg-surface-2/60 md:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        {/* Research: Magic UI Border Beam runs round the tile while the autopilot is watching. */}
        {!paused && <BorderBeam size={120} duration={8} colorFrom="var(--lime)" colorTo="transparent" />}
        <div>
          <TileLabel>Autopilot</TileLabel>
          <div className="mt-2 flex items-center gap-3">{paused ? <StatusDot on={false} size="md" /> : <span aria-hidden className="uiverse-pulse inline-block size-3.5 shrink-0" />}<span className="t-value">{paused ? "Stopped" : "Watching"}</span></div>
          <div className="mt-3 flex flex-col gap-1">
            <Label>{on} {on === 1 ? "rule" : "rules"} {paused ? "kept" : "on"}</Label>
            {ap.nowOn !== null ? <Label>Now on rule {ap.nowOn}</Label> : <Label>Nothing to do right now</Label>}
          </div>
        </div>
        <div className="divide-y divide-line">
          {ap.rules.slice(0, SHOWN).map((r) => (
            <RuleLine key={r.rule.id} index={r.index} rule={r.rule} current={r.current} runs={r.runs} ranAgo={r.current && r.lastRunAt ? agoShort(r.lastRunAt, now) : null} now={observedLabel(r.rule.conditions[0]!, r.observed)} />
          ))}
          {more > 0 && (
            <div className={cn("flex items-center justify-between pt-4")}>
              <Label tone="lime">+{more} more {more === 1 ? "rule" : "rules"}</Label>
              <ArrowRight className="size-4 text-accent-text" aria-hidden />
            </div>
          )}
        </div>
      </Tile>
    </Link>
  );
}
