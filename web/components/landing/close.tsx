"use client";

/** What Koul is built on, the last call to action, and the footer. Plain names, no logos, nothing claimed. */
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { Label } from "@/components/signal";
import { staggerChild, staggerParent } from "@/lib/motion";
import { StartButtons, Section } from "./shell";
import { MARKS } from "./marks";

/**
 * What Koul stands on: the mark where the owner publishes one, the name beside it either way. Soroban's branding
 * folded into Stellar's and XOXNO's mark is not published as a file we could use, so those two stand as names.
 */
const BUILT_ON = ["Stellar", "Soroban", "XOXNO", "Passkeys", "OpenZeppelin"];

export function BuiltOn() {
  return (
    <Section title="Built on Stellar today.">
      <motion.div
        className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4 md:gap-x-9"
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
      >
        {BUILT_ON.map((name) => {
          const Mark = MARKS[name];
          return (
            <motion.span key={name} variants={staggerChild} className="flex items-center gap-3">
              {Mark && <Mark className="size-7 shrink-0 md:size-9" />}
              <span className="text-[26px] font-extrabold leading-none tracking-tight md:text-[38px]">{name}</span>
            </motion.span>
          );
        })}
        <motion.span variants={staggerChild} className="label inline-flex items-center rounded-full border border-dashed border-line px-4 py-2 text-muted">
          More DeFi protocols soon
        </motion.span>
      </motion.div>
    </Section>
  );
}

export function FinalCta() {
  return (
    <Section inner="rounded-[var(--radius-tile)] bg-lime px-6 py-14 text-on-lime md:px-12 md:py-20">
      <h2 className="t-headline max-w-[14ch]">Set the rules once. Koul does the rest.</h2>
      <p className="mt-6 max-w-[46ch] text-[19px] md:text-[22px]">Write one rule, watch it run itself.</p>
      <StartButtons tone="onLime" className="mt-8" />
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="px-4 pb-16 md:px-8">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
        <span className="text-[22px] font-extrabold tracking-tight">KOUL</span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Label>Stellar testnet</Label>
          <a
            href="https://github.com/koul-me"
            target="_blank"
            rel="noopener noreferrer"
            className="label inline-flex min-h-11 items-center gap-2 rounded-full text-muted transition-colors hover:text-text"
          >
            github.com/koul-me
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  );
}
