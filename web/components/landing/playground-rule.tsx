"use client";

/**
 * One rule in the playground: a drag handle, its number (the marker sits on the rule that would run), the subject,
 * the level, the action and how much of what it can see it takes. Only the conditions and actions the app really
 * supports are offered, and the two that must go together are kept together.
 */
import * as React from "react";
import { GripVertical, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label, Tile } from "@/components/signal";
import { SPRING_SOFT } from "@/lib/motion";
import { POOLS, type Action, type Condition, type ConditionKind, type Rule } from "@/lib/model/autopilot";
import { isPercent } from "@/lib/model/capital";
import { describeAction } from "@/lib/rules/describe";
import { cn } from "@/lib/utils";

const pill = "h-10 rounded-full border-0 bg-surface-2 px-4 mono text-text data-[size=default]:h-10 hover:brightness-110 [&_svg]:text-muted";
const popup = "rounded-[var(--radius-group)] border border-line bg-surface p-1 shadow-none ring-0";
const item = "mono rounded-lg py-2.5 pl-3 pr-9 text-text focus:bg-surface-2";

/** The four subjects the playground offers, with the range their level lives in. */
export const SUBJECTS: { kind: ConditionKind; label: string; comparator: "gte" | "lte"; min: number; max: number; step: number; unit: string; decimals: number }[] = [
  { kind: "health_factor", label: "Loan health", comparator: "lte", min: 1, max: 2, step: 0.01, unit: "", decimals: 2 },
  { kind: "rate_gap", label: "Rate gap", comparator: "gte", min: 0, max: 3, step: 0.05, unit: "%", decimals: 2 },
  { kind: "fx_price", label: "Price feed", comparator: "gte", min: 45, max: 55, step: 0.01, unit: "", decimals: 2 },
  { kind: "idle_usdc", label: "Idle wallet", comparator: "gte", min: 0, max: 500, step: 5, unit: " USDC", decimals: 0 },
];
export const subjectOf = (kind: ConditionKind) => SUBJECTS.find((s) => s.kind === kind) ?? SUBJECTS[0]!;

const ACTIONS: { kind: Action["kind"]; label: string }[] = [
  { kind: "repay_from_wallet", label: "Repay debt" },
  { kind: "withdraw_to_wallet", label: "Withdraw to wallet" },
  { kind: "supply_from_wallet", label: "Supply to a pool" },
  { kind: "move_to_best_pool", label: "Move to the better pool" },
];

const AMOUNTS = [
  { value: "all", label: "Everything" },
  { value: "50", label: "Half" },
  { value: "25", label: "A quarter" },
  { value: "fixed", label: "50 USDC" },
];

const amountValue = (a: Action["amount"]) => (a === "all" ? "all" : isPercent(a) ? String(a.percent) : "fixed");
const amountFrom = (v: string): Action["amount"] => (v === "all" ? "all" : v === "fixed" ? 50 : { percent: Number(v) });

/**
 * The router pairs these two and only these two: a move needs the rate gap, and the rate gap can only move. The
 * playground keeps the pair together instead of letting a visitor build something that would be refused.
 */
export function pairFor(kind: ConditionKind, action: Action): Action {
  if (kind === "rate_gap") return action.kind === "move_to_best_pool" ? action : { kind: "move_to_best_pool", amount: action.amount };
  if (action.kind === "move_to_best_pool") return { kind: "withdraw_to_wallet", amount: action.amount };
  return action;
}

export function conditionFor(kind: ConditionKind): Condition {
  const s = subjectOf(kind);
  const mid = kind === "health_factor" ? 1.25 : kind === "rate_gap" ? 1 : kind === "fx_price" ? 50 : 100;
  return { kind, comparator: s.comparator, value: mid };
}

