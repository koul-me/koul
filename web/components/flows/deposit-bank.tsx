"use client";

/**
 * Deposit by bank: the USDC you want, the lira that costs at the oracle rate, then the transfer the anchor opened:
 * IBAN, reference and amount to copy. One primary button carries you through: Continue, then "I've sent it", and
 * once the USDC lands the page returns to Home by itself with the balance already fresh. A transfer left running
 * is picked up again from local storage (and by the app's watcher if you leave this page).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { CopyRow, KeyValue, Label, PillButton, Sk, Tile } from "@/components/signal";
import { useFx } from "@/hooks/use-market";
import { REFERENCE_KEYS, useTransferRunner } from "@/hooks/use-transfer-runner";
import { fmtFx, fmtLira, fmtLiraWhole, fmtUsdc } from "@/lib/format";
import type { Transfer } from "@/lib/data/types";
import { AmountInput, parseAmount } from "./amount-input";
import { DEPOSIT_OPTIONS, FlowFrame, type Method } from "./flow-frame";
import { Steps } from "./steps";
import { useAppHref } from "@/lib/app-base";

const STEP_LABELS = ["Verified", "Send", "Convert", "Arrives"];
/** How long a details row may stay a skeleton before the page says the anchor has not answered. */
const DETAILS_TIMEOUT_MS = 15_000;

/** True once `ms` have passed while `waiting` has stayed true; a new wait starts a new count. */
function useTimedOut(waiting: boolean, ms: number): boolean {
  // Each time waiting turns on, the generation moves; the timer reports which generation it fired for.
  const [prev, setPrev] = React.useState(waiting);
  const [gen, setGen] = React.useState(0);
  if (waiting !== prev) { setPrev(waiting); if (waiting) setGen((g) => g + 1); }
  const [fired, setFired] = React.useState(-1);
  React.useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setFired(gen), ms);
    return () => clearTimeout(t);
  }, [waiting, gen, ms]);
  return waiting && fired === gen;
}

/** The anchor names its instruction fields; find the IBAN and the reference whatever they are called. */
function pick(instructions: Transfer["instructions"], keys: string[]): string | null {
  if (!instructions) return null;
  for (const k of keys) {
    const v = instructions[k]?.value;
    if (v) return v;
  }
  return null;
}

/** A details row the anchor has not filled in after the timeout. */
function DetailsMissing({ label }: { label: string }) {
  return <div className="flex min-h-14 items-center gap-4 px-4"><Label className="w-24 shrink-0">{label}</Label><span className="label text-danger">Not received</span></div>;
}

