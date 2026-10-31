/**
 * The official rules and participant agreement for the Koul Trading Competition. Not reviewed by a lawyer. The
 * organizer is the Koul team, not a company or a named person (decided 2026-10-30); questions go to the Telegram group.
 * EXCLUDED_REGIONS defaults to the comprehensively sanctioned jurisdictions.
 *
 * The window and the starting capital come from the stored competition config; the prize split is fixed here because
 * the config only holds the display string.
 */
import { PAGE_TITLE } from "@/components/compete/type";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeColor } from "@/components/shell/theme-color";
import { Label, Tile } from "@/components/signal";
import { CompeteFooter, CompetePage } from "@/components/compete/header";
import { TELEGRAM_URL } from "@/lib/community";
import { loadCompetition } from "@/lib/competition-load";
import { entriesFull, longDateOf, maxEntrantsOf, phaseOf, previewOf } from "@/lib/competition-view";

export const metadata: Metadata = {
  title: "Competition terms",
  description: "Official rules and participant agreement for the Koul Trading Competition.",
};
export const dynamic = "force-dynamic";

/** REVIEW: defaults to the comprehensively sanctioned jurisdictions; check against the organizer's own obligations. */
const EXCLUDED_REGIONS = ["Cuba", "Iran", "North Korea", "Syria", "the Crimea, Donetsk and Luhansk regions of Ukraine"];

const PRIZES = [
  { place: "First place", amount: "$150" },
  { place: "Second place", amount: "$100" },
  { place: "Third place", amount: "$50" },
];

