import Link from "next/link";
import { KoulMark } from "@/components/brand/koul-mark";
import { PillButton } from "@/components/signal";
import { TELEGRAM_URL } from "@/lib/community";
import { cn } from "@/lib/utils";

const link = "label inline-flex min-h-11 items-center rounded-full px-3 transition-colors hover:text-text";

/** The competition pages' header: the wordmark home, the two pages, and Join while entries are open. */
export function CompeteHeader({ active, joinable }: { active: "compete" | "leaderboard" | null; joinable: boolean }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <a href="https://koul.me" className="inline-flex items-center gap-2 text-[24px] font-extrabold tracking-tight"><KoulMark className="size-7" />KOUL</a>
      <nav className="flex items-center gap-1" aria-label="Competition">
        <Link href="/compete" className={cn(link, active === "compete" ? "text-text" : "text-muted", "hidden sm:inline-flex")}>Competition</Link>
        <Link href="/compete/leaderboard" className={cn(link, active === "leaderboard" ? "text-text" : "text-muted")}>Leaderboard</Link>
        {joinable && <PillButton href="/app/join" size="md" className="ml-2">Join</PillButton>}
      </nav>
    </header>
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
