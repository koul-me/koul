"use client";

import * as React from "react";
import type { CompetitionInfo } from "@koul/core";
import { useWallet } from "@/hooks/use-wallet";
import { phaseOf } from "@/lib/competition-view";

/**
 * The handle this wallet is entered as while a competition is upcoming or live, else null. Screens that add outside
 * money (Deposit, test USDC, test XLM) use it to warn before the move takes the entry off the board.
 */
export function useCompetitionEntry(): string | null {
  const w = useWallet();
  const [handle, setHandle] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!w.address) return;
    let live = true;
    Promise.all([
      fetch("/api/competition").then((r) => (r.ok ? (r.json() as Promise<CompetitionInfo>) : null)),
      fetch(`/api/competition/status?wallet=${w.address}`).then((r) => (r.ok ? (r.json() as Promise<{ entered: string | null }>) : null)),
    ])
      .then(([info, status]) => {
        const phase = phaseOf(info?.config ?? null, Date.now());
        if (live) setHandle((phase === "upcoming" || phase === "live") && status?.entered ? status.entered : null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [w.address]);
  return handle;
}
