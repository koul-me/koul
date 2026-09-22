"use client";

/**
 * Named steps: dots on desktop, a segmented bar and "STEP 2 OF 4 · SEND" on phones. A finished step ticks: its dot
 * becomes a check and its name is struck through, the way a list item gets done.
 */
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { Label } from "@/components/signal";
import { tween } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function Steps({ labels, active, failed }: { labels: string[]; active: number; failed?: boolean }) {
  const current = Math.min(active, labels.length - 1);
  return (
    <div>
      <ol className="hidden items-center justify-between md:flex" aria-label="Progress">
        {labels.map((l, i) => {
          const done = i < active;
          const now = i === current && active < labels.length;
          return (
            <li key={l} className="flex items-center gap-2">
              <motion.span aria-hidden layout className={cn("inline-flex size-4 items-center justify-center rounded-full", done ? "bg-lime text-on-lime" : now ? (failed ? "border-2 border-danger" : "border-2 border-accent-text") : "border-2 border-dim")} initial={false} animate={{ scale: done ? [1, 1.25, 1] : 1 }} transition={tween()}>
                {done && <Check className="size-3" strokeWidth={3} />}
              </motion.span>
              <span className="relative">
                <Label tone={done ? "muted" : now ? "text" : "muted"}>{l}</Label>
                {done && <motion.span aria-hidden className="absolute inset-x-0 top-1/2 h-px origin-left bg-muted" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={tween()} />}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="md:hidden">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} aria-hidden>
          {labels.map((l, i) => (
            <span key={l} className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
              {(i < active || (i === current && active < labels.length)) && (
                <motion.span className={cn("absolute inset-0 origin-left rounded-full", i < active ? "bg-accent-text" : failed ? "bg-danger" : "bg-accent-text/50")} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={tween()} />
              )}
            </span>
          ))}
        </div>
        <Label className="mt-3 block">{active >= labels.length ? "Done" : `Step ${current + 1} of ${labels.length} · ${labels[current]}`}</Label>
      </div>
    </div>
  );
}
