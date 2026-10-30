import Link from "next/link";
import { headers } from "next/headers";
import { KoulMark } from "@/components/brand/koul-mark";
import { PillButton } from "@/components/signal";
import { TELEGRAM_URL } from "@/lib/community";
import { isAppHost } from "@/lib/app-host";
import { CompeteAppBar } from "./app-bar";
import { SectionNav, type Section } from "./section-nav";

/** This request's host is the app's (app.koul.me, app.localhost): the competition pages then use the app's frame. */
export async function onAppHost(): Promise<boolean> {
  return isAppHost((await headers()).get("host") ?? "");
}

/**
 * The competition pages' frame. On the app host it is the app's own (components/shell/app-shell.tsx Frame): the same
 * width, side padding and bar, with the section row where /join shows it, so Overview, Leaderboard and My entry line
 * up when you move between them. On koul.me: a narrower page, the wordmark to the landing and Join while entries
 * are open. The section row (Overview, Leaderboard, My entry) is the same on both.
 */
export async function CompetePage({ section, joinable, children }: { section: Section; joinable: boolean; children: React.ReactNode }) {
  if (await onAppHost()) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-28 md:px-8 md:pb-12">
        <CompeteAppBar />
        <main className="grid gap-5">
          <SectionNav active={section} entryHref="/join" />
          {children}
        </main>
      </div>
    );
  }
  return (
    <main className="mx-auto grid w-full max-w-[1100px] gap-5 px-4 pt-6 pb-16 md:px-8 md:pb-10">
      <header className="flex items-center justify-between gap-3">
        <a href="https://koul.me" className="inline-flex items-center gap-2 text-[22px] font-extrabold tracking-tight"><KoulMark className="size-6" />KOUL</a>
        {joinable && <PillButton href="/app/join" size="md">Join</PillButton>}
      </header>
      <SectionNav active={section} entryHref="/app/join" />
      {children}
    </main>
  );
}

const footLink = "label inline-flex min-h-11 items-center text-muted transition-colors hover:text-text";

/** The competition pages' footer: the full terms, the Telegram group when one is set, status and the landing. */
export function CompeteFooter() {
  return (
    <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
      <span className="label text-muted">Koul · Stellar testnet</span>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/compete/terms" className={footLink}>Terms</Link>
        {TELEGRAM_URL && <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className={footLink}>Telegram</a>}
        <Link href="/status" className={footLink}>Status</Link>
        <a href="https://koul.me" className={footLink}>koul.me</a>
      </div>
    </footer>
  );
}
