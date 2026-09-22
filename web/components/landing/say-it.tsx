"use client";

/**
 * Or just say it: a sentence types itself into the composer and turns into a rule, the way the app's chat does.
 * With reduced motion on, the sentence and the rule it becomes are simply both there.
 */
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Label, Tile } from "@/components/signal";
import { tween } from "@/lib/motion";
import { Section } from "./shell";
import { RuleChips, type Chip } from "./rule-row";
import { cn } from "@/lib/utils";

const SENTENCE = "Repay my loan if health drops under 1.25";
const CHIPS: Chip[] = [
  { key: "if", text: "IF", tone: "mono" },
  { key: "subject", text: "loan health", tone: "mono" },
  { key: "level", text: "< 1.25", tone: "accent" },
  { key: "action", text: "Repay debt", tone: "action" },
];

const TYPE_MS = 45;
const HOLD_MS = 1100;
const SHOW_MS = 2600;

/** Types the sentence, holds it, shows the rule, then starts again. */
function useTyping(still: boolean) {
  const [n, setN] = React.useState(0);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    if (still) return;
    let typed = 0;
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = () => {
      if (stopped) return;
      typed += 1;
      setN(typed);
      if (typed < SENTENCE.length) { timers.push(setTimeout(tick, TYPE_MS)); return; }
      timers.push(setTimeout(() => {
        setShown(true);
        timers.push(setTimeout(() => { setShown(false); typed = 0; setN(0); timers.push(setTimeout(tick, 400)); }, SHOW_MS));
      }, HOLD_MS));
    };
    timers.push(setTimeout(tick, 600));
    return () => { stopped = true; for (const t of timers) clearTimeout(t); };
  }, [still]);
  return still ? { text: SENTENCE, typing: false, shown: true } : { text: SENTENCE.slice(0, n), typing: n < SENTENCE.length, shown };
}

export function SayIt() {
  const still = useReducedMotion() ?? false;
  const { text, typing, shown } = useTyping(still);
  return (
    <Section title="Say what you want. Koul writes the rule.">
      <div className="mt-10 grid min-w-0 gap-4 md:gap-5">
        <Tile className="min-w-0 rounded-[var(--radius-tile)] border-2 border-accent-text p-5 md:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <Label tone="lime" className="shrink-0">Tell Koul</Label>
            {/* One line where there is room; on a phone it wraps rather than setting the width of the page. */}
            <p className="min-w-0 flex-1 text-[17px] md:truncate md:text-[20px]">
              {text}
              <span className={cn("ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.15em] bg-accent-text", typing ? "animate-blink" : "opacity-0")} aria-hidden />
            </p>
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-lime text-on-lime" aria-hidden><ArrowRight className="size-4" /></span>
          </div>
        </Tile>
        <motion.div animate={{ opacity: shown ? 1 : 0.55 }} initial={false} transition={tween()}>
          <Tile className="grid gap-4 p-5 md:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <Label>The rule it becomes</Label>
              <Label tone={shown ? "lime" : "muted"}>{shown ? "Ready to start" : "Waiting"}</Label>
            </div>
            <RuleChips chips={CHIPS} shown={shown ? CHIPS.length : 0} />
            <Label tone="muted">Nothing runs until you start it with your passkey.</Label>
          </Tile>
        </motion.div>
      </div>
    </Section>
  );
}
