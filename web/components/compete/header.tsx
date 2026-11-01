import Link from "next/link";
import { headers } from "next/headers";
import { TELEGRAM_URL } from "@/lib/community";
import { isAppHost } from "@/lib/app-host";
import { CompeteAppBar } from "./app-bar";
import { SectionNav, type Section } from "./section-nav";
import { Sk } from "@/components/signal";

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

/**
 * What a competition page shows while the server renders it (each route's loading.tsx): the same frame, bar and
 * section row, with the new section already lit, and placeholders for the content. A click answers at once instead of
 * waiting for the board to load.
 */
export async function CompeteLoading({ section }: { section: Section }) {
  const base = (await onAppHost()) ? "" : "/app";
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-28 md:px-8 md:pb-12">
      <CompeteAppBar base={base} joinHref={undefined} />
      <main className="grid gap-5" aria-busy>
        <SectionNav active={section} entryHref={`${base}/join`} />
        <div className="grid gap-2">
          <Sk className="h-[34px] w-56 md:h-[40px]" />
          <Sk className="h-4 w-72 max-w-full" />
        </div>
        <Sk className="h-[520px] rounded-[var(--radius-tile)]" />
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
