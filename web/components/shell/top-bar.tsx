"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAppHref, useAppPathname } from "@/lib/app-base";
import { Label } from "@/components/signal";
import { AccountChip } from "./account-chip";
import { ThemeToggle } from "./theme-toggle";
import { TABS } from "./nav";
import { KoulMark } from "@/components/brand/koul-mark";

export function Wordmark({ className }: { className?: string }) {
  const appHref = useAppHref();
  return (
    <Link href={appHref("/")} aria-label="Koul home" className={cn("inline-flex h-11 items-center text-[20px] font-extrabold tracking-[-0.04em] text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text", className)}>
      <KoulMark className="mr-2 size-6" />
      KOUL
    </Link>
  );
}

/**
 * One row: the wordmark, a thin divider, the tabs in large type, the account chip and the light switch on the right.
 * `connected=false` is the Welcome variant: wordmark, the network label and the light switch.
 */
export function TopBar({ connected, className }: { connected: boolean; className?: string }) {
  const pathname = useAppPathname();
  const appHref = useAppHref();
  return (
    <header className={cn("flex h-[88px] items-center justify-between gap-6", className)}>
      <div className="flex min-w-0 items-center gap-4 lg:gap-6">
        <Wordmark />
        {connected && (
          <>
            <span aria-hidden className="hidden h-8 w-px bg-line md:block" />
            <nav aria-label="Main" className="hidden items-center gap-4 md:flex lg:gap-7">
              {TABS.map((t) => {
                const on = t.active(pathname);
                return (
                  <Link
                    key={t.href}
                    href={appHref(t.href)}
                    aria-current={on ? "page" : undefined}
                    className={cn("t-tab rounded-md py-1 text-[20px]! lg:text-[32px]! transition-colors duration-[240ms] ease-out focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text", on ? "text-text" : "text-dim hover:text-muted active:text-text")}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {connected ? <AccountChip /> : <Label className="mr-2">Stellar testnet</Label>}
        <ThemeToggle />
      </div>
    </header>
  );
}
