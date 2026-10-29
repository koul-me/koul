"use client";

/**
 * "Or start from a template": three rules the router runs well, one tap each. Levels follow today's readings, so a
 * template never starts out already true: an exit at a fixed 50.00 with USD/TRY at 50.50 pulled money out the moment
 * it was saved.
 */
import { PillButton, Tile } from "@/components/signal";
import { makeRule, type LiveValues, type Rule } from "@/lib/model/autopilot";
import { actionShort, conditionsCompact } from "@/lib/model/labels";

/** An exit level 5% above today's USD/TRY, rounded up to the cent; 50 before the first reading. */
export const exitLevel = (live?: Pick<LiveValues, "fx" | "fxStale">) => live?.fx && !live.fxStale ? Math.ceil(live.fx * 1.05 * 100) / 100 : 50;

export const TEMPLATE_RULES: { id: string; title: string; make: (live?: LiveValues) => Rule }[] = [
  { id: "repay", title: "Repay before liquidation", make: () => makeRule({ name: "Repay debt", conditions: [{ kind: "health_factor", comparator: "lte", value: 1.25 }], action: { kind: "repay_from_wallet", amount: "all" }, cooldownSec: 600 }) },
  { id: "exit", title: "Exit on lira shock", make: (live) => makeRule({ name: "Lira exit", conditions: [{ kind: "fx_price", comparator: "gte", value: exitLevel(live) }], action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 600 }) },
  { id: "rate", title: "Chase the better rate", make: () => makeRule({ name: "Best rate", conditions: [{ kind: "rate_gap", comparator: "gte", value: 1 }], action: { kind: "move_to_best_pool", amount: "all" }, cooldownSec: 3600 }) },
];

export function Templates({ onAdd, live }: { onAdd: (rule: Rule) => void; live?: LiveValues }) {
  return (
    <div className="grid gap-3">
      <h2 className="px-2 text-[22px] font-bold">Or start from a template</h2>
      <div className="grid gap-4 md:grid-cols-3 md:gap-5">
        {TEMPLATE_RULES.map((t) => {
          const rule = t.make(live);
          return (
            <Tile key={t.id} className="flex flex-col gap-4">
              <div className="text-[20px] font-bold">{t.title}</div>
              <div className="mono text-muted"><span className="text-muted">IF</span> {conditionsCompact(rule)} <span className="text-accent-text">→</span> {actionShort(rule.action)}</div>
              <div className="mt-auto"><PillButton variant="ghost" size="md" onClick={() => onAdd(t.make(live))}>Add</PillButton></div>
            </Tile>
          );
        })}
      </div>
    </div>
  );
}
