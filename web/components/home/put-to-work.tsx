"use client";

/**
 * "Put to work" moves some or all of the idle USDC into the hub paying most, with one passkey: slide the share,
 * see the amount. The confirmation is a small dark dialog on desktop and a sheet on phones, both from one component.
 */
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { IconButton, KeyValue, Label, PillButton, TickSlider } from "@/components/signal";
import { usePositionActions } from "@/hooks/use-position-actions";
import { useAutopilotLive } from "@/hooks/use-autopilot-live";
import { useAppHref } from "@/lib/app-base";
import { actionShort, conditionsCompact } from "@/lib/model/labels";
import type { ActionKind } from "@/lib/model/autopilot";
import { fmtPct, fmtUsdc } from "@/lib/format";
import type { Pool } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { hubName } from "@/lib/model/hubs";

/** Actions that take supplied USDC back out of the hubs. */
const PULLS_BACK: ActionKind[] = ["withdraw_to_wallet", "withdraw_to_token"];

export function PutToWorkDialog({ open, onOpenChange, idle, pool }: { open: boolean; onOpenChange: (o: boolean) => void; idle: number; pool: Pool | null }) {
  const actions = usePositionActions();
  const busy = actions.action.busy;
  const ap = useAutopilotLive();
  const appHref = useAppHref();
  // The rule a tick would run now: if it withdraws from the hubs, this money comes straight back.
  const running = ap.status === "live" && ap.nowOn !== null ? ap.rules.find((r) => r.index === ap.nowOn) ?? null : null;
  const pullsBack = running && PULLS_BACK.includes(running.rule.action.kind) ? running : null;
  const [share, setShare] = React.useState(100);
  // Whole cents, and the router's 1 USDC minimum: a share that comes to less than that cannot go.
  const amount = Math.floor(idle * share) / 100;
  const tooSmall = amount < 1;
  const confirm = async () => {
    if (!pool || tooSmall) return;
    const res = await actions.supply(pool.id, amount);
    if (res) onOpenChange(false);
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (busy && !o) return; onOpenChange(o); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/60 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed z-50 flex flex-col gap-5 bg-surface p-6 text-text outline-none transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "inset-x-0 bottom-0 rounded-t-[var(--radius-tile)] pb-[max(24px,env(safe-area-inset-bottom))] data-ending-style:translate-y-full data-starting-style:translate-y-full",
            "md:inset-auto md:top-1/2 md:left-1/2 md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-tile)] md:pb-6 md:data-ending-style:translate-y-[calc(-50%+8px)] md:data-ending-style:opacity-0 md:data-starting-style:translate-y-[calc(-50%+8px)] md:data-starting-style:opacity-0",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="text-[24px] font-bold leading-tight">Put to work</DialogPrimitive.Title>
            <DialogPrimitive.Close render={<IconButton aria-label="Close" disabled={busy} />}><X className="size-5" /></DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="text-muted">Your idle USDC goes into the hub that pays most right now. It stays yours, in your own XOXNO lending account.</DialogPrimitive.Description>
          <TickSlider
            value={share}
            min={0}
            max={100}
            step={5}
            label="How much of your idle USDC to put to work"
            format={(v) => ({ main: fmtUsdc(Math.floor(idle * v) / 100), unit: `USDC · ${v}%` })}
            onCommit={setShare}
          />
          <div className="rounded-[var(--radius-group)] bg-surface-2 px-4">
            <KeyValue label="Stays idle" value={`${fmtUsdc(Math.max(0, idle - amount))} USDC`} />
            <KeyValue label="To" value={pool ? `${hubName(pool.hub)} · ${fmtPct(pool.supplyApy)}` : "—"} />
          </div>
          {tooSmall && <Label tone="danger">At least 1 USDC</Label>}
          {pullsBack && (
            <div role="alert" className="grid gap-2 rounded-[var(--radius-group)] border border-danger px-4 py-3 text-[15px]">
              <span><span className="font-bold">Your autopilot will move this back.</span> <span className="text-muted">Rule {pullsBack.index} holds right now (IF {conditionsCompact(pullsBack.rule)} → {actionShort(pullsBack.rule.action)}), so within about 15 seconds of supplying, it takes this out again.</span></span>
              <a href={appHref("/autopilot")} className="label w-fit text-accent-text underline underline-offset-4">Edit rules</a>
            </div>
          )}
          <PillButton size="lg" full onClick={() => void confirm()} disabled={busy || !pool || tooSmall} aria-busy={busy}>
            {actions.action.phase === "prompt" ? "Confirm with your passkey" : actions.action.phase === "signed" || actions.action.phase === "submitting" ? "Sending to Stellar" : pullsBack ? "Put to work anyway" : "Put to work"}
          </PillButton>
          <Label className="text-center">One passkey confirmation</Label>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
