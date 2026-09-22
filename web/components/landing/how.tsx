"use client";

/**
 * How it works, in three cards side by side (stacked on a phone): say what you want and it becomes a rule, the
 * rule is stored on-chain next to your wallet, and a check makes it run itself. Each card draws its own small
 * picture. Nothing is pinned to the scroll, so the page never stalls.
 */
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, KeyRound, ScrollText, Wallet } from "lucide-react";
import { Label, Tile } from "@/components/signal";
import { DUR, tween } from "@/lib/motion";
import { Section } from "./shell";
import { RuleChips, type Chip } from "./rule-row";
import { cn } from "@/lib/utils";

const SENTENCE = "Repay my loan if health drops under 1.25";
const RULE: Chip[] = [
  { key: "subject", text: "health", tone: "mono" },
  { key: "level", text: "< 1.25", tone: "accent" },
  { key: "action", text: "Repay debt", tone: "action" },
];

const RUN = ["Check arrives", "Router reads live data", "Rule 1 matches", "Wallet executes"];

const TYPE_MS = 45;
const HOLD_MS = 900;
const SHOW_MS = 2600;

/** Types the sentence, shows the rule it becomes, then starts again. With reduced motion both simply sit there. */
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

function SayIt({ still }: { still: boolean }) {
  const { text, typing, shown } = useTyping(still);
  return (
    <div className="grid min-w-0 gap-3">
      <div className="min-h-[76px] rounded-[var(--radius-group)] border border-accent-text p-4">
        <Label tone="lime">Tell Koul</Label>
        <p className="mt-1.5 text-[16px] leading-snug">
          {text}
          <span className={cn("ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-accent-text", typing ? "animate-blink" : "opacity-0")} aria-hidden />
        </p>
      </div>
      <div className="min-h-[40px]">
        <RuleChips chips={RULE} shown={shown ? RULE.length : 0} size="sm" />
      </div>
    </div>
  );
}

function OnChain() {
  const node = "flex min-w-0 flex-1 flex-col items-center gap-2 rounded-[var(--radius-group)] bg-surface-2 px-3 py-4 text-center";
  return (
    <div className="grid gap-3">
      <div className="flex items-stretch gap-2">
        <div className={node}>
          <Wallet className="size-5 text-accent-text" aria-hidden />
          <span className="text-[14px] font-bold">Your wallet</span>
        </div>
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1">
          <KeyRound className="size-4 text-muted" aria-hidden />
          <span className="h-px w-8 bg-accent-text" aria-hidden />
        </div>
        <div className={node}>
          <ScrollText className="size-5 text-accent-text" aria-hidden />
          <span className="text-[14px] font-bold">Router contract</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["Rule 1", "Rule 2", "Rule 3"].map((r, i) => (
          <span key={r} className={cn("mono rounded-full py-2 text-center text-[12px]", i === 0 ? "bg-lime text-on-lime" : "bg-surface-2 text-muted")}>{r}</span>
        ))}
      </div>
    </div>
  );
}

function Runs({ still }: { still: boolean }) {
  const [lit, setLit] = React.useState(0);
  React.useEffect(() => {
    if (still) return;
    const t = setInterval(() => setLit((n) => (n >= RUN.length + 1 ? 0 : n + 1)), 650);
    return () => clearInterval(t);
  }, [still]);
  const shown = still ? RUN.length : Math.min(lit, RUN.length);
  return (
    <ol className="grid gap-2.5">
      {RUN.map((r, i) => (
        <li key={r} className="flex items-center gap-3">
          <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors", i < shown ? "bg-lime text-on-lime" : "bg-surface-2 text-muted")}>
            {i < shown ? <Check className="size-3.5" aria-hidden /> : <span className="mono text-[11px]">{i + 1}</span>}
          </span>
          <span className={cn("text-[15px] transition-colors", i < shown ? "text-text" : "text-muted")}>{r}</span>
        </li>
      ))}
    </ol>
  );
}

const STEPS = [
  { n: "01", title: "Say it", line: "Plain words become a rule." },
  { n: "02", title: "Store it", line: "The rule lives on-chain, next to your wallet." },
  { n: "03", title: "Forget it", line: "Checks run all day. The first match fires." },
] as const;

export function How() {
  const still = useReducedMotion() ?? false;
  return (
    <Section id="how" label="How it works" title="Three steps. Then it runs without you.">
      <div className="mt-10 grid min-w-0 gap-4 md:gap-5 lg:grid-cols-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.n}
            className="min-w-0"
            initial={still ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ ...tween(DUR.slow), delay: i * 0.08 }}
          >
            <Tile className="flex h-full min-w-0 flex-col gap-6 p-6 md:p-7">
              <div>
                <Label tone="lime">{s.n}</Label>
                <h3 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight">{s.title}</h3>
                <p className="mt-1 text-[16px] text-muted">{s.line}</p>
              </div>
              <div className="mt-auto min-w-0">
                {i === 0 ? <SayIt still={still} /> : i === 1 ? <OnChain /> : <Runs still={still} />}
              </div>
            </Tile>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
