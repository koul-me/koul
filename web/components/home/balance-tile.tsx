"use client";

import * as React from "react";
import { Label, PillButton, Tile } from "@/components/signal";
import { useCountUp } from "@/lib/count-up";
import { fmtFx, fmtLira, fmtRelative, fmtUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppHref } from "@/lib/app-base";

/** "1,234.56" with the cents quieter than the dollars, so the eye lands on the part that matters. */
function Cents({ text }: { text: string }) {
  const dot = text.lastIndexOf(".");
  if (dot < 0) return <>{text}</>;
  return <>{text.slice(0, dot)}<span className="opacity-45">{text.slice(dot)}</span></>;
}

/** Where the total sits; tokens at the Reflector price. */
export interface BalanceParts { earning: number; idle: number; tokens: number; owed: number }

/** A thin bar and a legend under the total: how much is earning in XOXNO, idle in the wallet, held as tokens, owed. */
function Breakdown({ parts }: { parts: BalanceParts }) {
  const held = parts.earning + parts.idle + parts.tokens;
  const rows = [
    { key: "earning", label: "Earning", value: parts.earning, shade: "bg-on-lime" },
    { key: "idle", label: "Idle", value: parts.idle, shade: "bg-on-lime/35" },
    { key: "tokens", label: "Tokens", value: parts.tokens, shade: "bg-on-lime/65" },
  ].filter((r) => r.value >= 0.005 || r.key !== "tokens");
  return (
    <div className="mt-6 grid gap-3">
      {held > 0 && (
        <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {rows.filter((r) => r.value > 0).map((r) => <span key={r.key} className={cn("h-full rounded-full", r.shade)} style={{ width: `${(r.value / held) * 100}%` }} />)}
        </div>
      )}
      <dl className="flex flex-wrap gap-x-6 gap-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span className={cn("size-2 shrink-0 rounded-full", r.shade)} aria-hidden />
            <dt className="label text-on-lime">{r.label}</dt>
            <dd className="num text-[15px] font-bold">{fmtUsdc(r.value)}</dd>
          </div>
        ))}
        {parts.owed > 0 && (
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full border border-on-lime" aria-hidden />
            <dt className="label text-on-lime">Borrowed</dt>
            <dd className="num text-[15px] font-bold">−{fmtUsdc(parts.owed)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * The lime tile: the total (wallet plus XOXNO, minus debt, plus swap tokens at the Reflector price), where it sits,
 * the lira equivalent, Deposit and Withdraw. While
 * loading the layout stays exactly as it will be, with `0,000.00` and `₺00,000.00` in ink at 22% pulsing slowly;
 * the real figures then count up over 700 ms in tabular digits so nothing shifts.
 */
export function BalanceTile({ balance, parts, lira, loading, rate }: { balance: number | null; parts?: BalanceParts | null; lira: number | null; loading: boolean; /** The USD/TRY the lira line used and when the oracle published it. */ rate?: { tryPerUsd: number; at: number } | null }) {
  const appHref = useAppHref();
  const [showRate, setShowRate] = React.useState(false);
  const rateLine = rate ? `at ${fmtFx(rate.tryPerUsd)}, ${fmtRelative(rate.at)}` : null;
  const canWithdraw = (balance ?? 0) > 0;
  const shownBalance = useCountUp(loading ? null : balance);
  const shownLira = useCountUp(loading || lira === null ? null : lira);
  const balanceText = shownBalance === null ? "0,000.00" : fmtUsdc(shownBalance);
  const long = (shownBalance === null ? fmtUsdc(balance ?? 0) : balanceText).length > 9;
  return (
    <Tile tone="lime" className="group flex h-full min-h-[380px] flex-col p-6 md:p-8">
      <div className="flex items-center justify-between">
        <span className="text-[16px] font-bold">Balance</span>
        <span className="text-[16px] font-bold">USDC</span>
      </div>
      <div className="mt-auto py-8">
        <div
          className={cn("t-hero num min-w-0 truncate", long && "text-[40px] md:text-[72px]", shownBalance === null && "animate-pulse-slow text-on-lime")}
          title={long && shownBalance !== null ? balanceText : undefined}
          aria-live="polite"
          aria-label={shownBalance === null ? "Balance loading" : `${fmtUsdc(balance ?? 0)} USDC`}
        >
          <Cents text={balanceText} />
        </div>
        <div className="mt-3 min-h-5">
          {shownLira === null ? (
            <Label tone="onLime" className={cn(loading || lira === null ? "animate-pulse-slow" : "")} aria-hidden>{loading || lira === null ? "₺00,000.00" : ""}</Label>
          ) : (
            <button type="button" onClick={() => setShowRate((v) => !v)} title={rateLine ?? undefined} aria-label={rateLine ? `${fmtLira(shownLira)}, ${rateLine}` : undefined} className="inline-flex min-h-5 items-center gap-3 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-on-lime">
              <Label tone="onLime">{fmtLira(shownLira)}</Label>
              {rateLine && <Label tone="onLime" className={cn("transition-opacity", showRate ? "opacity-70" : "opacity-0 md:group-hover:opacity-70")}>{rateLine}</Label>}
            </button>
          )}
        </div>
      </div>
      {parts && !loading && <Breakdown parts={parts} />}
      <div className="mt-6 flex gap-3">
        <PillButton variant="onLime" size="lg" href={appHref("/deposit")}>Deposit</PillButton>
        <PillButton variant="onLimeOutline" size="lg" href={appHref("/withdraw")} disabled={!canWithdraw}>Withdraw</PillButton>
      </div>
    </Tile>
  );
}
