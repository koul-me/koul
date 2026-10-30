"use client";

/**
 * Join the trading competition: the connected wallet, a handle, an email, and one passkey prompt that proves the
 * wallet is yours (lib/competition-client), after the "18 or older and accept the terms" box. That signature confirms
 * the entry, so "You're in" shows right away, with the entrant page and the last step: the Telegram group, where
 * winners are contacted. Without a wallet the app frame shows Welcome first and comes back here.
 */
import * as React from "react";
import { ArrowRight, ArrowUpRight, CircleCheck } from "lucide-react";
import { HANDLE_PATTERN, RESERVED_HANDLES, type CompetitionInfo } from "@koul/core";
import { Label, PillButton, Tile, TileLabel } from "@/components/signal";
import { useWallet } from "@/hooks/use-wallet";
import { useAppHref } from "@/lib/app-base";
import { TELEGRAM_URL } from "@/lib/community";
import { enterCompetition } from "@/lib/competition-client";
import { dayOf, entriesFull, phaseOf, previewInfo, previewOf, timeOf } from "@/lib/competition-view";
import { cn } from "@/lib/utils";

const field = "h-14 w-full rounded-full bg-surface-2 px-5 text-[17px] text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

type State = { kind: "idle" } | { kind: "signing" } | { kind: "entered"; handle: string } | { kind: "error"; message: string };

