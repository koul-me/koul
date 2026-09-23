"use client";

/**
 * The problem, in one picture drawn as it arrives: a reading crosses a level in the middle of the night. On the
 * left nobody is awake for it. On the right a rule is, and the position is safe. The shape is invented: no asset,
 * no real prices. Under them, the part a homemade bot cannot close: the time between reading the price and acting on it.
 */
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Label, Tile } from "@/components/signal";
import { Section } from "./shell";
import { cn } from "@/lib/utils";

/** The same reading in both panels up to the crossing; after it, one keeps falling and one is held. */
const FALLING = "M0,34 C26,30 44,48 68,46 C92,44 106,62 128,62 C150,62 164,80 184,90 C206,101 228,116 252,124 C278,131 300,134 320,136";
const HELD = "M0,34 C26,30 44,48 68,46 C92,44 106,62 128,62 C150,62 164,80 184,90 C198,92 210,86 228,82 C258,78 290,76 320,74";
const LEVEL_Y = 90;
/** Where both lines meet the level, in the drawing's own units, so the marker sits exactly on the curve. */
const CROSS_X = 184;
const CROSS_AT = "03:12";

function Panel({ title, note, tone, path, crossed, still, children }: {
  title: string;
  note: string;
  tone: "danger" | "lime";
  path: string;
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
          <line x1={CROSS_X} y1="0" x2={CROSS_X} y2="150" stroke="currentColor" strokeWidth="1" className="text-line" />
          <motion.path
            d={path}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={cn(tone === "lime" ? "text-accent-text" : "text-danger")}
            stroke="currentColor"
            initial={{ pathLength: still ? 1 : 0 }}
            animate={{ pathLength: still || crossed ? 1 : 0 }}
            transition={{ duration: still ? 0 : 1.1, ease: "easeInOut" }}
          />
          {/* Inside the drawing, so it scales with the curve and stays on it at any card width. */}
          <motion.circle
            cx={CROSS_X}
            cy={LEVEL_Y}
            className={tone === "lime" ? "fill-lime" : "fill-danger"}
            initial={false}
            animate={{ r: crossed ? 6 : 0, opacity: crossed ? 1 : 0 }}
            transition={{ delay: still ? 0 : 0.8 }}
          />
        </svg>
      </div>
      <div className="min-h-[52px]">{children}</div>
    </Tile>
  );
}

/** An example, not a measurement: a bot reads, decides on its own server, then sends a separate transaction. */
const BOT_GAP_S = 7;
const SCALE_S = 10;

function Gap({ who, note, seconds, tone, shown, still }: { who: string; note: string; seconds: number; tone: "danger" | "lime"; shown: boolean; still: boolean }) {
  const width = `${(seconds / SCALE_S) * 100}%`;
  const move = { duration: still ? 0 : 0.9, delay: still ? 0 : 1.2, ease: "easeOut" } as const;
  return (
    <div className="grid gap-2 md:grid-cols-[180px_1fr] md:items-center md:gap-6">
      <span className="text-[17px] font-bold">{who}</span>
      <div className="grid gap-2">
        <div className="flex items-center gap-3">
          <div className="relative h-2 flex-1 rounded-full bg-surface-2">
            <motion.div
              className={cn("absolute inset-y-0 left-0 rounded-full", tone === "lime" ? "bg-lime" : "bg-danger")}
              initial={{ width: still ? width : "0%" }}
              animate={{ width: shown ? width : "0%" }}
              transition={move}
            />
            {/* The handle rides the end of the bar: where the action lands. On the Koul row it never leaves the check. */}
            <motion.span
              className={cn("absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full", tone === "lime" ? "bg-lime" : "bg-danger")}
              initial={{ left: still ? width : "0%" }}
              animate={{ left: shown ? width : "0%" }}
              transition={move}
            />
          </div>
          <span className={cn("mono w-10 shrink-0 text-right", tone === "lime" ? "text-accent-text" : "text-danger")}>{seconds} s</span>
        </div>
        <p className="text-[15px] text-muted">{note}</p>
      </div>
    </div>
  );
}

export function Problem() {
  const still = useReducedMotion() ?? false;
  const [entered, setEntered] = React.useState(false);
  const shown = still || entered;
  return (
    <Section title="Markets move at 3 AM.">
      <motion.div
        className="mt-10 grid gap-4 md:grid-cols-2 md:gap-5"
        onViewportEnter={() => setEntered(true)}
        viewport={{ once: true, amount: 0.4 }}
      >
        <Panel title="Without Koul" note="Missed" tone="danger" path={FALLING} crossed={shown} still={still}>
          <p className={cn("text-[22px] font-bold transition-opacity delay-700 duration-300 md:text-[26px]", shown ? "opacity-100" : "opacity-0")}>You were asleep.</p>
        </Panel>
        <Panel title="With Koul" note={`Ran at ${CROSS_AT}`} tone="lime" path={HELD} crossed={shown} still={still}>
          <div className={cn("grid gap-1 transition-opacity delay-700 duration-300", shown ? "opacity-100" : "opacity-0")}>
            <p className="text-[22px] font-bold md:text-[26px]">Koul repaid the loan.</p>
          </div>
        </Panel>
        <Tile className="grid gap-6 p-6 md:col-span-2 md:p-8">
          <span className="text-[20px] font-bold">Time between checking the price and acting</span>
          <Gap who="Your own bot" seconds={BOT_GAP_S} tone="danger" shown={shown} still={still} note="Reads the price, decides on its server, then sends. The price can move in between." />
          <Gap who="Koul" seconds={0} tone="lime" shown={shown} still={still} note="The rule is checked inside the same transaction that repays the loan." />
        </Tile>
      </motion.div>
    </Section>
  );
}
