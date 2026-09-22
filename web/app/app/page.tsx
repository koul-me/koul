"use client";

import * as React from "react";
import { motion } from "motion/react";
import { staggerChild, staggerParent } from "@/lib/motion";
import { usePortfolio } from "@/hooks/use-portfolio";
import { bestPool, useFx, usePools } from "@/hooks/use-market";
import { useAutopilotLive } from "@/hooks/use-autopilot-live";
import { useActivity } from "@/hooks/use-activity";
import { useRunToasts } from "@/hooks/use-run-toasts";
import { DEMO_ON } from "@/components/account/demo";
import { BalanceTile } from "@/components/home/balance-tile";
import { IdleTile, PnlTile } from "@/components/home/pnl-idle";
import { ChartTile } from "@/components/home/chart-tile";
import { AutopilotTile } from "@/components/home/autopilot-tile";
import { PositionsTile } from "@/components/home/positions-tile";
import { ActivityTile } from "@/components/home/activity-tile";
import { PutToWorkDialog } from "@/components/home/put-to-work";
import { PullToRefresh } from "@/components/signal";
import { balanceHistory } from "@/lib/model/history";
import { useWallet, walletCreatedAt } from "@/hooks/use-wallet";

/** A clock that ticks once a minute, for the "2H ago" labels; the number lives in state so renders stay pure. */
function useMinute(): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function HomePage() {
  const pf = usePortfolio();
  const fx = useFx();
  const pools = usePools();
  const ap = useAutopilotLive();
  const activity = useActivity();
  useRunToasts(activity.rows, DEMO_ON);
  const now = useMinute();
  const [putOpen, setPutOpen] = React.useState(false);

  const loaded = pf.loaded;
  const supplied = pf.positions.supplied.A + pf.positions.supplied.B;
  const debt = pf.positions.borrowed.A + pf.positions.borrowed.B;
  const balance = loaded ? pf.positions.idleUsdc + supplied - debt : null;
  const lira = balance !== null && !fx.loading && fx.fx.tryPerUsd > 0 ? balance * fx.fx.tryPerUsd : balance === 0 ? 0 : null;
  const target = bestPool(pools.pools);
  const idle = loaded ? pf.positions.idleUsdc : null;
  const w = useWallet();
  // The balance line and PnL come from the wallet's own deposits and sends; see lib/model/history.
  const history = React.useMemo(() => {
    if (balance === null || !activity.loaded || activity.since === null || !w.address) return null;
    const flows = activity.rows.filter((r) => (r.kind === "deposited" || r.kind === "sent") && typeof r.amount === "number").map((r) => ({ at: r.at, amount: r.amount! }));
    const created = walletCreatedAt(w.address);
    const complete = created !== null && created >= activity.since;
    return balanceHistory(flows, balance, complete ? created : activity.since, complete, now);
  }, [balance, activity.loaded, activity.since, activity.rows, w.address, now]);

  // The tiles arrive one after another, 40 ms apart, each fading in with a 12 px rise.
  const tile = { variants: staggerChild, className: "min-w-0" };
  const refreshAll = () => Promise.all([pf.refresh(), fx.refresh(), pools.refresh(), ap.refresh(), activity.refresh()]);
  return (
    <PullToRefresh onRefresh={refreshAll}>
    <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid gap-4 md:gap-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-5">
        <motion.div {...tile}><BalanceTile balance={balance} lira={lira} loading={!loaded} rate={fx.fx.tryPerUsd > 0 ? { tryPerUsd: fx.fx.tryPerUsd, at: fx.fx.timestamp * 1000 } : null} /></motion.div>
        {/* The right column ends level with the balance: the chart takes whatever height is left. */}
        <div className="grid gap-4 md:grid-rows-[auto_1fr] md:gap-5">
          <div className="grid grid-cols-2 gap-4 md:gap-5">
            <motion.div {...tile}><PnlTile pnl={history?.pnl ?? null} pnlPct={history?.pnlPct ?? null} loading={!loaded || !activity.loaded} /></motion.div>
            <motion.div {...tile}><IdleTile idle={idle} loading={!loaded} target={target ? `Hub ${target.hub}` : null} onPutToWork={() => setPutOpen(true)} busy={false} /></motion.div>
          </div>
          <motion.div {...tile} className="flex min-w-0 flex-1"><ChartTile balance={balance} series={history?.series ?? null} loading={!loaded} now={now} className="h-full w-full" /></motion.div>
        </div>
      </div>
      <motion.div {...tile}><AutopilotTile ap={ap} now={now} /></motion.div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <motion.div {...tile}><PositionsTile positions={pf.positions} pools={pools.pools} loading={!loaded} empty={loaded && supplied === 0 && debt === 0 && pf.positions.idleUsdc === 0} className="h-full" /></motion.div>
        <motion.div {...tile}><ActivityTile rows={activity.rows} loading={activity.loading} now={now} className="h-full" /></motion.div>
      </div>
      <PutToWorkDialog open={putOpen} onOpenChange={setPutOpen} idle={idle ?? 0} pool={target} />
    </motion.div>
    </PullToRefresh>
  );
}
