"use client";

/**
 * A tile value that always shows in full: it starts at its class's size and, when the number is wider than its box,
 * shrinks to fit (never below 14 px), again whenever the box changes size. "7,074.92" in a narrow tile reads 7,074.92,
 * not "7,07…".
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export function FitValue({ text, className, base = "t-value", ...rest }: React.HTMLAttributes<HTMLDivElement> & { text: string; base?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      if (el.scrollWidth <= el.clientWidth + 0.5) return;
      const natural = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.max(14, Math.floor((natural * el.clientWidth) / el.scrollWidth) - 1)}px`;
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <div ref={ref} className={cn(base, "num min-w-0 overflow-hidden whitespace-nowrap", className)} {...rest}>
      {text}
    </div>
  );
}
