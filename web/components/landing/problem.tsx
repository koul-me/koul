"use client";

/**
 * The problem, in one picture drawn as you scroll: a reading crosses a level in the middle of the night. On the
 * left nobody is awake for it. On the right a rule is, and the position is safe. The shape is invented: no asset,
 * no real prices, and it says so.
 */
import * as React from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Label, Tile } from "@/components/signal";
import { Illustrative, Section } from "./shell";
import { cn } from "@/lib/utils";

/** The same reading in both panels up to the crossing; after it, one keeps falling and one is held. */
const FALLING = "M0,34 C26,30 44,48 68,46 C92,44 106,62 128,62 C150,62 164,80 184,90 C206,101 228,116 252,124 C278,131 300,134 320,136";
const HELD = "M0,34 C26,30 44,48 68,46 C92,44 106,62 128,62 C150,62 164,80 184,90 C198,92 210,86 228,82 C258,78 290,76 320,74";
const LEVEL_Y = 90;
/** Where the line meets the level, as a share of the width, for the marker and the time under it. */
const CROSS_X = 184 / 320;
const CROSS_AT = "03:12";

function Panel({ title, note, tone, path, progress, crossed, still, children }: {
  title: string;
  note: string;
  tone: "danger" | "lime";
  path: string;
  progress: ReturnType<typeof useTransform<number, number>>;
  crossed: boolean;
  still: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Tile className="grid gap-5 p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[20px] font-bold">{title}</span>
        <Label tone={crossed ? (tone === "lime" ? "lime" : "danger") : "muted"}>{crossed ? note : "Watching"}</Label>
      </div>
      <div className="relative">
        <svg viewBox="0 0 320 150" className="h-[150px] w-full" role="img" aria-label={`${title}: an example reading crossing its level at ${CROSS_AT}`}>
          <line x1="0" y1={LEVEL_Y} x2="320" y2={LEVEL_Y} stroke="currentColor" strokeWidth="1" strokeDasharray="4 5" className="text-line" />
          <motion.path
            d={path}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={cn(tone === "lime" ? "text-accent-text" : "text-danger")}
            stroke="currentColor"
            style={still ? undefined : { pathLength: progress }}
            initial={still ? undefined : { pathLength: 0 }}
          />
        </svg>
        <span className="absolute top-0 h-full w-px bg-line" style={{ left: `${CROSS_X * 100}%` }} aria-hidden />
        <motion.span
          className={cn("absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full", tone === "lime" ? "bg-lime" : "bg-danger")}
          style={{ left: `${CROSS_X * 100}%`, top: `${(LEVEL_Y / 150) * 100}%` }}
          animate={{ opacity: crossed ? 1 : 0, scale: crossed ? 1 : 0.4 }}
          initial={false}
          aria-hidden
        />
      </div>
      <div className="flex justify-between">
        <Label tone="dim">00:00</Label>
        <Label tone={crossed ? "text" : "dim"}>{CROSS_AT} · level crossed</Label>
        <Label tone="dim">06:00</Label>
      </div>
      <div className="min-h-[52px]">{children}</div>
    </Tile>
  );
}

export function Problem() {
  const still = useReducedMotion() ?? false;
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.55"] });
  const drawn = useTransform(scrollYProgress, [0, 0.9], [0, 1]);
  const [crossed, setCrossed] = React.useState(false);
  useMotionValueEvent(drawn, "change", (v) => setCrossed(v > CROSS_X));

  const shown = still || crossed;
  return (
    <Section
      label="The problem"
      title="Markets do not wait for you to wake up."
      lead="A position needs watching around the clock. You cannot be there, and the moment that matters lasts minutes."
    >
      <div ref={ref} className="mt-10 grid gap-4 md:grid-cols-2 md:gap-5">
        <Panel title="Without a rule" note="Missed" tone="danger" path={FALLING} progress={drawn} crossed={shown} still={still}>
          <p className={cn("text-[22px] font-bold transition-opacity duration-300 md:text-[26px]", shown ? "opacity-100" : "opacity-0")}>You were asleep.</p>
        </Panel>
        <Panel title="With a rule" note="Ran at 03:12" tone="lime" path={HELD} progress={drawn} crossed={shown} still={still}>
          <div className={cn("grid gap-1 transition-opacity duration-300", shown ? "opacity-100" : "opacity-0")}>
            <p className="text-[22px] font-bold md:text-[26px]">Koul was.</p>
            <Label tone="lime">Condition met · action ran · position safe</Label>
          </div>
        </Panel>
      </div>
      <Illustrative className="mt-5">Illustrative. An invented reading, no asset, no real prices.</Illustrative>
    </Section>
  );
}
