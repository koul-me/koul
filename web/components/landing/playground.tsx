"use client";

/**
 * Build a rule, then move the market and watch it run. Everything here is in the browser on invented numbers: no
 * chain calls, no wallet, no real prices. The walk is the router's own: top to bottom, the first rule whose
 * conditions hold and whose action has something to move is the one that runs, and the page says so when two match.
 */
import * as React from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Plus, RotateCcw } from "lucide-react";
import { Label, PillButton, Tile, TileLabel } from "@/components/signal";
import { Rolling } from "@/components/signal/rolling";
import { tween } from "@/lib/motion";
import { fmtUsdc } from "@/lib/format";
import { makeRule, newId, POOLS, type Rule } from "@/lib/model/autopilot";
import { amountOf, BASE_RATE, rateOf, run, walk, type World } from "@/lib/landing/engine";
import { describeAction } from "@/lib/rules/describe";
import { Illustrative, Section } from "./shell";
import { RuleCard, SUBJECTS, conditionFor } from "./playground-rule";
import { cn } from "@/lib/utils";

const START: World = { health: 1.62, gap: 0.4, price: 48.79, wallet: 120, poolA: 300, poolB: 200, debt: 240 };
const MAX_RULES = 3;

const startingRules = (): Rule[] => [
  makeRule({ id: newId("pg"), name: "Stay safe", conditions: [conditionFor("health_factor")], action: { kind: "repay_from_wallet", amount: "all" }, cooldownSec: 600 }),
  makeRule({ id: newId("pg"), name: "Exit", conditions: [conditionFor("fx_price")], action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 600 }),
];

function Slider({ label, value, min, max, step, unit, decimals, onChange, lit }: { label: string; value: number; min: number; max: number; step: number; unit: string; decimals: number; onChange: (v: number) => void; lit: boolean }) {
  const id = React.useId();
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={cn("label", lit ? "text-accent-text" : "text-muted")}>{label}</label>
        <span className={cn("mono num", lit ? "text-accent-text" : "text-text")}><Rolling text={`${value.toFixed(decimals)}${unit}`} durationMs={200} /></span>
      </div>
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: "var(--accent-text)" }}
        className="h-11 w-full cursor-pointer bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      />
    </div>
  );
}

function Bar({ title, value, of, tone = "text" }: { title: string; value: number; of: number; tone?: "text" | "lime" | "danger" }) {
  const pct = of <= 0 ? 0 : Math.max(0, Math.min(1, value / of));
  return (
    <div className="grid gap-1.5 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold">{title}</span>
        <span className={cn("mono num", tone === "lime" ? "text-accent-text" : tone === "danger" ? "text-danger" : "text-text")}><Rolling text={fmtUsdc(value)} /></span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div className={cn("h-full w-full origin-left rounded-full", tone === "lime" ? "bg-lime" : tone === "danger" ? "bg-danger" : "bg-line")} animate={{ scaleX: pct }} initial={false} transition={tween()} />
      </div>
    </div>
  );
}