export function RuleCard({ rule, index, runs, matched, skipped, canRemove, onChange, onRemove, still }: {
  rule: Rule;
  index: number;
  /** This is the rule the router would run now. */
  runs: boolean;
  /** Its conditions hold. */
  matched: boolean;
  /** It matched but has nothing to move, so the walk goes past it. */
  skipped: boolean;
  canRemove: boolean;
  onChange: (next: Rule) => void;
  onRemove: () => void;
  still: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id });
  const c = rule.conditions[0]!;
  const s = subjectOf(c.kind);
  const setKind = (kind: ConditionKind) => onChange({ ...rule, conditions: [conditionFor(kind)], action: pairFor(kind, rule.action) });
  const setLevel = (value: number) => onChange({ ...rule, conditions: [{ ...c, value }] });
  const setAction = (kind: Action["kind"]) => onChange({ ...rule, action: { ...rule.action, kind, ...(kind === "supply_from_wallet" ? { pool: "B" as const } : {}) }, conditions: kind === "move_to_best_pool" ? [conditionFor("rate_gap")] : c.kind === "rate_gap" ? [conditionFor("health_factor")] : rule.conditions });
  const levelId = `level-${rule.id}`;
  return (
    <Tile
      ref={setNodeRef}
      tone={runs ? "outlined" : "surface"}
      className={cn("grid gap-4 p-4 md:p-5", isDragging && "relative z-10 shadow-[0_12px_40px_rgba(0,0,0,0.35)]")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-dragging={isDragging || undefined}
    >
      <div className="flex items-center gap-2">
        <button type="button" ref={setActivatorNodeRef} data-drag-handle aria-label={`Reorder rule ${index + 1}`} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text" {...attributes} {...listeners}>
          <GripVertical className="size-4" aria-hidden />
        </button>
        <span className={cn("mono relative inline-flex size-7 shrink-0 items-center justify-center rounded-full font-medium", runs ? "text-on-lime" : "text-accent-text")}>
          {runs && <motion.span layoutId={still ? undefined : "playground-marker"} className="absolute inset-0 rounded-full bg-lime" transition={SPRING_SOFT} aria-hidden />}
          <span className="relative">{index + 1}</span>
        </span>
        <span className="mono min-w-0 flex-1 truncate text-muted">{describeAction(rule.action)}</span>
        <Label tone={runs ? "lime" : skipped ? "dim" : matched ? "text" : "dim"}>{runs ? "Runs" : skipped ? "Nothing to move" : matched ? "Matches" : "Waiting"}</Label>
        <button type="button" onClick={onRemove} disabled={!canRemove} aria-label={`Remove rule ${index + 1}`} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text disabled:opacity-30">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <Label className="sm:w-8">If</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={c.kind} onValueChange={(v) => v && setKind(v as ConditionKind)} items={SUBJECTS.map((x) => ({ value: x.kind, label: x.label }))}>
            <SelectTrigger className={pill} aria-label={`Rule ${index + 1}: what to watch`}><SelectValue /></SelectTrigger>
            <SelectContent className={popup}>{SUBJECTS.map((x) => <SelectItem key={x.kind} value={x.kind} className={item}>{x.label}</SelectItem>)}</SelectContent>
          </Select>
          <span className="mono text-muted">{c.comparator === "gte" ? "at or above" : "at or below"}</span>
          <label htmlFor={levelId} className="sr-only">{`Rule ${index + 1}: the level`}</label>
          <input
            id={levelId}
            type="number"
            value={c.value}
            min={s.min}
            max={s.max}
            step={s.step}
            onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setLevel(n); }}
            className="mono num h-10 w-[7.5rem] rounded-full bg-surface-2 px-4 text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          />
        </div>

        <Label className="sm:w-8">Then</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={rule.action.kind} onValueChange={(v) => v && setAction(v as Action["kind"])} items={ACTIONS.map((a) => ({ value: a.kind, label: a.label }))}>
            <SelectTrigger className={pill} aria-label={`Rule ${index + 1}: what to do`}><SelectValue /></SelectTrigger>
            <SelectContent className={popup}>{ACTIONS.map((a) => <SelectItem key={a.kind} value={a.kind} className={item}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
          {rule.action.kind === "supply_from_wallet" && (
            <Select value={rule.action.pool ?? "B"} onValueChange={(v) => v && onChange({ ...rule, action: { ...rule.action, pool: v as "A" | "B" } })} items={[{ value: "A", label: `Pool ${POOLS.A.hub}` }, { value: "B", label: `Pool ${POOLS.B.hub}` }]}>
              <SelectTrigger className={pill} aria-label={`Rule ${index + 1}: which pool`}><SelectValue /></SelectTrigger>
              <SelectContent className={popup}>{(["A", "B"] as const).map((p) => <SelectItem key={p} value={p} className={item}>{`Pool ${POOLS[p].hub}`}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={amountValue(rule.action.amount)} onValueChange={(v) => v && onChange({ ...rule, action: { ...rule.action, amount: amountFrom(v) } })} items={AMOUNTS}>
            <SelectTrigger className={pill} aria-label={`Rule ${index + 1}: how much`}><SelectValue /></SelectTrigger>
            <SelectContent className={popup}>{AMOUNTS.map((a) => <SelectItem key={a.value} value={a.value} className={item}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {c.kind === "rate_gap" && <Label tone="muted">The rate gap and the move go together: the router only pairs these two.</Label>}
    </Tile>
  );
}
