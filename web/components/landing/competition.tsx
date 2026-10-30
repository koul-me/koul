"use client";

/**
 * The competition on the landing, right under the hero: what it is, the prize, the dates, how many have entered, and
 * the ways in (join, the board, the rules, the Telegram group). Same data as the strip banner (useCompetition). It
 * renders nothing until a competition is stored, and after the end it points at the final board.
 */
import { ArrowRight } from "lucide-react";
import { Label, PillButton, Tile } from "@/components/signal";
import { useCompetition } from "@/components/compete/banner";
import { useAppHref } from "@/lib/app-base";
import { TELEGRAM_URL } from "@/lib/community";
import { dayOf, entriesFull, hourOf, maxEntrantsOf, phaseOf, windowOf } from "@/lib/competition-view";
import { Section } from "./shell";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <Label tone="onLime">{label}</Label>
      <span className="text-[20px] font-extrabold tracking-tight md:text-[24px]">{value}</span>
    </div>
  );
}

export function CompetitionSection() {
  const appHref = useAppHref();
  const loaded = useCompetition();
  if (!loaded?.info.config) return null;
  const { info, now, preview } = loaded;
  const c = info.config!;
  const phase = phaseOf(c, now);
  if (phase === "none") return null;

  const q = preview ? `?preview=${preview}` : "";
  const n = info.entrants;
  const max = maxEntrantsOf(c);
  const full = entriesFull(info);
  const title = phase === "upcoming"
    ? <>A one-week trading competition starts {c.startsAt ? dayOf(c.startsAt) : "soon"}.</>
    : phase === "live" ? "The trading competition is live." : "The trading competition has ended.";

  return (
    <Section id="competition" className="pt-0 md:pt-0">
      <Tile tone="lime" className="grid gap-8 p-6 md:p-10">
        <div className="grid max-w-[760px] gap-4">
          <Label tone="onLime">Trading competition</Label>
          <h2 className="t-title">{title}</h2>
          <p className="text-[17px] md:text-[19px]">
            {phase === "ended"
              ? "Thanks to everyone who entered. The final board is up, and winners are contacted in the Telegram group."
              : `Write your rules, start your autopilot, and let it trade a test wallet for a week. Everyone starts with the same wallet, and the best return wins. Free to enter, on Stellar testnet.${phase === "upcoming" && c.startsAt ? ` It starts at ${hourOf(c.startsAt)}.` : ""}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
          <Fact label="Prize" value={c.prize ? "$300 in USDC" : "To be announced"} />
          <Fact label="When" value={windowOf(c) ?? "One week"} />
          <Fact label="Entrants" value={max && phase !== "ended" ? `${n} of ${max}` : String(n)} />
        </div>
        {c.prize && <p className="-mt-3 text-[15px]">$150 for first, $100 for second, $50 for third, paid on Stellar mainnet.</p>}
        <div className="flex flex-wrap items-center gap-3">
          {phase !== "ended" && !full && (
            <PillButton href={appHref(`/join${q}`)} variant="onLime" size="lg">Join the competition<ArrowRight className="size-4" aria-hidden /></PillButton>
          )}
          {phase !== "ended" && full && <Label tone="onLime">Entries are full</Label>}
          {phase !== "upcoming" && <PillButton href={`/compete/leaderboard${q}`} variant="onLimeOutline" size="lg">{phase === "ended" ? "Final board" : "See the board"}</PillButton>}
          <PillButton href={`/compete${q}`} variant="onLimeOutline" size="lg">Rules</PillButton>
          {TELEGRAM_URL && (
            <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center px-2 text-[17px] font-bold underline-offset-4 hover:underline">Telegram group</a>
          )}
        </div>
      </Tile>
    </Section>
  );
}
