"use client";

import { WithdrawCrypto } from "@/components/flows/withdraw-crypto";

/** USDC to a Stellar address. The bank route is hidden, so "?m=bank" lands here too. */
export default function WithdrawPage() {
  return <WithdrawCrypto />;
}
