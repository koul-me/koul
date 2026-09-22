"use client";

/**
 * A rule as the page draws it: IF, the condition, the level, an arrow, the action. The same shape as a row in the
 * app, in chips, so the idea reads at a glance: if this, then that.
 */
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { SPRING_SOFT } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface Chip {
  key: string;
  text: string;
  tone?: "plain" | "mono" | "accent" | "action";
}

const tones = {
  plain: "bg-surface-2 text-text",
  mono: "mono bg-surface-2 text-text",
  accent: "mono bg-surface-2 text-accent-text",
  action: "bg-lime text-on-lime font-bold",
} as const;

/** `shown` draws only the first n chips, so the row can assemble itself. `sm` keeps a short rule on one line on a phone. */
export function RuleChips({ chips, shown = chips.length, firing, size = "md", className }: { chips: Chip[]; shown?: number; firing?: boolean; size?: "sm" | "md"; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center", size === "sm" ? "gap-1.5" : "gap-2", className)}>
      {chips.slice(0, shown).map((c, i) => (
        <React.Fragment key={c.key}>
          {i === chips.length - 1 && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={SPRING_SOFT} aria-hidden><ArrowRight className="size-4 text-accent-text" /></motion.span>}
          <motion.span
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_SOFT}
            className={cn("inline-flex items-center rounded-full", size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-[15px]", tones[c.tone ?? "plain"], firing && c.tone === "action" && "animate-flash")}
          >
            {c.text}
          </motion.span>
        </React.Fragment>
      ))}
    </div>
  );
}
