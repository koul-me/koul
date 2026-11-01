"use client";

/**
 * The landing's own header: the wordmark, a jump to the playground, and the light switch. It sits at the top of
 * the page and takes a ground and a hairline once you scroll past the hero, so it never floats over the text.
 */
import * as React from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { WAITLIST_GATED } from "@/lib/waitlist";
import { APP_PATH } from "./shell";
import { focusWaitlist } from "./waitlist-form";
import { KoulMark } from "@/components/brand/koul-mark";
import { ThemeToggle } from "@/components/shell/theme-toggle";

const NAV = [
  { href: "/compete", label: "Competition" },
  { href: "#how", label: "How it works" },
  { href: "#build", label: "Try it" },
  { href: "#safety", label: "Safety" },
];

const headerPill = "label inline-flex h-11 items-center rounded-full bg-lime px-4 text-on-lime transition-[filter] hover:brightness-105";

export function TopBar() {
  const { scrollY } = useScroll();
  const [past, setPast] = React.useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setPast(v > 24));
  return (
      <header className={cn("sticky top-0 z-40 transition-colors", past && "border-b border-line bg-background")}>
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-4 py-4 md:px-8 md:py-5">
          <span className="inline-flex items-center gap-2 text-[24px] font-extrabold tracking-tight md:text-[28px]"><KoulMark className="size-7 md:size-8" />KOUL</span>
          <div className="flex items-center gap-2">
            <nav aria-label="Sections" className="hidden items-center md:flex">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="label inline-flex h-11 items-center rounded-full px-4 text-muted transition-colors hover:text-text">{n.label}</a>
              ))}
            </nav>
            {WAITLIST_GATED ? (
              // Jumps to the hero's field instead of opening one in the header.
              <button type="button" onClick={focusWaitlist} className={headerPill}>Join waitlist</button>
            ) : (
              <a href={APP_PATH} onClick={() => track("open_app", { from: "header" })} className={headerPill}>Open app</a>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>
  );
}
