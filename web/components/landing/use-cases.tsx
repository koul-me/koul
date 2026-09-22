"use client";

/**
 * What a rule is for, in three cards: protect a loan, earn the better rate, exit on a price. Each is one sentence
 * and the rule it becomes, so a visitor sees the kinds of things Koul does before touching the playground.
 */
import { motion, useReducedMotion } from "motion/react";
import { ArrowRightLeft, LogOut, ShieldCheck, type LucideIcon } from "lucide-react";
import { Tile } from "@/components/signal";
import { DUR, tween } from "@/lib/motion";
import { Section } from "./shell";
import { RuleChips, type Chip } from "./rule-row";

const CASES: { icon: LucideIcon; title: string; chips: Chip[] }[] = [
  {
    icon: ShieldCheck,
    title: "Protect a loan",
    chips: [
      { key: "s", text: "health", tone: "mono" },
      { key: "l", text: "< 1.25", tone: "accent" },
      { key: "a", text: "Repay debt", tone: "action" },
    ],
  },
  {
    icon: ArrowRightLeft,
    title: "Chase the better rate",
    chips: [
      { key: "s", text: "rate gap", tone: "mono" },
      { key: "l", text: "> 1%", tone: "accent" },
      { key: "a", text: "Move pools", tone: "action" },
    ],
  },
  {
    icon: LogOut,
    title: "Exit on a price",
    chips: [
      { key: "s", text: "USD/TRY", tone: "mono" },
      { key: "l", text: "> 50", tone: "accent" },
      { key: "a", text: "Withdraw", tone: "action" },
    ],
  },
];

export function UseCases() {
  const still = useReducedMotion() ?? false;
  return (
    <Section title="What you can automate">
      <div className="mt-10 grid min-w-0 gap-4 md:grid-cols-3 md:gap-5">
        {CASES.map((c, i) => (
          <motion.div
            key={c.title}
            className="min-w-0"
            initial={still ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ ...tween(DUR.slow), delay: i * 0.08 }}
          >
            <Tile className="flex h-full min-w-0 flex-col gap-5 p-6 md:p-7">
              <div className="flex items-center gap-4 md:flex-col md:items-start">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent-text">
                  <c.icon className="size-5" aria-hidden />
                </span>
                <h3 className="min-w-0 text-[22px] font-extrabold leading-tight tracking-tight md:mt-0">{c.title}</h3>
              </div>
              <RuleChips chips={c.chips} size="sm" className="mt-auto" />
            </Tile>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
