import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { AutoRefresh } from "@/components/status/auto-refresh";
import { ThemeColor } from "@/components/shell/theme-color";
import { Label, PillButton, Tile, TileLabel } from "@/components/signal";
import { BoardTable } from "@/components/compete/board-table";
import { CompeteFooter, CompeteHeader } from "@/components/compete/header";
import { Countdown } from "@/components/compete/countdown";
import { loadCompetition } from "@/lib/competition-load";
import { agoOf, dayOf, lengthOf, phaseOf, previewOf, timeOf, windowOf } from "@/lib/competition-view";

export const metadata: Metadata = {
  title: "Trading competition",
  description: "Write the rules, start your autopilot, and see whose trades best. Free, on Stellar testnet.",
};
export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Make a Koul wallet", line: "A passkey, no seed phrase. It comes with 100 test USDC." },
  { title: "Write your rules", line: "Swap between USDC, ETH, SOL, XRP and wBTC, or lend on XOXNO. Then start your autopilot." },
  { title: "Enter", line: "Pick a handle and confirm your email. From there your autopilot does the trading." },
];

const RULES = [
  "Only trades your autopilot makes count. A manual swap, supply or withdraw takes the entry off the board.",
  "Everyone starts with 100 test USDC. Money added from outside also takes the entry off the board, so use a new wallet.",
  "Your score is the return on that 100: everything the wallet holds, at Reflector oracle prices. The test XLM for fees is not counted.",
  "USD/TRY conditions are off during the competition, since that feed is a test feed we run.",
  "Each wallet can make about 10 swaps every 3 hours.",
  "Scores update every few minutes. The final board is the one at the end time, and the top entries are checked before prizes are paid.",
  "One entry per person, wallet and email.",
];

export default async function CompetePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const preview = previewOf((await searchParams).preview);
  const { info, board, now } = await loadCompetition(preview, 10);
  const c = info.config;
  const phase = phaseOf(c, now);
  const joinable = phase === "upcoming" || phase === "live";
  const boardHref = `/compete/leaderboard${preview ? `?preview=${preview}` : ""}`;
  return (
    <>
      <ThemeColor />
      <AutoRefresh everyMs={60_000} />
      <main className="mx-auto grid w-full max-w-[1100px] gap-5 px-4 py-6 md:px-8 md:py-10">
        <CompeteHeader active="compete" joinable={joinable} />

        <Tile tone="lime" className="grid gap-8 p-6 md:p-10">
          <div className="grid gap-4">
            <Label tone="onLime">Trading competition</Label>
            <h1 className="t-headline max-w-[13ch]">Your autopilot vs. everyone&apos;s.</h1>
          </div>
          {c ? (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-[1.6fr_1fr_1fr_0.6fr]">
                <Fact label="When" value={windowOf(c) ?? "To be announced"} note={c.startsAt ? timeOf(c.startsAt) : undefined} />
                {c.prize ? <Fact label="Prize" value={c.prize} /> : <Fact label="Length" value={lengthOf(c) ?? "–"} />}
                <Fact label="Everyone starts with" value={`${c.startingCapitalUsd} USDC`} />
                <Fact label="Entered" value={String(info.entrants)} />
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                {joinable && <PillButton href="/app/join" variant="onLime" size="lg">Join the competition<ArrowRight className="size-5" aria-hidden /></PillButton>}
                <span className="label">
                  {phase === "upcoming" && c.startsAt && <>Starts in <Countdown to={Date.parse(c.startsAt)} serverNow={now} /></>}
                  {phase === "live" && (c.endsAt ? <>Live · ends in <Countdown to={Date.parse(c.endsAt)} serverNow={now} /></> : "Live")}
                  {phase === "ended" && `Finished${c.endsAt ? ` on ${dayOf(c.endsAt)}` : ""}`}
                </span>
              </div>
            </>
          ) : (
            <p className="max-w-[46ch] text-[17px]">The next competition is being set up. Follow Koul on X for the date.</p>
          )}
        </Tile>

        <section className="grid gap-4 md:grid-cols-3" aria-label="How to join">
          {STEPS.map((s, i) => (
            <Tile key={s.title} className="grid content-start gap-3">
              <span className="mono text-muted">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="text-[24px] font-extrabold tracking-tight">{s.title}</h2>
              <p className="text-[16px] text-muted">{s.line}</p>
            </Tile>
          ))}
        </section>

        {c && (
          <Tile className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="t-tab">Leaderboard</h2>
              {board.total > 0 && <Label>Scored {agoOf(board.updatedAt, now)}</Label>}
            </div>
            {board.rows.length > 0 ? (
              <>
                <BoardTable rows={board.rows} preview={preview} />
                <a href={boardHref} className="label mt-3 inline-flex min-h-11 items-center gap-2 text-accent-text">Full leaderboard<ArrowRight className="size-4" aria-hidden /></a>
              </>
            ) : (
              <p className="py-6 text-[16px] text-muted">{phase === "upcoming" ? `The board fills when the competition starts. ${info.entrants} entered so far.` : "Scores show here a few minutes after the first entries are confirmed."}</p>
            )}
          </Tile>
        )}

        <Tile id="rules" className="grid gap-5">
          <h2 className="t-tab">Rules</h2>
          <ol className="grid gap-4">
            {RULES.map((r, i) => (
              <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-2 text-[16px]">
                <span className="mono pt-0.5 text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
          {preview && <TileLabel>Preview data: nothing on this page is real.</TileLabel>}
        </Tile>

        <CompeteFooter />
      </main>
    </>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid content-start gap-1">
      <span className="label opacity-70">{label}</span>
      <span className="text-[22px] font-extrabold leading-tight tracking-tight md:text-[26px]">{value}</span>
      {note && <span className="mono opacity-70">{note}</span>}
    </div>
  );
}
