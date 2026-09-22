"use client";

/**
 * Your money stays yours: the key Koul acts with, drawn inside a fence. What it may call is the policy's real
 * allowlist; what it can never do crosses itself out as it arrives. It expires on its own and one passkey ends it.
 */
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { Label, Tile, TileLabel } from "@/components/signal";
import { DUR, tween } from "@/lib/motion";
import { Section } from "./shell";
import { cn } from "@/lib/utils";

const CAN = [
  "Run your rules",
  "Move USDC between your wallet and your position",
  "Repay your loan",
  "Send USDC to the pool, nowhere else",
];

const NEVER = [
  "Send your money anywhere else",
  "Withdraw to another wallet",
  "Touch anyone else's position",
  "Cash out to a bank",
  "Work once you revoke it",
];

function Never({ text, i, still }: { text: string; i: number; still: boolean }) {
  return (
    <motion.li
      className="flex items-center gap-3 py-2.5"
      initial={still ? false : { opacity: 0, x: -6 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={tween(DUR.base)}
    >
      <span className="mono shrink-0 text-muted" aria-hidden>0{i + 1}</span>
      <span className="relative text-[16px] text-muted md:text-[17px]">
        {text}
        <motion.span
          className="absolute inset-x-0 top-1/2 h-[2px] origin-left bg-danger"
          initial={still ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ ...tween(DUR.slow), delay: 0.12 + i * 0.06 }}
          aria-hidden
        />
      </span>
    </motion.li>
  );
}

export function Safety() {
  const still = useReducedMotion() ?? false;
  return (
    <Section title="Koul never holds your funds." lead="It acts through a key on your own wallet, pinned to a few calls, that expires.">
      <div className="mt-10 grid gap-4 md:gap-5 lg:grid-cols-2">
        <Tile className="grid content-start gap-4 border-2 border-accent-text p-6 md:p-8">
          <div className="flex items-baseline justify-between gap-3">
            <TileLabel>Koul&rsquo;s key can</TileLabel>
            <Label tone="lime">4 calls</Label>
          </div>
          <ul className="divide-y divide-line">
            {CAN.map((c) => (
              <li key={c} className="flex items-center gap-3 py-2.5">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-lime text-on-lime"><Check className="size-3.5" aria-hidden /></span>
                <span className="text-[16px] md:text-[17px]">{c}</span>
              </li>
            ))}
          </ul>
        </Tile>

        <Tile className="grid content-start gap-4 p-6 md:p-8">
          <div className="flex items-baseline justify-between gap-3">
            <TileLabel>It can never</TileLabel>
            <Label tone="muted">Refused by the contract</Label>
          </div>
          <ul className={cn("divide-y divide-line")}>
            {NEVER.map((n, i) => <Never key={n} text={n} i={i} still={still} />)}
          </ul>
        </Tile>
      </div>
      <p className="mt-6 max-w-[64ch] text-[16px] text-muted md:text-[17px]">
        A policy contract on your wallet checks every call and refuses the rest. One passkey ends the key for good.
      </p>
    </Section>
  );
}
