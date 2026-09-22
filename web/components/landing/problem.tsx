"use client";

/**
 * The problem, as one card with a switch: the same night, without Koul and with it. The reading falls through its
 * level at 03:12. Without Koul it keeps falling and the loan goes under; with Koul the rule fires on the level and
 * the line recovers. Switching redraws the line, moves the end ring and rolls the number. The card flips to "With
 * Koul" once by itself when it first comes into view; after that it is the visitor's switch. Invented numbers.
 */
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Label, Segmented, Tile } from "@/components/signal";
import { Rolling } from "@/components/signal/rolling";
import { SPRING_SOFT } from "@/lib/motion";
import { Section } from "./shell";
import { cn } from "@/lib/utils";

type Mode = "without" | "with";

/** The shared start of the night, then the two endings. Both pass through the crossing at (184, 90). */
const START = "M0,34 C26,30 44,48 68,46 C92,44 106,62 128,62 C150,62 164,80 184,90";
const ENDINGS: Record<Mode, { path: string; end: [number, number]; health: string; line: string }> = {
  without: { path: `${START} C206,101 228,116 252,124 C278,131 300,134 320,136`, end: [320, 136], health: "0.95", line: "Below 1.00 by morning. Liquidated." },
  with: { path: `${START} C198,92 210,86 228,82 C258,78 290,76 320,74`, end: [320, 74], health: "1.36", line: "Rule fired at 03:12. Debt repaid." },
};
const LEVEL_Y = 90;
const CROSS: [number, number] = [184, 90];

export function Problem() {
  const still = useReducedMotion() ?? false;
  const [mode, setMode] = React.useState<Mode>("without");
  const [touched, setTouched] = React.useState(false);
  const [seen, setSeen] = React.useState(false);
  const e = ENDINGS[mode];
  const safe = mode === "with";

  // The one automatic flip, a moment after the card is seen, unless the visitor got there first.
  React.useEffect(() => {
    if (!seen || touched || still) return;
    const t = setTimeout(() => setMode("with"), 2600);
    return () => clearTimeout(t);
  }, [seen, touched, still]);

  return (
    <Section title="Markets move at 3 AM.">
      <motion.div className="mt-10" onViewportEnter={() => setSeen(true)} viewport={{ once: true, amount: 0.5 }}>
        <Tile className="grid gap-6 p-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center md:gap-10 md:p-8">
          <div className="grid content-start gap-5">
            <Segmented
              label="Show the night"
              value={mode}
              onChange={(v) => { setTouched(true); setMode(v); }}
              options={[{ value: "without", label: "Without Koul" }, { value: "with", label: "With Koul" }]}
              className="w-full max-w-[360px] bg-surface-2"
            />
            <div className="grid gap-2">
              <Label>Loan health at 08:00</Label>
              <span className={cn("num text-[56px] font-extrabold leading-none tracking-tight md:text-[72px]", safe ? "text-accent-text" : "text-danger")}>
                <Rolling text={seen || still ? e.health : "1.62"} durationMs={900} />
              </span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p key={mode} className="text-[18px] font-bold md:text-[20px]" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                  {e.line}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          <svg viewBox="-2 0 332 150" className="h-auto w-full" role="img" aria-label={`Loan health through the night, ${mode === "with" ? "with" : "without"} Koul: it crosses 1.25 at 03:12 and ends at ${e.health}`}>
            <line x1="0" y1={LEVEL_Y} x2="320" y2={LEVEL_Y} stroke="currentColor" strokeWidth="1" strokeDasharray="4 5" className="text-line" />
            <text x="4" y={LEVEL_Y - 6} className="fill-muted mono" fontSize="7">1.25</text>
            <line x1={CROSS[0]} y1="10" x2={CROSS[0]} y2="146" stroke="currentColor" strokeWidth="1" className="text-line" />
            <text x={CROSS[0] + 5} y="18" className="fill-muted mono" fontSize="7">03:12</text>
            {/* Keyed by the ending, so each switch draws the night again from the left. */}
            <motion.path
              key={mode}
              d={e.path}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              stroke="currentColor"
              className={safe ? "text-accent-text" : "text-danger"}
              initial={{ pathLength: still || !seen ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: still ? 0 : 1.1, ease: "easeInOut" }}
            />
            {safe && (
              <motion.circle cx={CROSS[0]} cy={CROSS[1]} className="fill-lime" initial={{ r: 0 }} animate={{ r: 6 }} transition={{ delay: still ? 0 : 0.65, ...SPRING_SOFT }} />
            )}
            <motion.circle
              r="5"
              strokeWidth="2.5"
              className={cn("fill-surface", safe ? "stroke-accent-text" : "stroke-danger")}
              initial={false}
              animate={{ cx: e.end[0], cy: e.end[1], opacity: 1 }}
              transition={{ delay: still ? 0 : 0.9, ...SPRING_SOFT }}
            />
          </svg>
        </Tile>
      </motion.div>
    </Section>
  );
}
