"use client";

import * as React from "react";
import { FitValue, fitValueClass, Label, Loadable, PillButton, Sk, Tile, TileLabel } from "@/components/signal";
import { useCountUp } from "@/lib/count-up";
import { fmtUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * PnL: today's balance minus what came in net (lib/model/history), so it is the interest earned less interest paid.
 * It needs the history to reach the wallet's start; otherwise it says so instead of guessing.
 */
export function PnlTile({ pnl, pnlPct, loading }: { pnl: number | null; pnlPct: number | null; loading: boolean }) {
  const shown = useCountUp(pnl);
  const skeleton = <><Sk className="h-9 w-28 rounded-xl md:h-12 md:w-32" /><Sk className="mt-4 h-3.5 w-24" /></>;
  const text = shown === null ? "" : `${shown >= 0 ? "+" : "−"}${fmtUsdc(Math.abs(shown))}`;
  return (
    <Tile className="flex h-full min-h-[196px] flex-col">
      <TileLabel>PNL</TileLabel>
      <Loadable loading={loading} skeleton={skeleton} className="mt-auto">
        {pnl !== null && shown !== null ? (
          <div className={cn(fitValueClass(text), pnl >= 0 ? "text-accent-text" : "text-danger")}>{text}</div>
        ) : (
          <div className="flex h-9 items-center md:h-12"><span aria-label="No value" className="block h-1.5 w-12 rounded-full bg-dim" /></div>
        )}
        <div className="mt-4">
          {pnl === null ? <Label>Older than this history</Label> : <Label>{pnlPct === null ? "All time" : `${pnlPct >= 0 ? "+" : "−"}${Math.abs(pnlPct).toFixed(2)}% · all time`}</Label>}
        </div>
      </Loadable>
    </Tile>
  );
}

/** Idle USDC in the wallet, with "Put to work" when there is at least 1 USDC (the router's minimum move). */
export function IdleTile({ idle, loading, target, onPutToWork, busy }: { idle: number | null; loading: boolean; target: string | null; onPutToWork: () => void; busy: boolean }) {
  const can = (idle ?? 0) >= 1 && target !== null;
  const shown = useCountUp(loading ? null : idle);
  const skeleton = <><Sk className="h-9 w-28 rounded-xl md:h-12 md:w-32" /><Sk className="mt-4 h-11 w-32 rounded-full" /></>;
  return (
    <Tile className="flex h-full min-h-[196px] flex-col">
      <TileLabel>Idle</TileLabel>
      <Loadable loading={loading || idle === null} skeleton={skeleton} className="mt-auto">
        <FitValue text={fmtUsdc(shown ?? idle ?? 0)} />
        <div className="mt-4 min-h-11">
          {can ? (
            <PillButton variant="ghost" size="md" onClick={onPutToWork} disabled={busy} aria-busy={busy}>{busy ? "Confirm with your passkey" : "Put to work"}</PillButton>
          ) : (
            <Label>Nothing idle</Label>
          )}
        </div>
      </Loadable>
    </Tile>
  );
}
