"use client";

/** What Koul is built on, the last call to action, and the footer. Plain names, no logos, nothing claimed. */
import { motion } from "motion/react";
import { Label } from "@/components/signal";
import { staggerChild, staggerParent } from "@/lib/motion";
import { StartButtons, Section } from "./shell";

/** The names, large, with a dot between them. Fewer words than a tile each, and it reads as one thought. */
const BUILT_ON = ["Stellar", "Soroban", "XOXNO", "Passkeys", "OpenZeppelin accounts"];

export function BuiltOn() {
  return (
    <Section title="Built on Stellar today.">
      {/* The names arrive one after another, so the band reads as a list being written, not a slide. */}
      <motion.div
        className="mt-10 flex flex-wrap items-baseline gap-x-5 gap-y-2 md:gap-x-7"
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
      >
        {BUILT_ON.map((name, i) => (
          <motion.span key={name} variants={staggerChild} className="flex items-baseline gap-5 md:gap-7">
            <span className="text-[30px] font-extrabold leading-tight tracking-tight md:text-[44px]">{name}</span>
            {i < BUILT_ON.length - 1 && <span className="text-[30px] font-extrabold text-accent-text md:text-[44px]" aria-hidden>·</span>}
          </motion.span>
        ))}
      </motion.div>
      <p className="mt-8 max-w-[48ch] text-[17px] text-muted md:text-[19px]">
        A rule is just a condition and an action. Nothing about that belongs to one lender, or one chain. More of both is where this goes next.
      </p>
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
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[22px] font-extrabold tracking-tight">KOUL</span>
        <div className="grid gap-1 sm:text-right">
          <Label>Stellar testnet. Not financial advice.</Label>
          <Label tone="muted">Built at the Rise In x Stellar Pro Hackathon, Istanbul</Label>
        </div>
      </div>
    </footer>
  );
}