export function DepositBank({ method, onMethod }: { method: Method; onMethod: (m: Method) => void }) {
  const appHref = useAppHref();
  const router = useRouter();
  const fx = useFx();
  const runner = useTransferRunner();
  const [amount, setAmount] = React.useState("");
  const usdc = parseAmount(amount);
  const rate = fx.loading || fx.fx.tryPerUsd <= 0 ? null : fx.fx.tryPerUsd;
  // The bank leg is in lira, rounded to the kuruş; the USDC shown is what that buys at the oracle rate.
  const lira = rate && usdc ? Math.round(usdc * rate * 100) / 100 : 0;

  // A deposit left running comes back on its own.
  const resumed = React.useRef(false);
  React.useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    runner.resume();
  }, [runner]);

  const t = runner.transfer;
  // The anchor answers the IBAN with the transfer; a row still empty after 15 s is an error, not a wait.
  const detailsLate = useTimedOut(!!t && t.direction === "in" && t.status === "running" && !t.instructions, DETAILS_TIMEOUT_MS);
  // Arrived: back to Home on its own after a beat, where the balance has already been read again.
  const doneAt = t && t.direction === "in" && t.status === "done" ? t.id : null;
  React.useEffect(() => {
    if (!doneAt) return;
    const id = setTimeout(() => { runner.reset(); router.push(appHref("/")); }, 1600);
    return () => clearTimeout(id);
  }, [doneAt, runner, router, appHref]);
  if (t && t.direction === "in") {
    const active = t.steps.findIndex((s) => s.state === "active");
    const stepIndex = t.status === "done" ? STEP_LABELS.length : t.status === "failed" ? Math.max(0, active) : Math.max(1, active);
    const iban = pick(t.instructions, ["bank_account_number", "iban", "account_number"]);
    const reference = t.reference ?? pick(t.instructions, REFERENCE_KEYS);
    const bank = pick(t.instructions, ["bank_name"]);
    // An anchor may send bank details without any reference key. Say so instead of waiting for one.
    const noReference = t.instructions !== null && !reference;
    const waiting = t.status === "running" && active === 1;
    const converting = t.status === "running" && active >= 2;
    const home = () => { if (t.status !== "running") runner.reset(); router.push(appHref("/")); };
    // One button, whatever the moment: send it, wait for it, or start over.
    const action = waiting
      ? <PillButton size="lg" full onClick={() => void runner.simulateBank()} disabled={runner.busy} aria-busy={runner.busy}>{runner.busy ? "Checking" : "I've sent it"}</PillButton>
      : t.status === "failed"
        ? <PillButton variant="outline" size="lg" full onClick={() => runner.reset()}>Start again</PillButton>
        : t.status === "done"
          ? <PillButton size="lg" full onClick={home}>Go to Home</PillButton>
          : <PillButton variant="outline" size="lg" full onClick={home}>Wait on Home</PillButton>;
    return (
      <FlowFrame
        title={t.status === "done" ? `${fmtUsdc(t.amountUsdc)} USDC arrived` : waiting ? `Send ${fmtLiraWhole(t.amountTry)}` : `${fmtUsdc(t.amountUsdc)} USDC on its way`}
        action={action}
      >
        <Tile className="grid gap-5 [&>*]:min-w-0">
          <Steps labels={STEP_LABELS} active={stepIndex} failed={t.status === "failed"} />
          {t.status !== "done" && (
            <div className="min-w-0 divide-y divide-line rounded-[var(--radius-group)] border border-line">
              {iban ? <CopyRow label="IBAN" value={iban} /> : detailsLate ? <DetailsMissing label="IBAN" /> : <div className="flex min-h-14 items-center gap-4 px-4"><Label className="w-24">IBAN</Label><Sk className="h-4 w-48" /></div>}
              {reference ? <CopyRow label="Reference" value={reference} /> : noReference ? (
                <div className="flex min-h-14 items-center gap-4 px-4"><Label className="w-24 shrink-0">Reference</Label><span className="label text-muted">None · the anchor gave no reference</span></div>
              ) : detailsLate ? <DetailsMissing label="Reference" /> : <div className="flex min-h-14 items-center gap-4 px-4"><Label className="w-24">Reference</Label><Sk className="h-4 w-32" /></div>}
              <CopyRow label="Amount" value={t.amountTry.toFixed(2)} display={fmtLira(t.amountTry)} />
            </div>
          )}
          {bank && t.status !== "done" && <Label>{bank}</Label>}
          {detailsLate && t.status !== "done" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label tone="danger">The anchor has not sent the bank details</Label>
              <PillButton variant="outline" size="sm" onClick={() => runner.retry()}>Retry</PillButton>
            </div>
          )}
          <div role="status" aria-live="polite" className="grid gap-2">
            {waiting && <Label tone="lime">Waiting for your transfer</Label>}
            {converting && <Label tone="lime" className="animate-blink">Lira received · converting to USDC</Label>}
            {t.status === "done" && <Label tone="lime">Arrived · {fmtUsdc(t.amountUsdc)} USDC in your wallet</Label>}
            {t.status === "failed" && <Label tone="danger">{t.steps[active]?.detail ?? "The transfer stopped"}</Label>}
            {waiting && <p className="text-[15px] text-muted">Testnet: &ldquo;I&rsquo;ve sent it&rdquo; tells the sandbox bank you paid. You can also leave; Home updates when it lands.</p>}
          </div>
        </Tile>
      </FlowFrame>
    );
  }

  const canContinue = lira > 0 && !runner.busy;
  return (
    <FlowFrame
      title="Deposit"
      method={method}
      onMethod={onMethod}
      options={DEPOSIT_OPTIONS}
      action={<PillButton size="lg" full disabled={!canContinue} aria-busy={runner.busy} onClick={() => void runner.start("in", { amountTry: lira, amountUsdc: usdc, rate: rate ?? 0 })}>{runner.busy ? "Getting bank details" : "Continue"}</PillButton>}
    >
      <Tile className="grid gap-5">
        <AmountInput value={amount} onChange={setAmount} unit="USDC" label="You get" autoFocus />
        <div className="divide-y divide-line">
          <KeyValue label="You send" value={!usdc ? "—" : rate === null ? <Sk className="h-4 w-24" /> : fmtLira(lira)} />
          <KeyValue label="Rate" value={rate === null ? <Sk className="h-4 w-16" /> : fmtFx(rate)} />
          <KeyValue label="Anchor fee" value="—" tone="muted" />
          <KeyValue label="Network fee" value="FREE" />
        </div>
        {t?.status === "failed" && <Label tone="danger">{t.steps.find((s) => s.state === "failed")?.detail ?? "The transfer stopped"}</Label>}
      </Tile>
    </FlowFrame>
  );
}
