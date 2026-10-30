"use client";

/**
 * The slim competition banner on the landing page and the app's Home (the landing's fuller section is
 * components/landing/competition.tsx, on the same data). Before the start it gives the date and the
 * prize, during the competition the entrant count; after the end, or with no competition stored, it renders nothing.
 * It reads GET /api/competition in the browser so the landing stays static. `?preview=` works here too in development.
 * Join goes to app.koul.me/join through the app base; the competition pages live on koul.me and on every other host.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CompetitionInfo } from "@koul/core";
import { useAppHref } from "@/lib/app-base";
import { TELEGRAM_URL } from "@/lib/community";
import { dayOf, entriesFull, hourOf, phaseOf, previewInfo, previewOf } from "@/lib/competition-view";
import { cn } from "@/lib/utils";

export type Loaded = { info: CompetitionInfo; now: number; preview: string | null };

/** The stored competition, read once in the browser; null until it answers (or when it fails). */
export function useCompetition(): Loaded | null {
  const [state, setState] = React.useState<Loaded | null>(null);
  React.useEffect(() => {
    let live = true;
    const preview = previewOf(new URLSearchParams(window.location.search).get("preview") ?? undefined);
    if (preview) {
      const now = Date.now();
      queueMicrotask(() => { if (live) setState({ info: previewInfo(preview, now), now, preview }); });
      return () => { live = false; };
    }
    fetch("/api/competition")
      .then((r) => (r.ok ? r.json() : null))
      .then((info: CompetitionInfo | null) => { if (live && info) setState({ info, now: Date.now(), preview: null }); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return state;
}

const link = "inline-flex min-h-11 items-center gap-1.5 font-bold underline-offset-4 hover:underline";

/** `strip`: full width across the top of the landing. `tile`: a rounded band inside the app's grid. */
export function CompetitionBanner({ variant, className }: { variant: "strip" | "tile"; className?: string }) {
  const appHref = useAppHref();
  const loaded = useCompetition();
  if (!loaded) return null;
  const { info, now, preview } = loaded;
  const c = info.config;
  const phase = phaseOf(c, now);
  if (!c || (phase !== "upcoming" && phase !== "live")) return null;

  const q = preview ? `?preview=${preview}` : "";
  const full = entriesFull(info);
  const n = info.entrants;
  // "Trading" and the hour drop below 640 px so the banner stays two rows on a phone.
  const lead = <><span className="hidden sm:inline">Trading competition</span><span className="sm:hidden">Competition</span></>;
  const line = phase === "upcoming" ? (
    <>
      {lead} starts {c.startsAt ? <>{dayOf(c.startsAt)}<span className="hidden sm:inline">, {hourOf(c.startsAt)}</span></> : "soon"}
      {c.prize ? `: ${c.prize}` : ""}.
    </>
  ) : (
    <>{lead} is live: {n} {n === 1 ? "entrant" : "entrants"}.</>
  );

  const body = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-0 text-[14px] sm:text-[15px]">
      <Link href={`/compete${q}`} className="min-w-0 py-2 font-semibold">{line}</Link>
      <div className="flex flex-wrap items-center gap-x-4">
        {phase === "live" && <Link href={`/compete/leaderboard${q}`} className={link}>See the board</Link>}
        {full ? (
          <span className="opacity-70">Entries are full</span>
        ) : (
          <a href={appHref(`/join${q}`)} className={link}>Join<ArrowRight className="size-4" aria-hidden /></a>
        )}
        {TELEGRAM_URL && <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className={link}>Telegram</a>}
      </div>
    </div>
  );

  if (variant === "strip") {
    return (
      <aside aria-label="Trading competition" className={cn("bg-lime px-4 text-on-lime md:px-8", className)}>
        <div className="mx-auto w-full max-w-[1280px]">{body}</div>
      </aside>
    );
  }
  return (
    <aside aria-label="Trading competition" className={cn("rounded-[var(--radius-tile)] bg-lime px-5 py-1 text-on-lime", className)}>
      {body}
    </aside>
  );
}
