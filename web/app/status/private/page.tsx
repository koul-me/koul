import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Label, Tile, TileLabel } from "@/components/signal";
import { AutoRefresh } from "@/components/status/auto-refresh";
import { StatusView } from "@/components/status/status-view";
import { ThemeColor } from "@/components/shell/theme-color";
import { privateStatus, publicStatus, sameSecret, STATUS_COOKIE, statusCookieValue } from "@/lib/status-server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Status (private)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Balances, leases and failure reasons, for the team. Without the cookie from /api/status/unlock it does not exist. */
export default async function PrivateStatusPage() {
  const expected = statusCookieValue();
  const got = (await cookies()).get(STATUS_COOKIE)?.value;
  if (!expected || !got || !sameSecret(got, expected)) notFound();
  const [s, p] = await Promise.all([publicStatus(), privateStatus()]);
  if (!s || !p) return <main className="mx-auto max-w-[1100px] px-4 py-10"><h1 className="t-title">Status is unavailable right now.</h1></main>;
  const hb = p.heartbeat;
  return (
    <>
      <ThemeColor />
      <AutoRefresh />
      <StatusView s={s} now={s.readAt}>
        <Link href="/status/traction" className="block">
          <Tile className="flex flex-wrap items-center justify-between gap-3 p-5">
            <TileLabel>Traction</TileLabel>
            <span className="text-[16px] underline">Users, autopilots, trades and volume over time</span>
          </Tile>
        </Link>
        <Tile className="grid gap-3 p-5">
          <TileLabel>Problems</TileLabel>
          {p.problems.length === 0 ? <span className="text-[16px]">None.</span> : <ul className="grid gap-1">{p.problems.map((x) => <li key={x} className="text-[16px] text-danger">{x}</li>)}</ul>}
        </Tile>
        <Tile className="grid gap-3 p-5">
          <TileLabel>Last pass</TileLabel>
          {hb ? (
            <>
              <div className="mono flex flex-wrap gap-x-6 gap-y-1">
                <span>{hb.wallets} wallets</span><span>{hb.autopilots} autopilots</span><span>{hb.submitted} sent</span>
                <span className={cn(hb.failed > 0 && "text-danger")}>{hb.failed} failed</span><span>{hb.skipped ?? 0} refused in simulation</span>
                <span>{hb.backedOff ?? 0} waiting out their rate limit</span><span>ledger {hb.ledger}</span>
              </div>
              {(hb.errors ?? []).length > 0 && <ul className="mono grid gap-1 text-muted">{hb.errors!.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </>
          ) : <span>No heartbeat yet.</span>}
        </Tile>
        <Tile className="grid gap-3 p-5">
          <TileLabel>Relay failures</TileLabel>
          {p.relayFailures.length === 0 ? <span className="text-[16px]">None recorded.</span> : (
            <ul className="mono grid gap-1">
              {p.relayFailures.slice(0, 10).map((f, i) => (
                <li key={i} className="flex flex-wrap gap-x-4"><span className="text-muted">{new Date(f.at).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span><span>{f.what}</span><span className="text-danger">{f.error}</span></li>
              ))}
            </ul>
          )}
        </Tile>
        <section className="grid items-start gap-4 md:grid-cols-2">
          <Tile className="grid content-start gap-3 p-5">
            <TileLabel>Leases</TileLabel>
            <Label>{p.leases ? `Guard ran ${new Date(p.leases.at).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}` : "The lease guard has not run yet"}{p.shortestLease ? ` · shortest: ${p.shortestLease.name} ${p.shortestLease.part}, ${p.shortestLease.days} days` : ""}</Label>
            <table className="mono w-full text-left">
              <tbody>
                {(p.leases?.leases ?? []).map((l) => (
                  <tr key={`${l.name}-${l.part}`} className="border-t border-line">
                    <td className="py-1">{l.name} {l.part}</td>
                    <td className="py-1 text-right">{l.days === null ? "?" : `${l.days} d`}</td>
                    <td className={cn("py-1 pl-3 text-right", !["ok", "extended", "restored"].includes(l.action) ? "text-danger" : "text-muted")}>{l.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tile>
          <Tile className="grid content-start gap-3 p-5">
            <TileLabel>Balances</TileLabel>
            <Label>The keeper funds the channels; the daily workflow tops any under 60 XLM back to 200</Label>
            <table className="mono w-full text-left">
              <tbody>
                {p.balances.map((b) => (
                  <tr key={b.address} className="border-t border-line">
                    <td className="py-1">{b.label}</td>
                    <td className="py-1 text-muted">{b.address.slice(0, 4)}…{b.address.slice(-4)}</td>
                    <td className={cn("py-1 text-right", b.low && "text-danger")}>{b.xlm === null ? "missing" : `${b.xlm.toFixed(2)} XLM`}{b.low ? " · low" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tile>
        </section>
      </StatusView>
    </>
  );
}