export function Playground() {
  const still = useReducedMotion() ?? false;
  const [rules, setRules] = React.useState<Rule[]>(startingRules);
  const [world, setWorld] = React.useState<World>(START);
  /** The last thing a press of Run did; the next press replaces it instead of stacking up. */
  const [last, setLast] = React.useState<{ id: number; text: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const w = walk(rules, world);
  const runsIndex = w.index;
  const runner = runsIndex === null ? null : rules[runsIndex]!;
  const willMove = runner ? amountOf(runner.action, world) : 0;

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setRules((prev) => {
      const from = prev.findIndex((r) => r.id === active.id);
      const to = prev.findIndex((r) => r.id === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  };

  const fire = () => {
    if (!runner) return;
    const res = run(runner.action, world);
    setWorld(res.world);
    setLast((prev) => ({ id: (prev?.id ?? 0) + 1, text: res.text }));
  };
  const reset = () => { setWorld(START); setRules(startingRules()); setLast(null); };

  const total = Math.max(1, world.wallet + world.poolA + world.poolB);
  const verdict = runsIndex === null
    ? w.skipped.length > 0
      ? `Rule ${w.skipped[0]! + 1} matches, but it has nothing to move. The router walks on.`
      : "No rule matches. Move a slider."
    : w.matched.length > 1
      ? `Rules ${w.matched.map((i) => i + 1).join(" and ")} match. Only rule ${runsIndex + 1} runs: the router stops at the first one.`
      : `Rule ${runsIndex + 1} runs.`;

  return (
    <Section id="build" title="Write one. Move the market. Watch it run." lead="A sandbox in your browser, on invented numbers. The same walk the router does on-chain, with nothing at stake.">
      {/* The market sets the scene, so it spans the top; the rules and what they do to the position sit under it. */}
      <Tile className="mt-10 grid gap-5 p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <TileLabel>The market</TileLabel>
          <Label tone="muted">Pool {POOLS.A.hub} pays {rateOf(world, "A").toFixed(2)}% · Pool {POOLS.B.hub} pays {rateOf(world, "B").toFixed(2)}%</Label>
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUBJECTS.map((s) => {
            const lit = rules.some((r, i) => r.conditions[0]!.kind === s.kind && w.matched.includes(i));
            const value = s.kind === "health_factor" ? world.health : s.kind === "rate_gap" ? world.gap : s.kind === "fx_price" ? world.price : world.wallet;
            const set = (v: number) => setWorld((prev) => ({ ...prev, ...(s.kind === "health_factor" ? { health: v } : s.kind === "rate_gap" ? { gap: v } : s.kind === "fx_price" ? { price: v } : { wallet: v }) }));
            return <Slider key={s.kind} label={s.label} value={value} min={s.min} max={s.max} step={s.step} unit={s.unit} decimals={s.decimals} onChange={set} lit={lit} />;
          })}
        </div>
      </Tile>

      <div className="mt-4 grid gap-4 md:gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <div className="flex items-center justify-between gap-4 px-1">
            <TileLabel>Your rules</TileLabel>
            <Label tone="muted">Top to bottom · first match runs</Label>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="grid gap-3">
                {rules.map((r, i) => (
                  <RuleCard
                    key={r.id}
                    rule={r}
                    index={i}
                    runs={runsIndex === i}
                    matched={w.matched.includes(i)}
                    skipped={w.skipped.includes(i)}
                    canRemove={rules.length > 1}
                    still={still}
                    onChange={(next) => setRules((prev) => prev.map((x) => (x.id === r.id ? next : x)))}
                    onRemove={() => setRules((prev) => prev.filter((x) => x.id !== r.id))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="flex flex-wrap gap-2">
            <PillButton
              variant="ghost"
              size="md"
              disabled={rules.length >= MAX_RULES}
              onClick={() => setRules((prev) => [...prev, makeRule({ id: newId("pg"), name: "Rule", conditions: [conditionFor("idle_usdc")], action: { kind: "supply_from_wallet", amount: "all", pool: "B" }, cooldownSec: 600 })])}
            >
              <Plus className="size-4" aria-hidden /> Add rule
            </PillButton>
            <PillButton variant="ghost" size="md" onClick={reset}><RotateCcw className="size-4" aria-hidden /> Reset</PillButton>
            <Label tone="muted" className="inline-flex min-h-11 items-center">{rules.length} of {MAX_RULES} here · up to 32 in the app</Label>
          </div>
        </div>

        <div className="grid content-start gap-4 md:gap-5">
          <Tile className="grid content-start gap-4 p-5 md:p-6">
            <TileLabel>The position</TileLabel>
            <div className="divide-y divide-line">
              <Bar title="Wallet · idle" value={world.wallet} of={total} />
              <Bar title={`Pool ${POOLS.A.hub} · supplied`} value={world.poolA} of={total} tone="lime" />
              <Bar title={`Pool ${POOLS.B.hub} · supplied`} value={world.poolB} of={total} tone="lime" />
              <Bar title="Debt" value={world.debt} of={Math.max(1, START.debt)} tone="danger" />
            </div>
            <div className={cn("rounded-[var(--radius-group)] p-4", runsIndex === null ? "bg-surface-2" : "bg-lime text-on-lime")}>
              <p className="text-[16px] font-bold">{verdict}</p>
              {runner && <p className="mono mt-1">{describeAction(runner.action)} · {fmtUsdc(willMove)} USDC</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <PillButton size="md" onClick={fire} disabled={runsIndex === null}>Run it</PillButton>
              <Label tone="muted">Applies the action to the numbers above</Label>
            </div>
            <div className="min-h-[20px]" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                {last && (
                  <motion.div key={last.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween()}>
                    <Label tone="lime">{last.text}</Label>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Illustrative>Illustrative. Invented numbers, nothing on-chain, {BASE_RATE.toFixed(2)}% is a placeholder rate.</Illustrative>
          </Tile>
        </div>
      </div>
    </Section>
  );
}
