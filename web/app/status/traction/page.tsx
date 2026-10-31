import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { TractionCounts, TractionGroup } from "@koul/core";
import { KoulMark } from "@/components/brand/koul-mark";
import { Label, Tile, TileLabel } from "@/components/signal";
import { AutoRefresh } from "@/components/status/auto-refresh";
import { ChartTile, Stat } from "@/components/status/status-view";
import { ThemeColor } from "@/components/shell/theme-color";
import { sameSecret, STATUS_COOKIE, statusCookieValue } from "@/lib/status-server";
import { readTraction } from "@/lib/traction-server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Traction (private)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TOP_WALLETS = 25;
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
const when = (t: number | null) => (t === null ? "-" : `${new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`);
const day = (t: number | null) => (t === null ? "-" : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }));
const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const TAG: Record<TractionGroup, string> = { organic: "", team: "team", loadtest: "load test" };

/** One headline: the organic number large, the team's (bots, tagged wallets, the load test) beside it. */
function Headline({ label, pick, o, t, note }: { label: string; pick: (c: TractionCounts) => string; o: TractionCounts; t: TractionCounts; note?: string }) {
  return <Stat label={label} value={pick(o)} note={`Team ${pick(t)}${note ? ` · ${note}` : ""}`} />;
}

/** Users, autopilots, trades and volume over time, organic apart from the team. For the team only, like /status/private. */
export default async function TractionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const expected = statusCookieValue();
  const got = (await cookies()).get(STATUS_COOKIE)?.value;
  if (!expected || !got || !sameSecret(got, expected)) notFound();
  const withTeam = (await searchParams).with === "team";
  const data = await readTraction();
  if (!data) return <main className="mx-auto max-w-[1100px] px-4 py-10"><h1 className="t-title">Traction is unavailable right now.</h1></main>;
  const { summary: s, collected, readAt: now } = data;
  const o = s.organic, t = s.team;
  const days = withTeam ? s.days.all : s.days.organic;
  const live = s.live.map((p) => ({ at: Date.parse(`${new Date(p.at).toISOString().slice(0, 10)}T00:00:00Z`), value: p.organic.autopilots + (withTeam ? p.team.autopilots : 0) }));
  const rows = s.wallets.filter((w) => withTeam || w.group === "organic").slice(0, TOP_WALLETS);
  const kinds = (c: TractionCounts) => Object.entries(c.kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(", ") || "none";
  const f = s.funnel;
  const pct = (n: number) => (f.created ? ` (${Math.round((n / f.created) * 100)}%)` : "");
  return (
    <>
      <ThemeColor />
      <AutoRefresh everyMs={600_000} />
      <main className="mx-auto grid w-full max-w-[1100px] gap-5 px-4 py-6 md:px-8 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <a href="https://koul.me" className="inline-flex items-center gap-2 text-[24px] font-extrabold tracking-tight"><KoulMark className="size-7" />KOUL</a>
          <Label><Link href="/status/private" className="underline">Status</Link> · Traction</Label>
        </header>
        <Tile className="grid gap-3 p-6 md:p-8">
          <h1 className="t-title">Traction</h1>
          <p className="text-[16px] text-muted">
            {collected ? `Collected ${ago(s.updatedAt, now)} (${when(s.updatedAt)}) at ledger ${s.toLedger}, hourly.` : "Nothing collected yet: the traction workflow writes the first numbers on its first run."}
            {" "}Large numbers are organic users; the team line counts the team&apos;s bots, wallets tagged as team and the {s.loadTest} load test wallets of 2026-10-28.
          </p>
          {/* The Segmented look, as links: the choice is a server read, so it lives in the URL. */}
          <nav className="inline-flex w-fit rounded-full bg-background p-1" aria-label="Charts and table">
            {([["Organic only", "/status/traction", !withTeam], ["With team", "/status/traction?with=team", withTeam]] as const).map(([label, href, on]) => (
              <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-[15px] font-bold", on ? "bg-text text-surface" : "text-muted hover:text-text")}>{label}</Link>
            ))}
          </nav>
        </Tile>
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3" aria-label="Headlines">
          <Headline label="Users with an autopilot" o={o} t={t} pick={(c) => String(c.users)} note={`${o.usersEver} organic ever saved one`} />
          <Headline label="Live autopilots" o={o} t={t} pick={(c) => String(c.autopilots)} />
          <Headline label="Rules" o={o} t={t} pick={(c) => String(c.rules)} />
          <Headline label="Trades last 24 h" o={o} t={t} pick={(c) => String(c.trades24h)} />
          <Headline label="Trades last 7 days" o={o} t={t} pick={(c) => String(c.trades7d)} />
          <Headline label="Trades total" o={o} t={t} pick={(c) => String(c.trades)} note="every rule the router ran" />
          <Headline label="Swap volume" o={o} t={t} pick={(c) => usd(c.volumeUsd)} note={`${o.swaps} swaps`} />
          <Headline label="Trades per autopilot" o={o} t={t} pick={(c) => (c.tradesPerAutopilot === null ? "-" : c.tradesPerAutopilot.toFixed(1))} />
          <Headline label="Wallets created" o={o} t={t} pick={(c) => String(c.created)} note={f.since === null ? "counting from the next new wallet" : `since ${day(f.since)}`} />
        </section>
        <Tile className="grid gap-3 p-5">
          <TileLabel>Funnel, organic</TileLabel>
          <div className="mono flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[16px]">
            <span>{f.created} created</span><span aria-hidden>→</span>
            <span>{f.withAutopilot} saved an autopilot{pct(f.withAutopilot)}</span><span aria-hidden>→</span>
            <span>{f.traded} traded{pct(f.traded)}</span>
          </div>
          <Label>
            Created counts wallets from the deploy that added it on{f.since === null ? " (none yet)" : `, ${day(f.since)}`}: a wallet is counted when its welcome test USDC arrives. Wallets made before then
            are only in the history once they save an autopilot ({o.usersEver} organic so far).
          </Label>
        </Tile>
        {days.length === 0 ? (
          <Tile tone="dashed" className="p-5"><span className="text-[16px]">No router events in the history yet.</span></Tile>
        ) : (
          <section className="grid items-start gap-4 md:grid-cols-2" aria-label="Over time">
            <ChartTile slot="day" title="New users" unit="user" units="users" points={days.map((d) => ({ at: d.at, value: d.newUsers }))} />
            <ChartTile slot="day" title="Users, cumulative" unit="user" units="users" points={days.map((d) => ({ at: d.at, value: d.cumulativeUsers }))} />
            <ChartTile slot="day" title="Trades" unit="trade" units="trades" points={days.map((d) => ({ at: d.at, value: d.trades }))} />
            <ChartTile slot="day" title="Swap volume" unit="USD" decimals={2} points={days.map((d) => ({ at: d.at, value: d.volumeUsd }))} />
            <ChartTile slot="day" title="Active wallets" unit="wallet" units="wallets" points={days.map((d) => ({ at: d.at, value: d.active }))} />
            {live.length > 0
              ? <ChartTile slot="day" title="Live autopilots" unit="autopilot" units="autopilots" points={live} />
              : <Tile className="grid gap-3 p-5"><TileLabel>Live autopilots</TileLabel><span className="text-[16px]">The first snapshot comes with the first run.</span></Tile>}
          </section>
        )}
        <Tile className="grid gap-2 p-5">
          <TileLabel>Runs by kind</TileLabel>
          <span className="mono">Organic: {kinds(o)}</span>
          <span className="mono text-muted">Team: {kinds(t)}</span>
        </Tile>
        <Tile className="grid gap-3 p-5">
          <TileLabel>Top wallets by trades{withTeam ? "" : ", organic"}</TileLabel>
          {rows.length === 0 ? <span className="text-[16px]">No wallets yet.</span> : (
            <div className="overflow-x-auto">
              <table className="mono w-full min-w-[720px] text-left">
                <thead>
                  <tr className="text-muted">
                    <th className="py-1 font-normal">Wallet</th><th className="py-1 font-normal">Tag</th><th className="py-1 font-normal">First seen</th><th className="py-1 font-normal">Last trade</th>
                    <th className="py-1 text-right font-normal">Trades</th><th className="py-1 text-right font-normal">Volume</th><th className="py-1 text-right font-normal">Rules</th><th className="py-1 pl-3 font-normal">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr key={w.address} className="border-t border-line">
                      <td className="py-1" title={w.address}>{w.address.slice(0, 4)}…{w.address.slice(-4)}</td>
                      <td className="py-1 text-muted">{TAG[w.group]}</td>
                      <td className="py-1">{w.firstSeen === null ? "before history" : when(w.firstSeen)}</td>
                      <td className="py-1">{when(w.lastTrade)}</td>
                      <td className="py-1 text-right">{w.trades}</td>
                      <td className="py-1 text-right">{usd(w.volumeUsd)}</td>
                      <td className="py-1 text-right">{w.rules}</td>
                      <td className="py-1 pl-3 text-muted">{w.tokens.join("/") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tile>
        <Label>
          History from {when(s.historyFrom)}; the RPC keeps seven days, so what is stored is the only record.
          {s.gaps.length > 0 && ` Missed: ${s.gaps.map((g) => `ledgers ${g.fromLedger}-${g.toLedger}`).join(", ")}.`}
          {s.unpriced > 0 && ` ${s.unpriced} swaps had no Reflector price and count $0.`}
          {" "}Volume is each swap&apos;s input at the Reflector price when it was collected, never the testnet pools&apos; output.
          Live autopilots before {day(s.live[0]?.at ?? null)} are not recorded, and each day keeps the team split of its time.
          Tag a wallet as team with <code>SADD koul:traction:team &lt;wallet&gt;</code>.
        </Label>
      </main>
    </>
  );
}
