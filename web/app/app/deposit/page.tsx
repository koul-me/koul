"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DepositCrypto } from "@/components/flows/deposit-crypto";
import { DepositTest } from "@/components/flows/deposit-test";
import type { Method } from "@/components/flows/flow-frame";
import { useAppHref } from "@/lib/app-base";

function DepositInner() {
  const appHref = useAppHref();
  const router = useRouter();
  const params = useSearchParams();
  // Test USDC is the default; a USDC transfer from another wallet is one tap away. The bank route is hidden, so
  // "?m=bank" lands on test USDC too.
  const method: Method = params.get("m") === "crypto" ? "crypto" : "test";
  const setMethod = (next: Method) => router.replace(appHref(next === "crypto" ? "/deposit?m=crypto" : "/deposit"));
  if (method === "crypto") return <DepositCrypto method={method} onMethod={setMethod} />;
  return <DepositTest method={method} onMethod={setMethod} />;
}

export default function DepositPage() {
  return (
    <React.Suspense fallback={null}>
      <DepositInner />
    </React.Suspense>
  );
}
