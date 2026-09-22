"use client";

/**
 * How it works, in three steps held on screen while you scroll: you write a rule, the rule lives in the router
 * contract, and a check makes it run itself. Each step draws its own diagram. With reduced motion on, the three
 * steps simply stack.
 */
import * as React from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { ArrowDown, Check } from "lucide-react";
import { Label, Tile } from "@/components/signal";
import { DUR, rise, tween } from "@/lib/motion";
import { Illustrative, Section } from "./shell";
import { RuleChips, type Chip } from "./rule-row";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: "01", title: "Write a rule", line: "A condition, a level, an action. In plain words, or by telling Koul what you want." },
  { n: "02", title: "It lives on-chain", line: "Your rules are stored in the router contract, in the order you put them." },
  { n: "03", title: "It runs itself", line: "A check arrives, the router reads live data, the first matching rule runs, and your wallet executes it." },
];

const RULE: Chip[] = [
  { key: "if", text: "IF", tone: "mono" },
  { key: "subject", text: "loan health", tone: "mono" },
  { key: "level", text: "< 1.25", tone: "accent" },
  { key: "action", text: "Repay debt", tone: "action" },
];

const STORED = [
  { i: 1, text: "IF loan health < 1.25 → Repay debt" },
  { i: 2, text: "IF rate gap > 1.00% → Move to the better pool" },
  { i: 3, text: "IF wallet > 100 USDC → Supply to a pool" },
];

const RUN = [
  "A check arrives, every few minutes",
  "The router reads live data",
  "Rule 1 matches first, and only it runs",
  "Your wallet executes the call",
  "It shows up in your activity",
];

function Write() {
  return (
    <div className="grid gap-5">
      <Label>The rule you write</Label>
      <RuleChips chips={RULE} />
      <div className="rounded-[var(--radius-group)] bg-surface-2 p-4">
        <Label tone="lime">Tell Koul</Label>
        <p className="mt-2 text-[16px]">&ldquo;Repay my loan if health drops under 1.25&rdquo;</p>
      </div>
    </div>
  );
}

function OnChain() {
  return (
    <div className="grid gap-4">
      <Label>Router contract · your rule set</Label>
      <div className="rounded-[var(--radius-group)] border border-accent-text p-4">
        <div className="divide-y divide-line">
          {STORED.map((r, i) => (
            <motion.div key={r.i} {...rise(6)} transition={tween(DUR.base)} style={{ transitionDelay: `${i * 40}ms` }} className="flex items-center gap-3 py-3">
              <span className="mono inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent-text">{r.i}</span>
              <span className="mono min-w-0 truncate text-text">{r.text}</span>
            </motion.div>
          ))}
        </div>
      </div>
      <Label tone="lime">Top to bottom · the first rule that matches runs</Label>
    </div>
  );
}

function Runs({ still }: { still: boolean }) {
  const [lit, setLit] = React.useState(still ? RUN.length : 0);
  React.useEffect(() => {
    if (still) return;
    const t = setInterval(() => setLit((n) => (n >= RUN.length ? 0 : n + 1)), 700);
    return () => clearInterval(t);
  }, [still]);
  const shown = still ? RUN.length : lit;
  return (
    <div className="grid gap-3">
      <Label>One pass</Label>
      {RUN.map((r, i) => (
        <div key={r} className="flex items-center gap-3">
          <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors", i < shown ? "bg-lime text-on-lime" : "bg-surface-2 text-muted")}>
            {i < shown ? <Check className="size-3.5" aria-hidden /> : <span className="mono text-[11px]">{i + 1}</span>}
          </span>
          <span className={cn("text-[16px] transition-colors", i < shown ? "text-text" : "text-muted")}>{r}</span>
        </div>
      ))}
    </div>
  );
}

function Diagram({ step, still }: { step: number; still: boolean }) {
  return (
    <Tile className="flex min-h-[380px] flex-col justify-center p-6 md:min-h-[420px] md:p-8">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(DUR.fast)}>
          {step === 0 ? <Write /> : step === 1 ? <OnChain /> : <Runs still={still} />}
        </motion.div>
      </AnimatePresence>
      <Illustrative className="mt-6" />
    </Tile>
  );
}

function StepText({ s, active }: { s: (typeof STEPS)[number]; active: boolean }) {
  return (
    <div className={cn("border-l-2 py-3 pl-5 transition-colors md:py-4", active ? "border-accent-text" : "border-line")}>
      <Label tone={active ? "lime" : "dim"}>{s.n}</Label>
      <h3 className={cn("mt-2 text-[26px] font-bold leading-tight transition-colors md:text-[32px]", active ? "text-text" : "text-muted")}>{s.title}</h3>
      <p className={cn("mt-2 max-w-[46ch] text-[16px] transition-colors md:text-[17px]", active ? "text-muted" : "text-muted")}>{s.line}</p>
    </div>
  );
}

export function How() {
  const still = useReducedMotion() ?? false;
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = React.useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(Math.max(0, Math.min(STEPS.length - 1, Math.floor(v * STEPS.length)))));

  if (still) {
    return (
      <Section label="How it works" title="Three steps, then it is out of your hands.">
        <div className="mt-10 grid gap-10">
          {STEPS.map((s, i) => (
            <div key={s.n} className="grid gap-5 md:grid-cols-2 md:items-center md:gap-10">
              <StepText s={s} active />
              <Diagram step={i} still />
            </div>
          ))}
        </div>
      </Section>
    );
  }

  return (
    <section aria-label="How it works" className="px-4 md:px-8">
      <div ref={ref} className="relative mx-auto w-full max-w-[1280px]" style={{ height: `${STEPS.length * 90}vh` }}>
        <div className="sticky top-0 flex min-h-screen flex-col justify-center py-16">
          <header className="max-w-[760px]">
            <Label tone="lime">How it works</Label>
            <h2 className="t-title mt-4">Three steps, then it is out of your hands.</h2>
          </header>
          <div className="mt-8 grid gap-8 md:mt-12 md:grid-cols-2 md:items-center md:gap-12">
            <div className="grid gap-2">
              {STEPS.map((s, i) => <StepText key={s.n} s={s} active={i === step} />)}
              <Label tone="muted" className="mt-2 flex items-center gap-2"><ArrowDown className="size-3.5" aria-hidden /> Keep scrolling</Label>
            </div>
            <Diagram step={step} still={false} />
          </div>
        </div>
      </div>
    </section>
  );
}
