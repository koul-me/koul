"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DepositBank } from "@/components/flows/deposit-bank";
import { DepositCrypto } from "@/components/flows/deposit-crypto";
import { DepositTest } from "@/components/flows/deposit-test";
import type { Method } from "@/components/flows/flow-frame";
import { useAppHref } from "@/lib/app-base";

function DepositInner() {
  const appHref = useAppHref();
  const router = useRouter();
  const params = useSearchParams();
  // Test USDC is the default; the bank (anchor) and crypto routes stay one tap away.
  const m = params.get("m");
  const method: Method = m === "bank" || m === "crypto" ? m : "test";
  const setMethod = (next: Method) => router.replace(appHref(next === "test" ? "/deposit" : `/deposit?m=${next}`));
  if (method === "bank") return <DepositBank method={method} onMethod={setMethod} />;
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