export default function JoinPage() {
  const w = useWallet();
  const appHref = useAppHref();
  const [info, setInfo] = React.useState<CompetitionInfo | null | undefined>(undefined);
  const [now, setNow] = React.useState<number | null>(null);
  const [handle, setHandle] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [state, setState] = React.useState<State>({ kind: "idle" });

  React.useEffect(() => {
    let live = true;
    const preview = previewOf(new URLSearchParams(window.location.search).get("preview") ?? undefined);
    if (preview) {
      const t = Date.now();
      queueMicrotask(() => { if (live) { setInfo(previewInfo(preview, t)); setNow(t); } });
      return () => { live = false; };
    }
    fetch("/api/competition")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: CompetitionInfo | null) => { if (live) { setInfo(j); setNow(Date.now()); } })
      .catch(() => { if (live) setInfo(null); });
    return () => { live = false; };
  }, []);

  const handleProblem = handle && !HANDLE_PATTERN.test(handle) ? "3 to 20 letters, digits or underscores" : RESERVED_HANDLES.has(handle.toLowerCase()) ? "That handle is taken" : null;
  const ready = HANDLE_PATTERN.test(handle) && !handleProblem && /\S+@\S+\.\S+/.test(email) && agreed && !!w.address;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !w.address) return;
    setState({ kind: "signing" });
    try {
      const r = await enterCompetition({ wallet: w.address, handle, email, acceptedTerms: true });
      setState({ kind: "entered", handle: r.handle });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Try again in a minute.";
      setState({ kind: "error", message: /NotAllowed|abort|cancel/i.test(message) ? "The passkey prompt was closed. Try again when you are ready." : message });
    }
  };

  if (info === undefined || now === null) return <Tile className="h-[420px] animate-pulse" aria-busy />;

  const c = info?.config ?? null;
  const phase = phaseOf(c, now);
  if (!c || phase === "none" || phase === "ended") {
    return (
      <Tile className="grid max-w-[640px] gap-4">
        <h1 className="t-title">{phase === "ended" ? "This competition has finished" : "No competition is open right now"}</h1>
        <p className="text-[16px] text-muted">{phase === "ended" ? "See how it ended on the leaderboard." : "The next one is announced on the competition page."}</p>
        <PillButton href={phase === "ended" ? "/compete/leaderboard" : "/compete"} variant="outline" className="justify-self-start">{phase === "ended" ? "Leaderboard" : "Competition page"}</PillButton>
      </Tile>
    );
  }

  if (state.kind === "entered") {
    return (
      <div className="grid max-w-[640px] gap-4">
        <Tile tone="lime" className="grid gap-5">
          <CircleCheck className="size-9" aria-hidden />
          <h1 className="t-title">You&apos;re in</h1>
          <p className="text-[17px]">You are entered as <b className="break-all">{state.handle}</b>. {phase === "upcoming" ? "Your score shows on your page once the competition starts." : "Your score shows on your page within a few minutes."}</p>
          <p className="text-[17px]">Only trades your autopilot makes count, so make sure it is running.</p>
          <div className="flex flex-wrap gap-3">
            <PillButton href={appHref("/autopilot")} variant="onLime" size="lg">Go to Autopilot<ArrowRight className="size-5" aria-hidden /></PillButton>
            <PillButton href={`/compete/${state.handle}`} variant="onLimeOutline" size="lg">Your page<ArrowRight className="size-5" aria-hidden /></PillButton>
          </div>
        </Tile>
        {TELEGRAM_URL && (
          <Tile className="grid gap-3">
            <TileLabel>Next step</TileLabel>
            <p className="text-[20px] font-bold leading-snug">Join the Koul Telegram group: winners are contacted there.</p>
            <PillButton href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" variant="outline" size="lg" className="justify-self-start">Open Telegram<ArrowUpRight className="size-5" aria-hidden /></PillButton>
          </Tile>
        )}
      </div>
    );
  }

  if (entriesFull(info)) {
    return (
      <Tile className="grid max-w-[640px] gap-4">
        <h1 className="t-title">Entries are full</h1>
        <p className="text-[16px] text-muted">Every place in this competition is taken. You can still follow it on the leaderboard.</p>
        <PillButton href="/compete/leaderboard" variant="outline" className="justify-self-start">Leaderboard</PillButton>
      </Tile>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-5">
      <Tile className="grid content-start gap-6">
        <div className="grid gap-3">
          <Label tone="lime">{c.name}</Label>
          <h1 className="t-title">Enter the competition</h1>
          {c.startsAt && <p className="text-[16px] text-muted">{phase === "upcoming" ? "Starts" : "Started"} {dayOf(c.startsAt)}, {timeOf(c.startsAt)}.</p>}
        </div>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <label className="grid gap-2">
            <span className="t-tile-label text-muted">Handle on the leaderboard</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value.trim())} required maxLength={20} autoComplete="nickname" autoCapitalize="none" spellCheck={false} placeholder="ada_trades" aria-invalid={handleProblem ? true : undefined} className={field} />
            {handleProblem && <span className="text-[14px] text-danger">{handleProblem}</span>}
          </label>
          <label className="grid gap-2">
            <span className="t-tile-label text-muted">Email, so we can reach you about results</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="you@example.com" className={field} />
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[15px]">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--lime)]" />
            <span>I am 18 or older and accept the <a href="/compete/terms" target="_blank" className="text-accent-text underline-offset-4 hover:underline">competition terms</a>.</span>
          </label>
          {state.kind === "error" && <p role="alert" className="text-[15px] text-danger">{state.message}</p>}
          <PillButton type="submit" size="lg" disabled={!ready || state.kind === "signing"} className="justify-self-start">
            {state.kind === "signing" ? "Confirm with your passkey…" : "Enter with my passkey"}
          </PillButton>
        </form>
      </Tile>
      <Tile className="grid content-start gap-4">
        <TileLabel>Before you enter</TileLabel>
        <Point title="Use a new wallet">Everyone starts with {c.startingCapitalUsd} test USDC plus the free test XLM. Adding money or XLM takes the entry off the board.</Point>
        <Point title="Let the autopilot trade">Write your rules on the Autopilot page and start it. A swap or supply you make yourself takes the entry off the board.</Point>
        <Point title="One passkey prompt">It proves this wallet is yours and confirms your entry. Nothing is signed on chain and nothing moves.</Point>
        {TELEGRAM_URL && (
          <Point title="Join the Telegram group">
            Winners are contacted there. <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="text-accent-text underline-offset-4 hover:underline">Open the Koul group</a>
          </Point>
        )}
        <p className={cn("mono break-all text-muted")}>Entering as {w.short ?? "…"}</p>
      </Tile>
    </div>
  );
}

function Point({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-[17px] font-bold">{title}</span>
      <span className="text-[15px] text-muted">{children}</span>
    </div>
  );
}
