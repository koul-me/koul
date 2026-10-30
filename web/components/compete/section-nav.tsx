import Link from "next/link";
import { cn } from "@/lib/utils";

export type Section = "overview" | "leaderboard" | "entry" | null;

const pill = "label inline-flex h-10 items-center rounded-full px-4 transition-colors";

/**
 * The competition's own sections, the same row on koul.me and in the app: what it is, the board, and your entry.
 * `entryHref` is the app's /join on this host ("/join" on app.koul.me, "/app/join" elsewhere).
 */
export function SectionNav({ active, entryHref }: { active: Section; entryHref: string }) {
  const items: { key: Exclude<Section, null>; href: string; label: string }[] = [
    { key: "overview", href: "/compete", label: "Overview" },
    { key: "leaderboard", href: "/compete/leaderboard", label: "Leaderboard" },
    { key: "entry", href: entryHref, label: "My entry" },
  ];
  return (
    <nav aria-label="Competition" className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={active === i.key ? "page" : undefined} className={cn(pill, active === i.key ? "bg-text text-surface" : "bg-surface text-muted hover:text-text")}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
