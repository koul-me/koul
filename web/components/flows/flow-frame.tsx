"use client";

/**
 * The narrow single column every Deposit and Withdraw screen sits in: a back button and title on top, the method
 * switch, one tile, and one primary button. On phones the button is pinned to the bottom, over the safe area.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Segmented } from "@/components/signal";
import { cn } from "@/lib/utils";
import { useAppHref } from "@/lib/app-base";

export type Method = "test" | "bank" | "crypto";
export const METHOD_OPTIONS: { value: Method; label: string }[] = [{ value: "bank", label: "Bank · TRY" }, { value: "crypto", label: "Crypto · USDC" }];
/** Deposit leads with test USDC; the labels are short so three fit on a phone. */
export const DEPOSIT_OPTIONS: { value: Method; label: string }[] = [{ value: "test", label: "Testnet" }, { value: "bank", label: "Bank" }, { value: "crypto", label: "Crypto" }];

export function FlowFrame({ title, back, method, onMethod, options = METHOD_OPTIONS, children, action }: { title: React.ReactNode; back?: string; method?: Method; onMethod?: (m: Method) => void; options?: { value: Method; label: string }[]; children: React.ReactNode; action?: React.ReactNode }) {
  const appHref = useAppHref();
  return (
    <div className={cn("mx-auto w-full max-w-[600px]", action && "pb-24 md:pb-0")}>
      <div className="flex items-center gap-4 py-2 md:py-4">
        <Link href={back ?? appHref("/")} aria-label="Back" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-text transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="t-title truncate">{title}</h1>
      </div>
      {method && onMethod && <Segmented label="Method" value={method} onChange={onMethod} options={options} className="mt-2 mb-4" />}
      <div className="grid gap-4 [&>*]:min-w-0">{children}</div>
      {action && (
        <div className="fixed inset-x-4 bottom-0 z-30 mb-[max(16px,env(safe-area-inset-bottom))] md:static md:mt-4 md:mb-0">
          {action}
        </div>
      )}
    </div>
  );
}
