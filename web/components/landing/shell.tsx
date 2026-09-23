"use client";

/**
 * The frame the landing page shares: a full-bleed section with a centred column inside, the small section label,
 * and the way into the app. Nothing here talks to the chain or the wallet.
 */
import * as React from "react";
import { motion } from "motion/react";
import { Label } from "@/components/signal";
import { DUR, tween } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The app lives on its own host (app.koul.me). "/app" gets there from any host: the proxy sends koul.me to
 * app.koul.me and serves it in place elsewhere. A plain anchor, because the jump can cross origins.
 */
export const APP_PATH = "/app";

const pill = "inline-flex h-14 items-center justify-center rounded-full px-7 text-[17px] font-bold whitespace-nowrap transition-[filter,opacity,background-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";
const TONES = {
  dark: { main: "bg-lime text-on-lime hover:brightness-95", note: "muted" },
  onLime: { main: "bg-on-lime text-lime hover:opacity-90", note: "onLime" },
} as const;

/** One way in: the app. No wallet steps on the landing. */
export function StartButtons({ tone = "dark", className }: { tone?: "dark" | "onLime"; className?: string }) {
  const t = TONES[tone];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-3", className)}>
      <a href={APP_PATH} className={cn(pill, t.main)}>Open app</a>
      <Label tone={t.note}>Stellar testnet</Label>
    </div>
  );
}

/** A full-bleed band with the page's column inside it. */
export function Section({ id, label, title, lead, children, className, inner }: { id?: string; label?: string; title?: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode; className?: string; inner?: string }) {
  return (
    <section id={id} className={cn("px-4 py-14 md:px-8 md:py-20", className)}>
      <div className={cn("mx-auto w-full max-w-[1280px]", inner)}>
        {(label || title || lead) && (
          <motion.header
            className="max-w-[760px]"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={tween(DUR.slow)}
          >
            {label && <Label tone="lime">{label}</Label>}
            {title && <h2 className={cn("t-title", label && "mt-4")}>{title}</h2>}
            {lead && <p className="mt-5 text-[17px] text-muted md:text-[19px]">{lead}</p>}
          </motion.header>
        )}
        {children}
      </div>
    </section>
  );
}

/** "Illustrative · not live data": every mocked number on this page carries one. */
export function Illustrative({ children = "Illustrative, not live data", className }: { children?: React.ReactNode; className?: string }) {
  return <Label tone="muted" className={cn("block", className)}>{children}</Label>;
}
