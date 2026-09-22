"use client";

/**
 * The per-move pill on the editing page: how much of what it can see every rule takes when it runs. Everything, or a
 * share. This is not a portfolio budget: two rules at 50% can each take half of what they see (see docs/internal).
 * One change for the whole list, undoable; a rule with a fixed USDC amount keeps it. "Mixed" means the rules
 * disagree, which is fine, and picking a share lines them up again.
 */
import { Label, TickSlider } from "@/components/signal";
import { applyCapital, capitalOf } from "@/lib/model/capital";
import type { Rule } from "@/lib/model/autopilot";

export function Capital({ rules, onChange }: { rules: Rule[]; onChange: (rules: Rule[]) => void }) {
  const current = capitalOf(rules);
  if (current === null) return null;
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,360px)_1fr] md:items-end md:gap-6">
      <div className="grid gap-2">
        <Label>Per move</Label>
        <TickSlider
          value={current === "mixed" ? null : current}
          empty="Mixed"
          min={5}
          max={100}
          step={5}
          label="Per move: how much of what it can see each rule takes when it runs"
          format={(v) => (v >= 100 ? { main: "Everything" } : { main: String(v), unit: "%" })}
          onCommit={(v) => onChange(applyCapital(rules, v))}
        />
      </div>
      <Label className="hidden md:block">Applies per rule, at the moment it runs. Rules do not share a budget.</Label>
    </div>
  );
}
