"use client";

/**
 * A button that asks in place. The first press turns the button itself into "Keep | Stop": no dialog, nothing moves
 * on the page. Keep, Escape, a click elsewhere, or four quiet seconds put the button back. Only the second press runs.
 */
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, tween } from "@/lib/motion";
import { cn } from "@/lib/utils";

const size = { md: "h-11 px-5 text-[15px]", lg: "h-14 px-7 text-[17px]" } as const;

export function InlineConfirm({ children, confirmLabel, keepLabel = "Keep", onConfirm, disabled, busy, pill = "md", tone = "outline", className }: {
  /** The button before it asks: "Stop", "Delete". */
  children: React.ReactNode;
  /** The word on the second press. */
  confirmLabel: string;
  keepLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Shown instead of the button while the action runs. */
  busy?: React.ReactNode;
  pill?: keyof typeof size;
  tone?: "outline" | "ghost";
  className?: string;
}) {
  const [asking, setAsking] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!asking) return;
    confirmRef.current?.focus();
    const t = setTimeout(() => setAsking(false), 4000);
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setAsking(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAsking(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(t); document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [asking]);

  const frame = cn(
    "inline-flex items-center overflow-hidden rounded-full font-bold whitespace-nowrap",
    tone === "outline" ? "border border-line" : "bg-surface-2",
    disabled && !asking && "opacity-40",
  );
  const part = cn("inline-flex h-full items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text", size[pill]);

  return (
    <motion.div ref={box} layout transition={SPRING_SOFT} className={cn(frame, pill === "lg" ? "h-14" : "h-11", className)} style={{ borderRadius: 999 }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {asking ? (
          <motion.div key="ask" className="flex h-full items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween()}>
            <button type="button" className={cn(part, "text-text hover:bg-surface-2")} onClick={() => setAsking(false)}>{keepLabel}</button>
            <span className="h-5 w-px bg-line" aria-hidden />
            <button ref={confirmRef} type="button" className={cn(part, "text-danger hover:bg-surface-2")} onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
          </motion.div>
        ) : (
          <motion.button
            key="ask-first"
            type="button"
            disabled={disabled}
            aria-busy={busy ? true : undefined}
            className={cn(part, "text-text enabled:hover:bg-surface-2 disabled:cursor-not-allowed")}
            onClick={() => setAsking(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tween()}
          >
            {busy ?? children}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
