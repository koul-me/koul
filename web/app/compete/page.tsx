import type { Metadata } from "next";
import { SECTION_TITLE } from "@/components/compete/type";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AutoRefresh } from "@/components/status/auto-refresh";
import { ThemeColor } from "@/components/shell/theme-color";
import { Label, PillButton, Tile, TileLabel } from "@/components/signal";
import { BoardTable } from "@/components/compete/board-table";
import { CompeteFooter, CompetePage } from "@/components/compete/header";
import { Countdown } from "@/components/compete/countdown";
import { TELEGRAM_URL } from "@/lib/community";
import { loadCompetition } from "@/lib/competition-load";
import { agoOf, dayOf, entriesFull, lengthOf, phaseOf, previewOf, timeOf, windowOf } from "@/lib/competition-view";

export const metadata: Metadata = {
  title: "Trading competition",
  description: "Write the rules, start your autopilot, and see whose trades best. Free, on Stellar testnet.",
};
export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Make a Koul wallet", line: "A passkey, no seed phrase. It comes with 100 test USDC and free test XLM." },
  { title: "Write your rules", line: "Swap between USDC, ETH, SOL, XRP and wBTC, or lend on XOXNO. Then start your autopilot." },
  { title: "Enter", line: "Pick a handle and confirm with your passkey. From there your autopilot does the trading." },
];
/** Shown after Enter only when the group link is set. */
const TELEGRAM_STEP = { title: "Join the Telegram group", line: "Winners are contacted there, so join before the end." };

const RULES = [
  "Only trades your autopilot makes count. A manual swap, supply or withdraw takes the entry off the board.",
  "Everyone starts with the same basket: 100 test USDC plus the free test XLM a new wallet gets, about 10,000. Both count.",
  "Your score is the return on that basket: everything the wallet holds, at Reflector oracle prices.",
  "Money or XLM added from outside takes the entry off the board. Use a new wallet and do not top it up.",
  "Testnet pools often pay far more than the oracle price. Whatever a swap pays above the oracle price counts as capital, not profit, so it never raises your return.",
  "USD/TRY is off during the competition, since that feed is a test price we set. A rule on USD/TRY takes the entry off the board, so delete any you have.",
  "Each wallet can make about 10 swaps every 3 hours.",
  "Scores update about every 15 minutes. The final board is the one at the end time, after the top entries are checked.",
  "Prizes are paid in USDC on Stellar mainnet: $150 for first, $100 for second, $50 for third.",
  "Winners are contacted in the Koul Telegram group, so you must join it to be paid.",
  "One entry per person, wallet and email. You must be 18 or older.",
];


