"use client";

/**
 * The hero: the headline word by word (in CSS, so it reads before any script runs), the line, the two passkey
 * buttons, and beside them a rule that assembles itself, watches a reading cross its level, and fires. It loops
 * calmly. With reduced motion on it settles on the fired state and stays there.
 */
import * as React from "react";
import { useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { Label, Tile, TileLabel } from "@/components/signal";
import { StartButtons } from "./shell";
import { RuleChips, type Chip } from "./rule-row";
import { Gauge } from "./gauge";
import { cn } from "@/lib/utils";

const HEADLINE = ["Set", "the", "rules", "once.", "Koul", "does", "the", "rest."];

const CHIPS: Chip[] = [
  { key: "if", text: "IF", tone: "mono" },
  { key: "subject", text: "loan health", tone: "mono" },
  { key: "level", text: "< 1.25", tone: "accent" },
  { key: "action", text: "Repay debt", tone: "action" },
];

type Phase = "assembling" | "watching" | "crossed" | "fired";
const HEALTHY = 1.62;
const FALLEN = 1.18;
const LEVEL = 1.25;

/** The loop, in milliseconds from the start of each pass. */
const BEATS: { at: number; phase: Phase; chips: number }[] = [
  { at: 0, phase: "assembling", chips: 1 },
  { at: 320, phase: "assembling", chips: 2 },
  { at: 640, phase: "assembling", chips: 3 },
  { at: 960, phase: "assembling", chips: 4 },
  { at: 1500, phase: "watching", chips: 4 },
  { at: 3300, phase: "crossed", chips: 4 },
  { at: 3900, phase: "fired", chips: 4 },
];
const PERIOD = 7600;

const STILL = { phase: "fired" as Phase, chips: 4 };

/** The pass, on a loop. With reduced motion on, the loop never starts and the rule shows as already run. */
function useRuleLoop(still: boolean) {
  const [state, setState] = React.useState<{ phase: Phase; chips: number }>({ phase: "assembling", chips: 0 });
  React.useEffect(() => {
    if (still) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = () => { timers = BEATS.map((b) => setTimeout(() => setState({ phase: b.phase, chips: b.chips }), b.at)); };
    schedule();
    const loop = setInterval(() => { setState({ phase: "assembling", chips: 0 }); schedule(); }, PERIOD);
    return () => { clearInterval(loop); for (const t of timers) clearTimeout(t); };
  }, [still]);
  return still ? STILL : state;
}

export function Hero() {
  const still = useReducedMotion() ?? false;
  const { phase, chips } = useRuleLoop(still);
  const watching = phase !== "assembling";
  const held = phase === "crossed" || phase === "fired";
  const value = watching ? FALLEN : HEALTHY;
  return (
    <section className="px-4 pt-6 pb-16 md:px-8 md:pt-10 md:pb-24">
      <div className="mx-auto grid w-full max-w-[1280px] items-center gap-8 md:gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <h1 className="t-headline max-w-[14ch]">
            {HEADLINE.map((w, i) => (
              <span key={`${w}-${i}`} className="animate-rise inline-block" style={{ animationDelay: `${60 + i * 55}ms` }}>
                {w}
                {i < HEADLINE.length - 1 ? " " : ""}
              </span>
            ))}
          </h1>
          <p className="mt-6 max-w-[46ch] text-[19px] text-muted md:text-[22px]">
            Automate your DeFi position from your own wallet.
          </p>
          <StartButtons className="mt-8" />
        </div>

        <Tile className="grid gap-6 p-6 md:p-8">
          <div className="flex items-baseline justify-between gap-4">
            <TileLabel>A rule</TileLabel>
            <Label tone={held ? "lime" : "muted"}>{phase === "assembling" ? "Writing" : phase === "watching" ? "Watching" : phase === "crossed" ? "Condition met" : "Ran"}</Label>
          </div>
          <RuleChips chips={CHIPS} shown={chips} firing={phase === "fired"} />
          <Gauge label="Loan health" value={value} level={LEVEL} min={1} max={2} held={held} durationMs={still ? 0 : 1800} />
          <div className="min-h-[44px]">
            <div className={cn("flex items-center gap-3 transition-opacity duration-300", phase === "fired" ? "opacity-100" : "opacity-0")} aria-live="polite">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-lime text-on-lime"><Check className="size-4" aria-hidden /></span>
              <span className="text-[16px] font-bold">Repaid 40.00 USDC from your wallet</span>
            </div>
          </div>
        </Tile>
      </div>
    </section>
  );
}
