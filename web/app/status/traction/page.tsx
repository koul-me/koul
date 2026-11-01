import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { TractionCounts } from "@koul/core";
import { KoulMark } from "@/components/brand/koul-mark";
import { Label, Tile, TileLabel } from "@/components/signal";
import { AutoRefresh } from "@/components/status/auto-refresh";
import { ChartTile, Stat } from "@/components/status/status-view";
import { ThemeColor } from "@/components/shell/theme-color";
import { sameSecret, STATUS_COOKIE, statusCookieValue } from "@/lib/status-server";
import { readTraction } from "@/lib/traction-server";

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
/** Users, autopilots, trades and volume over time, every wallet counted. For the team only, like /status/private. */
export default async function TractionPage() {
  const expected = statusCookieValue();
  const got = (await cookies()).get(STATUS_COOKIE)?.value;
  if (!expected || !got || !sameSecret(got, expected)) notFound();
  const data = await readTraction();
  if (!data) return <main className="mx-auto max-w-[1100px] px-4 py-10"><h1 className="t-title">Traction is unavailable right now.</h1></main>;
  const { summary: s, collected, readAt: now } = data;
  const a = s.all;
  const days = s.days.all;
  const live = s.live.map((p) => ({ at: Date.parse(`${new Date(p.at).toISOString().slice(0, 10)}T00:00:00Z`), value: p.organic.autopilots + p.team.autopilots }));
  const rows = s.wallets.slice(0, TOP_WALLETS);
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
          </p>
        </Tile>
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3" aria-label="Headlines">
          <Stat label="Users with an autopilot" value={String(a.users)} note={`${a.usersEver} ever saved one`} />
          <Stat label="Live autopilots" value={String(a.autopilots)} />
          <Stat label="Rules" value={String(a.rules)} />
          <Stat label="Trades last 24 h" value={String(a.trades24h)} />
          <Stat label="Trades last 7 days" value={String(a.trades7d)} />
          <Stat label="Trades total" value={String(a.trades)} note="every rule the router ran" />
          <Stat label="Swap volume" value={usd(a.volumeUsd)} note={`${a.swaps} swaps · what went in, at oracle prices`} />
          <Stat label="Paid out by pools" value={usd(a.volumeOutUsd)} note={a.volumeUsd > 0 ? `${(a.volumeOutUsd / a.volumeUsd).toFixed(1)}x the input · testnet pools overpay` : "testnet pools overpay"} />
          <Stat label="Trades per autopilot" value={a.tradesPerAutopilot === null ? "-" : a.tradesPerAutopilot.toFixed(1)} />
          <Stat label="Wallets created" value={String(a.created)} note={f.since === null ? "counting from the next new wallet" : `since ${day(f.since)}`} />
        </section>
        <Tile className="grid gap-3 p-5">
          <TileLabel>Funnel</TileLabel>
          <div className="mono flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[16px]">
            <span>{f.created} created</span><span aria-hidden>→</span>
            <span>{f.withAutopilot} saved an autopilot{pct(f.withAutopilot)}</span><span aria-hidden>→</span>
            <span>{f.traded} traded{pct(f.traded)}</span>
          </div>
          <Label>
            Created counts wallets from the deploy that added it on{f.since === null ? " (none yet)" : `, ${day(f.since)}`}: a wallet is counted when its welcome test USDC arrives. Wallets made before then
            are only in the history once they save an autopilot ({a.usersEver} so far).
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
            <ChartTile slot="day" title="Paid out by pools" unit="USD" decimals={2} points={days.map((d) => ({ at: d.at, value: d.volumeOutUsd }))} />
            <ChartTile slot="day" title="Active wallets" unit="wallet" units="wallets" points={days.map((d) => ({ at: d.at, value: d.active }))} />
            {live.length > 0
              ? <ChartTile slot="day" title="Live autopilots" unit="autopilot" units="autopilots" points={live} />
              : <Tile className="grid gap-3 p-5"><TileLabel>Live autopilots</TileLabel><span className="text-[16px]">The first snapshot comes with the first run.</span></Tile>}
          </section>
        )}
        <Tile className="grid gap-2 p-5">
          <TileLabel>Runs by kind</TileLabel>
          <span className="mono">{kinds(a)}</span>
        </Tile>
        <Tile className="grid gap-3 p-5">
          <TileLabel>Top wallets by trades</TileLabel>
          {rows.length === 0 ? <span className="text-[16px]">No wallets yet.</span> : (
            <div className="overflow-x-auto">
              <table className="mono w-full min-w-[800px] text-left">
                <thead>
                  <tr className="text-muted">
                    <th className="py-1 font-normal">Wallet</th><th className="py-1 font-normal">First seen</th><th className="py-1 font-normal">Last trade</th>
                    <th className="py-1 text-right font-normal">Trades</th><th className="py-1 text-right font-normal">Volume</th><th className="py-1 text-right font-normal">Paid out</th><th className="py-1 text-right font-normal">Rules</th><th className="py-1 pl-3 font-normal">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr key={w.address} className="border-t border-line">
                      <td className="py-1" title={w.address}>{w.address.slice(0, 4)}…{w.address.slice(-4)}</td>
                      <td className="py-1">{w.firstSeen === null ? "before history" : when(w.firstSeen)}</td>
                      <td className="py-1">{when(w.lastTrade)}</td>
                      <td className="py-1 text-right">{w.trades}</td>
                      <td className="py-1 text-right">{usd(w.volumeUsd)}</td>
                      <td className="py-1 text-right text-muted">{usd(w.volumeOutUsd)}</td>
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
          {" "}Volume is each swap&apos;s input at the Reflector price when it was collected. &quot;Paid out by pools&quot; is the output at the same prices (USDC at $1): testnet pools pay several times the oracle price, so it runs well above the input and will not hold on mainnet.
          Live autopilots before {day(s.live[0]?.at ?? null)} are not recorded.
        </Label>
      </main>
    </>
  );
}
