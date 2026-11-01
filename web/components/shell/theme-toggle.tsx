"use client";

/** The light switch, the same round button on the landing, the waitlist, the app and the competition pages. */
import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

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
