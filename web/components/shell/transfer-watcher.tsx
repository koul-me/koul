"use client";

/**
 * Keeps an eye on a bank transfer you left running while you use the rest of the app. It polls the saved transfer,
 * and when the USDC lands it says so and the balance on screen reads itself again. Deposit and Withdraw pages run
 * their own copy, so this one only sits outside them.
 */
import * as React from "react";
import { toast } from "sonner";
import { useTransferRunner } from "@/hooks/use-transfer-runner";
import { fmtUsdc } from "@/lib/format";

export function TransferWatcher() {
  const runner = useTransferRunner();
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    runner.resume();
  }, [runner]);

  const t = runner.transfer;
  const done = t && t.status === "done" ? t : null;
  React.useEffect(() => {
    if (!done) return;
    toast.success(done.direction === "in" ? `${fmtUsdc(done.amountUsdc)} USDC arrived` : "Withdrawal sent to your bank");
    runner.reset();
  }, [done, runner]);
  return null;
}
