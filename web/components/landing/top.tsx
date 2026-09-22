"use client";

/**
 * The landing's own header: the wordmark, a jump to the playground, and the light switch. It sits at the top of
 * the page and takes a ground and a hairline once you scroll past the hero, so it never floats over the text.
 */
import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { cn } from "@/lib/utils";
import { APP_PATH } from "./shell";
import { KoulMark } from "@/components/brand/koul-mark";

/** True once the page is running in the browser; before that next-themes has not read the stored choice. */
function useMounted() {
  return React.useSyncExternalStore(() => () => {}, () => true, () => false);
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const light = mounted && resolvedTheme === "light";
  const flip = () => {
    const root = document.documentElement;
    root.classList.add("theme-fade");
    setTheme(light ? "dark" : "light");
    window.setTimeout(() => root.classList.remove("theme-fade"), 300);
  };
  return (
    <button
      type="button"
      onClick={flip}
      disabled={!mounted}
      aria-label={light ? "Switch to the dark theme" : "Switch to the light theme"}
      className={cn("inline-flex size-11 items-center justify-center rounded-full bg-surface text-muted transition-[filter,color] hover:text-text hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text", className)}
    >
      {light ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
    </button>
  );
}

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#build", label: "Try it" },
  { href: "#safety", label: "Safety" },
];

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
            <a href={APP_PATH} className="label inline-flex h-11 items-center rounded-full bg-lime px-4 text-on-lime transition-[filter] hover:brightness-105">Open app</a>
            <ThemeToggle />
          </div>
        </div>
      </header>
  );
}
