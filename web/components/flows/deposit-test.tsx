"use client";

/**
 * Deposit on testnet, the default: one button puts 100 test USDC in the wallet, bought with friendbot XLM on the
 * testnet DEX by the server. No anchor, no bank step. Once it lands the page returns to Home with the balance fresh.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyValue, Label, PillButton, Tile } from "@/components/signal";
import { toastTx } from "@/hooks/use-passkey-action";
import { useTransferRunner } from "@/hooks/use-transfer-runner";
import { useWallet } from "@/hooks/use-wallet";
import { track } from "@/lib/analytics";
import { invalidate } from "@/lib/data/store";
import { useAppHref } from "@/lib/app-base";
import { FlowFrame, DEPOSIT_OPTIONS, type Method } from "./flow-frame";

const AMOUNT = 100;

export function DepositTest({ method, onMethod }: { method: Method; onMethod: (m: Method) => void }) {
  const appHref = useAppHref();
  const router = useRouter();
  const w = useWallet();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // A bank deposit left running is still followed here, and one tap away on the Bank tab.
  const runner = useTransferRunner();
  const resumed = React.useRef(false);
  React.useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    runner.resume();
  }, [runner]);
  const bankRunning = runner.transfer?.direction === "in" && runner.transfer.status === "running";

  const get = async () => {
    if (!w.address) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/faucet/test-usdc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: w.address }) });
      const body = await res.json().catch(() => ({})) as { hash?: string; error?: string };
      if (!res.ok || !body.hash) throw new Error(body.error ?? `The server answered ${res.status}`);
      track("test_usdc_added");
      toastTx(`${AMOUNT} USDC added`, body.hash, "Test USDC from the testnet DEX.");
      invalidate("portfolio:"); invalidate("events:");
      router.push(appHref("/"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlowFrame
      title="Deposit"
      method={method}
      onMethod={onMethod}
      options={DEPOSIT_OPTIONS}
      action={<PillButton size="lg" full disabled={busy || !w.address} aria-busy={busy} onClick={() => void get()}>{busy ? "Adding test USDC" : `Get ${AMOUNT} test USDC`}</PillButton>}
    >
      <Tile className="grid gap-5">
        <div className="divide-y divide-line">
          <KeyValue label="You get" value={`${AMOUNT}.00 USDC`} />
          <KeyValue label="Cost" value="FREE" />
          <KeyValue label="Takes" value="About 20 seconds" tone="muted" />
        </div>
        <p className="text-[15px] text-muted">Testnet USDC to try Koul with. It has no value. For the lira route through the anchor, use Bank.</p>
        <div role="status" aria-live="polite" className="grid gap-2">
          {busy && <Label tone="lime" className="animate-blink">Buying test USDC and sending it to your wallet</Label>}
          {error && <Label tone="danger">{error}</Label>}
          {bankRunning && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label tone="lime">A bank deposit is in progress</Label>
              <PillButton variant="outline" size="sm" onClick={() => onMethod("bank")}>View</PillButton>
            </div>
          )}
        </div>
      </Tile>
    </FlowFrame>
  );
}