export default async function CompeteOverview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const preview = previewOf((await searchParams).preview);
  const { info, board, now } = await loadCompetition(preview, 10);
  const c = info.config;
  const phase = phaseOf(c, now);
  const full = entriesFull(info);
  const joinable = (phase === "upcoming" || phase === "live") && !full;
  const steps = TELEGRAM_URL ? [...STEPS, TELEGRAM_STEP] : STEPS;
  const boardHref = `/compete/leaderboard${preview ? `?preview=${preview}` : ""}`;
  return (
    <>
      <ThemeColor />
      <AutoRefresh everyMs={60_000} />
      <CompetePage section="overview" joinable={joinable}>

        <Tile tone="lime" className="grid gap-8 p-6 md:p-10">
          <div className="grid gap-4">
            <Label tone="onLime">Trading competition</Label>
            <h1 className="max-w-[14ch] text-[40px] font-extrabold leading-[0.95] tracking-[-0.04em] md:text-[64px]">Your autopilot vs. everyone&apos;s.</h1>
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
                {full && phase !== "ended" && <span className="text-[20px] font-extrabold tracking-tight">Entries are full</span>}
                <span className="label">
                  {phase === "upcoming" && c.startsAt && <>Starts in <Countdown to={Date.parse(c.startsAt)} serverNow={now} /></>}
                  {phase === "live" && (c.endsAt ? <>Live · ends in <Countdown to={Date.parse(c.endsAt)} serverNow={now} /></> : "Live")}
                  {phase === "ended" && `Finished${c.endsAt ? ` on ${dayOf(c.endsAt)}` : ""}`}
                </span>
              </div>
              <p className="max-w-[60ch] text-[15px]">
                Free to enter, 18 and over. <Link href="/compete/terms" className="font-semibold underline underline-offset-4">Read the terms</Link>
                {TELEGRAM_URL && <> · Winners are contacted in the <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">Koul Telegram group</a></>}
              </p>
            </>
          ) : (
            <p className="max-w-[46ch] text-[17px]">The next competition is being set up. Follow Koul on X for the date.</p>
          )}
        </Tile>

        <section className={steps.length > 3 ? "grid gap-4 md:grid-cols-2 lg:grid-cols-4" : "grid gap-4 md:grid-cols-3"} aria-label="How to join">
          {steps.map((s, i) => (
            <Tile key={s.title} className="grid content-start gap-3">
              <span className="mono text-muted">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="text-[20px] font-extrabold tracking-tight">{s.title}</h2>
              <p className="text-[16px] text-muted">{s.line}</p>
              {s === TELEGRAM_STEP && TELEGRAM_URL && <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="label inline-flex min-h-11 items-center gap-2 text-accent-text">Open Telegram<ArrowUpRight className="size-4" aria-hidden /></a>}
            </Tile>
          ))}
        </section>

        <Tile tone="outlined" id="testnet-prices" className="grid gap-4">
          <Label tone="lime">Read this before you trade</Label>
          <h2 className={SECTION_TITLE}>Testnet swap prices are not real prices.</h2>
          <div className="grid max-w-[70ch] gap-3 text-[16px]">
            <p>
              Swaps run through Soroswap and Aquarius pools on Stellar testnet. Nobody keeps those pools in line with the
              market, so they often pay several times the real price, and sometimes far more. Selling XLM, for example,
              can bring back about five times what it is worth at the oracle price.
            </p>
            <p className="font-semibold">
              Your score ignores that gap. Every holding is valued at Reflector oracle prices, and whatever a swap pays
              above the oracle price counts as capital you started with, not profit.
            </p>
            <p className="text-muted">
              So a generous swap can raise a wallet&apos;s value without raising its return: a wallet worth $8,000 can still
              show 0%. Returns come from prices moving after your autopilot trades, not from the pool it trades with.
            </p>
          </div>
        </Tile>

        {c && (
          <Tile className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className={SECTION_TITLE}>Leaderboard</h2>
              {board.total > 0 && <Label>Scored {agoOf(board.updatedAt, now)}</Label>}
            </div>
            {board.rows.length > 0 ? (
              <>
                <BoardTable rows={board.rows} preview={preview} />
                <a href={boardHref} className="label mt-3 inline-flex min-h-11 items-center gap-2 text-accent-text">Full leaderboard<ArrowRight className="size-4" aria-hidden /></a>
              </>
            ) : (
              <p className="py-6 text-[16px] text-muted">{phase === "upcoming" ? `The board fills when the competition starts. ${info.entrants} entered so far.` : "Scores show here a few minutes after the first entries come in."}</p>
            )}
          </Tile>
        )}

        <Tile id="rules" className="grid gap-5">
          <h2 className={SECTION_TITLE}>Rules</h2>
          <ol className="grid gap-4">
            {RULES.map((r, i) => (
              <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-2 text-[16px]">
                <span className="mono pt-0.5 text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
          <Link href="/compete/terms" className="label inline-flex min-h-11 items-center gap-2 text-accent-text">Full terms and participant agreement<ArrowRight className="size-4" aria-hidden /></Link>
          {preview && <TileLabel>Preview data: nothing on this page is real.</TileLabel>}
        </Tile>

        <CompeteFooter />
      </CompetePage>
    </>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid content-start gap-1">
      <span className="label opacity-70">{label}</span>
      <span className="text-[19px] font-extrabold leading-tight tracking-tight md:text-[22px]">{value}</span>
      {note && <span className="mono opacity-70">{note}</span>}
    </div>
  );
}