export default async function TermsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const preview = previewOf((await searchParams).preview);
  const { info, now } = await loadCompetition(preview, 0);
  const c = info.config;
  const phase = phaseOf(c, now);
  const capital = c?.startingCapitalUsd ?? 100;
  const max = maxEntrantsOf(c);
  const joinable = (phase === "upcoming" || phase === "live") && !entriesFull(info);
  const start = c?.startsAt ? longDateOf(c.startsAt) : null;
  const end = c?.endsAt ? longDateOf(c.endsAt) : null;

  return (
    <>
      <ThemeColor />
      <CompetePage section="overview" joinable={joinable}>
        <div className="grid gap-3">
          <Label tone="lime">Koul Trading Competition</Label>
          <h1 className={PAGE_TITLE}>Official rules and participant agreement</h1>
          <p className="max-w-[60ch] text-[17px] text-muted">
            Please read these terms before you enter. The short version is on the <Link href="/compete#rules" className="text-accent-text underline-offset-4 hover:underline">competition page</Link>. If the two ever differ, these terms apply.
          </p>
        </div>

        <Tile className="grid gap-10 md:p-10">
          <Section n={1} title="Organizer">
            <P>The Koul Trading Competition (the &ldquo;Competition&rdquo;) is run by the Koul team (koul.me) (the &ldquo;Organizer&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).</P>
          </Section>

          <Section n={2} title="Agreement">
            <P>By entering, you agree to these terms and to the Organizer&apos;s decisions, which are final on every matter about the Competition. If you do not agree, do not enter.</P>
          </Section>

          <Section n={3} title="Free to enter">
            <P>No purchase or payment of any kind is necessary to enter or to win. Buying anything does not improve your chances.</P>
          </Section>

          <Section n={4} title="Testnet only">
            <P>The Competition runs on the Stellar test network (&ldquo;testnet&rdquo;). Every token used in it, including test USDC and test XLM, is a test token with no monetary value. Test tokens cannot be sold, redeemed or exchanged for money, and they are not part of any prize. Never send real funds to a Koul testnet wallet.</P>
          </Section>

          <Section n={5} title="Who can enter">
            <List items={[
              "You must be 18 or older, or the age of majority where you live if that is higher.",
              "One entry per person. Each entry needs its own Koul wallet and its own email address. One person may not enter more than once, with any wallet, email or handle.",
              "Employees, contractors and members of the Organizer's team, and people living in their household, cannot enter.",
              "The Competition is void where prohibited or restricted by law. You are responsible for checking that taking part is legal where you live.",
              `You cannot enter if you live in, are a resident of, or are located in ${listOf(EXCLUDED_REGIONS)}, or if you are on a sanctions list of the United Nations, the United States, the European Union or the United Kingdom.`,
            ]} />
            {max !== null && <P>Entries are limited to the first {max} entrants. Once that number is reached, entries close.</P>}
          </Section>

          <Section n={6} title="When it runs">
            {start && end ? (
              <P>The Competition starts on {start} and ends on {end} (the &ldquo;End Time&rdquo;). Only trades made between those times count.</P>
            ) : (
              <P>The start and end times are shown on the <Link href="/compete" className="text-accent-text underline-offset-4 hover:underline">competition page</Link>. The end time is the &ldquo;End Time&rdquo; in these terms. Only trades made between those times count.</P>
            )}
            <P>You may enter before the start or while the Competition is running, as long as entries are open.</P>
          </Section>

          <Section n={7} title="How to enter">
            <List items={[
              "Make a Koul wallet at app.koul.me. It is protected by a passkey and comes with test USDC and test XLM.",
              "Go to app.koul.me/join, choose a public handle, give your email, accept these terms and sign with your passkey. The signature proves the wallet is yours and confirms your entry. Nothing is signed on chain.",
              "We use your email to contact you about the Competition and its results. No reply or click is needed for your entry to count.",
              "Join the Koul Telegram group. Winners are contacted there (section 14).",
            ]} />
          </Section>

          <Section n={8} title="How scoring works">
            <List items={[
              `Everyone starts with the same basket: ${capital} test USDC plus the free test XLM a new Koul wallet gets (about 10,000 XLM). Both count.`,
              "Your score is the return on that starting basket: the change in what the wallet is worth, as a percentage.",
              "What the wallet is worth is everything it holds, in US dollars at Reflector oracle prices: USDC, XLM, every other token, and USDC supplied on XOXNO minus anything borrowed. Testnet exchange prices are never used, because anyone can move them.",
              "Only trades your autopilot makes count. Write your rules in Koul and start the autopilot; it trades for you.",
              "If a swap pays more than the token is worth at the Reflector price, the extra is treated as added capital, not profit. Only price moves over time score.",
              "Scores update about every 15 minutes during the Competition. Two entries with the same return, rounded to four decimal places of a percent, share a rank.",
            ]} />
          </Section>

          <Section n={9} title="What takes an entry off the board">
            <P>These do not disqualify you from future competitions, but the entry is shown as &ldquo;Not ranked&rdquo; and cannot win:</P>
            <List items={[
              "A swap the autopilot did not make. Moving your own USDC in or out of lending by hand (supply, withdraw, borrow, repay) is allowed; money sent in from outside counts as added capital.",
              "Money or tokens added from outside the wallet's starting basket, including more test USDC or more test XLM from any source.",
              "A rule on USD/TRY. That price is a test feed the Koul team sets, so any autopilot rule that reads it takes the entry off the board.",
            ]} />
            <P>Use a new wallet for the Competition and do not top it up.</P>
          </Section>

          <Section n={10} title="Disqualification">
            <P>We may disqualify any entry, remove it from the board and withhold any prize, at any time and without notice, if we reasonably believe the entrant:</P>
            <List items={[
              "entered more than once, or used several wallets, emails or handles for one person;",
              "exploited a bug, error or weakness in Koul, the Stellar testnet, a testnet pool, an oracle or any other service;",
              "manipulated or tried to manipulate testnet pool prices, liquidity or oracle feeds, alone or with others;",
              "used bots, scripts or automation outside Koul's autopilot, or interfered with the Competition or other entrants;",
              "gave false information, broke these terms, or acted in a way that is unfair, abusive or unlawful.",
            ]} />
          </Section>

          <Section n={11} title="Prizes">
            <P>The total prize pool is $300, paid in USDC on the Stellar main network:</P>
            <ul className="grid gap-2 sm:grid-cols-3">
              {PRIZES.map((p) => (
                <li key={p.place} className="grid gap-1 rounded-[var(--radius-tile)] bg-surface-2 p-4">
                  <span className="label text-muted">{p.place}</span>
                  <span className="text-[24px] font-extrabold tracking-tight">{p.amount} USDC</span>
                </li>
              ))}
            </ul>
            <P>Prizes cannot be transferred or exchanged for anything else. No other prize is offered. If fewer than three eligible entries are ranked, the unclaimed prizes are not awarded.</P>
          </Section>

          <Section n={12} title="Ties">
            <P>Entries that share a rank share the prizes of the places they cover. The prizes of the tied places are added together and split equally. For example, if two entries tie for second place, each receives ($100 + $50) / 2 = $75.</P>
          </Section>

          <Section n={13} title="Final results and review">
            <P>The final board is the board at the End Time, after our review. Within 7 days after the End Time we check the top entries, their trades and their eligibility. Entries may be removed or re-ranked as a result, and the next eligible entries move up. We announce the winners once the review is done.</P>
          </Section>

          <Section n={14} title="Contacting winners">
            <P>
              Winners are contacted through the Koul Telegram group
              {TELEGRAM_URL ? <> (<a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="text-accent-text underline-offset-4 hover:underline">join it here</a>)</> : null}
              , and may also be emailed at the address they entered with. To receive a prize you must be a member of the group.
            </P>
            <P>A winner must reply within 7 days of our first message and give a Stellar main network address that can receive USDC. We may ask for proof of identity, age and place of residence. If a winner does not reply in time, cannot be verified or is not eligible, the prize passes to the next eligible entry on the final board.</P>
          </Section>

          <Section n={15} title="Payout">
            <P>Prizes are paid in USDC on the Stellar main network, to the address the winner gives, within 14 days of the winner&apos;s verification. You are responsible for giving a correct address that can receive USDC. A payment sent to the address you gave counts as delivered.</P>
          </Section>

          <Section n={16} title="Taxes">
            <P>Winners are responsible for any taxes, duties or reporting that apply to their prize where they live.</P>
          </Section>

          <Section n={17} title="Changes and cancellation">
            <P>We may change, pause, extend, shorten or cancel the Competition, or change these terms, if something outside the normal course of the Competition requires it: for example a testnet reset, an outage of Stellar, Koul, an oracle or a pool, a bug, fraud, or a change in the law. Changes are posted on this page and on the competition page. If the Competition is cancelled, we may award the prizes based on the board at the time of cancellation, after review, or not award them.</P>
          </Section>

          <Section n={18} title="Privacy">
            <List items={[
              "Your handle, your wallet address, your score and your wallet's trades are public on the leaderboard. Wallet activity is public on the Stellar testnet anyway.",
              "Your email is never shown. We use it only to run the Competition (contacting you about your entry and its results, contacting winners). We do not send marketing email, and we do not share your email with anyone.",
              "We keep entry data for as long as the Competition and its payouts need it, and as the law requires.",
            ]} />
          </Section>

          <Section n={19} title="No warranty and limitation of liability">
            <P>Koul and the Competition are provided as they are, without any warranty. Testnet services can be slow, fail or reset, and autopilot trades can fail or execute at prices you did not expect. To the fullest extent the law allows, the Organizer is not liable for any loss or damage of any kind arising from the Competition, including lost entries, failed or delayed trades, scoring errors, outages, or the use of a prize. Nothing in these terms limits liability that cannot be limited by law.</P>
          </Section>

          <Section n={20} title="Governing law">
            <P>These terms are governed by the laws of the Republic of T&uuml;rkiye, unless the law where you live gives you rights that cannot be set aside.</P>
          </Section>

          <Section n={21} title="Contact">
            <P>Questions about the Competition or these terms: ask in the {TELEGRAM_URL ? <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="text-accent-text underline-offset-4 hover:underline">Koul Telegram group</a> : "Koul Telegram group"}.</P>
          </Section>
        </Tile>

        <CompeteFooter />
      </CompetePage>
    </>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 md:grid-cols-[3rem_minmax(0,1fr)] md:gap-x-4" aria-labelledby={`terms-${n}`}>
      <span className="mono pt-1 text-muted">{String(n).padStart(2, "0")}</span>
      <div className="grid min-w-0 gap-3">
        <h2 id={`terms-${n}`} className="text-[24px] font-extrabold tracking-tight">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[72ch] text-[16px] leading-relaxed">{children}</p>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="grid max-w-[72ch] gap-2 text-[16px] leading-relaxed">
      {items.map((t) => (
        <li key={t} className="grid grid-cols-[1.25rem_1fr]">
          <span className="text-muted" aria-hidden>–</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** "a, b or c". */
function listOf(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}
