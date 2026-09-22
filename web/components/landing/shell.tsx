"use client";

/**
 * The frame the landing page shares: a full-bleed section with a centred column inside, the small section label,
 * and the two passkey buttons that start the real flows. Nothing here talks to the chain.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Label, PillButton } from "@/components/signal";
import { DUR, tween } from "@/lib/motion";
import { useWallet, useWalletOnboarding, type PasskeyPhase } from "@/hooks/use-wallet";
import { cn } from "@/lib/utils";

const BUSY: Partial<Record<PasskeyPhase, string>> = {
  prompt: "Confirm with your passkey",
  deploying: "Creating your wallet",
  funding: "Adding test XLM",
  submitting: "Almost there",
};

/**
 * Create wallet and I have a wallet: the same two passkey actions the app has always used, and on success the app
 * at /app. With a wallet already connected there is nothing to create, so the one button opens the app.
 */
export function StartButtons({ tone = "dark", className }: { tone?: "dark" | "onLime"; className?: string }) {
  const w = useWallet();
  const ob = useWalletOnboarding();
  const router = useRouter();
  const start = async (which: "create" | "connect") => { if (await ob.run(which)) router.push("/app"); };
  if (w.isConnected) {
    return (
      <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
        <PillButton variant={tone === "onLime" ? "onLime" : "lime"} size="lg" href="/app">Open app</PillButton>
      </div>
    );
  }
  const busy = ob.phase === "prompt" || ob.phase === "deploying" || ob.phase === "funding" || ob.phase === "submitting";
  const creating = busy && ob.mode === "create";
  const connecting = busy && ob.mode === "connect";
  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <PillButton variant={tone === "onLime" ? "onLime" : "lime"} size="lg" disabled={busy} aria-busy={creating} onClick={() => void start("create")}>
          {creating ? BUSY[ob.phase] : "Create wallet"}
        </PillButton>
        <PillButton variant={tone === "onLime" ? "onLimeOutline" : "outline"} size="lg" disabled={busy} aria-busy={connecting} onClick={() => void start("connect")}>
          {connecting ? BUSY[ob.phase] : "I have a wallet"}
        </PillButton>
        <Label tone={tone === "onLime" ? "onLime" : "muted"} className="sm:ml-2">Passkey · no seed phrase</Label>
      </div>
      <p role="status" aria-live="polite" className={cn("label min-h-5", tone === "onLime" ? "text-on-lime" : "text-muted")}>
        {ob.phase === "cancelled" && "Nothing was signed. Try again when you are ready."}
        {ob.phase === "error" && (ob.error?.code === "wallet_not_found" || /no wallet found/i.test(ob.error?.message ?? "") ? "No wallet for this passkey on this site. Wallets belong to the site that created them." : ob.error?.userMessage || ob.error?.message || "That did not work. Try again.")}
      </p>
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
