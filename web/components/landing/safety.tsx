"use client";

/**
 * Your money stays yours, in three short points and one strip of what the key can never do, each crossed out as it
 * arrives. The points follow the policy contract: the key is pinned to a few calls, it expires, one passkey ends it.
 */
import { motion, useReducedMotion } from "motion/react";
import { Fingerprint, Lock, Timer, type LucideIcon } from "lucide-react";
import { Label, Tile } from "@/components/signal";
import { DUR, tween } from "@/lib/motion";
import { Section } from "./shell";

const POINTS: { icon: LucideIcon; title: string; line: string }[] = [
  { icon: Lock, title: "Funds stay in your wallet", line: "Koul never holds them. No vault, no deposit." },
  { icon: Timer, title: "A key on a short leash", line: "Four allowed calls. It expires on its own." },
  { icon: Fingerprint, title: "One passkey ends it", line: "Revoke any time. Your rules stay saved." },
];

const NEVER = ["Send funds elsewhere", "Withdraw to another wallet", "Cash out to a bank", "Touch other positions"];

export function Safety() {
  const still = useReducedMotion() ?? false;
  return (
    <Section id="safety" label="Safety" title="Your money never leaves your wallet.">
      <div className="mt-10 grid min-w-0 gap-4 md:grid-cols-3 md:gap-5">
        {POINTS.map((p) => (
          <Tile key={p.title} className="flex min-w-0 items-start gap-4 p-6 md:flex-col md:p-7">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-lime text-on-lime">
              <p.icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-[20px] font-extrabold leading-tight tracking-tight">{p.title}</h3>
              <p className="mt-1 text-[16px] text-muted">{p.line}</p>
            </div>
          </Tile>
        ))}
      </div>

      <Tile className="mt-4 grid min-w-0 gap-4 p-6 md:mt-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-8 md:p-7">
        <div className="grid gap-1">
          <Label tone="danger">The key can never</Label>
          <Label tone="muted">Refused by the contract</Label>
        </div>
        <ul className="flex min-w-0 flex-wrap gap-2">
          {NEVER.map((n, i) => (
            <li key={n} className="relative inline-flex h-10 items-center rounded-full bg-surface-2 px-4 text-[15px] text-muted">
              {n}
              <motion.span
                className="absolute inset-x-3 top-1/2 h-[2px] origin-left bg-danger"
                initial={still ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{ ...tween(DUR.slow), delay: 0.15 + i * 0.1 }}
                aria-hidden
              />
            </li>
          ))}
        </ul>
      </Tile>
    </Section>
  );
}
