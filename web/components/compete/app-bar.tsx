"use client";

/**
 * The competition pages' bar, the app's own on every host, so Overview, Leaderboard and My entry (/join, inside the
 * app frame) keep the same width, bar and section row as you move between them. With a wallet: the app's top bar
 * (Compete lit, the wallet chip) and, on phones, its tab bar. Without one: the wordmark and Join while entries are
 * open. While the wallet is still being read it holds the bar's place, as the app frame does, so nothing jumps.
 */
import Link from "next/link";
import { AppBaseProvider } from "@/lib/app-base";
import { useWallet } from "@/hooks/use-wallet";
import { Label, PillButton, Sk } from "@/components/signal";
import { KoulMark } from "@/components/brand/koul-mark";
import { TopBar } from "@/components/shell/top-bar";
import { BottomTabs } from "@/components/shell/bottom-tabs";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/**
 * `base` is the app's base on this host ("" on app.koul.me, "/app" elsewhere). `joinHref` is null once entries close,
 * undefined while a page is still loading (its place is kept, so Join does not push the switch over when it lands).
 */
export function CompeteAppBar({ base, joinHref }: { base: string; joinHref: string | null | undefined }) {
  const w = useWallet();
  return (
    <AppBaseProvider base={base}>
      {w.initializing ? (
        <div className="flex h-[88px] items-center justify-between">
          <Sk className="h-6 w-16" />
          <div className="flex items-center gap-2"><Sk className="h-11 w-28 rounded-full" /><Sk className="size-11 rounded-full" /></div>
        </div>
      ) : w.isConnected ? (
        <>
          <TopBar connected />
          <BottomTabs />
        </>
      ) : (
        <header className="flex h-[88px] items-center justify-between gap-6">
          {/* Off the app host the wordmark goes to the landing, as it did before there was a wallet. */}
          <Link href="/" aria-label="Koul home" className="inline-flex h-11 items-center text-[20px] font-extrabold tracking-[-0.04em] text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
            <KoulMark className="mr-2 size-6" />
            KOUL
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {joinHref ? <PillButton href={joinHref} size="md">Join</PillButton> : joinHref === null ? <Label className="mr-2">Stellar testnet</Label> : <span aria-hidden className="h-11 w-[84px]" />}
            <ThemeToggle />
          </div>
        </header>
      )}
    </AppBaseProvider>
  );
}
