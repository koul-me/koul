"use client";

/**
 * The per-move share on the editing page: how much of what it can see every rule takes when it runs. Everything, or a
 * share. This is not a portfolio budget: two rules at 50% can each take half of what they see (see docs/internal).
 * One change for the whole list, undoable; a rule with a fixed USDC amount keeps it. "Mixed" means the rules
 * disagree, which is fine, and picking a share lines them up again.
 */
import { TickSlider, Tile } from "@/components/signal";
import { applyCapital, capitalOf } from "@/lib/model/capital";
import type { Rule } from "@/lib/model/autopilot";

export function Capital({ rules, onChange }: { rules: Rule[]; onChange: (rules: Rule[]) => void }) {
  const current = capitalOf(rules);
  if (current === null) return null;
  const sentence = current === "mixed"
    ? "Your rules use different amounts. Slide to give them all the same share."
    : `Each time a rule runs, it moves ${current >= 100 ? "all" : `${current}%`} of what it can reach: idle USDC to supply or repay, supplied USDC to withdraw or move.`;
  return (
    <Tile className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)] md:items-center md:gap-8 md:p-6">
      <div className="grid gap-1">
        <span className="text-[17px] font-bold">How much each rule moves</span>
        <p className="text-[15px] text-muted">{sentence}</p>
      </div>
      <TickSlider
        size="sm"
        value={current === "mixed" ? null : current}
        empty="Mixed"
        min={5}
        max={100}
        step={5}
        label="How much each rule moves when it runs"
        format={(v) => (v >= 100 ? { main: "All" } : { main: String(v), unit: "%" })}
        onCommit={(v) => onChange(applyCapital(rules, v))}
      />
    </Tile>
  );
}
