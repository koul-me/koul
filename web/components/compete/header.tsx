import Link from "next/link";
import { headers } from "next/headers";
import { TELEGRAM_URL } from "@/lib/community";
import { isAppHost } from "@/lib/app-host";
import { CompeteAppBar } from "./app-bar";
import { SectionNav, type Section } from "./section-nav";

/** This request's host is the app's (app.koul.me, app.localhost): the competition pages then use the app's frame. */
export async function onAppHost(): Promise<boolean> {
  return isAppHost((await headers()).get("host") ?? "");
}

/**
 * The competition pages' frame: the app's own (components/shell/app-shell.tsx Frame) on every host, the same width,
 * side padding and 88 px bar, with the section row where /join shows it, so Overview, Leaderboard and My entry line
 * up when you move between them. Only the bar's contents differ: the app's tabs with a wallet, the wordmark and Join
 * without one. The section row (Overview, Leaderboard, My entry) is the same everywhere.
 */
export async function CompetePage({ section, joinable, children, refHandle }: { section: Section; joinable: boolean; children: React.ReactNode; /** An invite handle to carry into /join. */ refHandle?: string | null }) {
  const q = refHandle ? `?ref=${encodeURIComponent(refHandle)}` : "";
  const base = (await onAppHost()) ? "" : "/app";
  const entryHref = `${base}/join${q}`;
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-28 md:px-8 md:pb-12">
      <CompeteAppBar base={base} joinHref={joinable ? entryHref : null} />
      <main className="grid gap-5">
        <SectionNav active={section} entryHref={entryHref} />
        {children}
      </main>
    </div>
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
