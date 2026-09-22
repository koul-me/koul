"use client";

/** What Koul is built on, the last call to action, and the footer. Plain names, no logos, nothing claimed. */
import { motion } from "motion/react";
import { Label } from "@/components/signal";
import { staggerChild, staggerParent } from "@/lib/motion";
import { StartButtons, Section } from "./shell";

/**
 * What Koul stands on. The names carry their own mark once the files are there: drop an SVG into
 * `web/public/logos/` and give the entry a `logo`. Until then the name is the mark, set large.
 */
const BUILT_ON: { name: string; logo?: string }[] = [
  { name: "Stellar" },
  { name: "Soroban" },
  { name: "XOXNO" },
  { name: "Passkeys" },
  { name: "OpenZeppelin" },
];

export function BuiltOn() {
  return (
    <Section title="Built on Stellar today.">
      <motion.div
        className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-4 md:gap-x-8"
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
      >
        {BUILT_ON.map((b) => (
          <motion.span key={b.name} variants={staggerChild} className="flex items-center">
            {b.logo ? (
              // Brand marks are drawn files, not code: a plain tag keeps them exactly as supplied.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo} alt={b.name} className="h-7 w-auto md:h-9" />
            ) : (
              <span className="text-[30px] font-extrabold leading-none tracking-tight md:text-[44px]">{b.name}</span>
            )}
          </motion.span>
        ))}
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
