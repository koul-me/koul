"use client";

import { useWallet } from "@/hooks/use-wallet";
import { cn } from "@/lib/utils";

/** Identify the viewer by wallet, so only their own leaderboard name is highlighted. */
export function TraderHandle({ href, handle, wallet }: { href: string | null; handle: string; wallet: string }) {
  const { address, isConnected, initializing } = useWallet();
  const own = !initializing && isConnected && address === wallet;

  if (!href) return <span className={cn("mono text-[14px]", own && "text-accent-text")}>{handle}</span>;
  return (
    <a href={href} className={cn("text-[15px] font-semibold underline-offset-4 hover:underline", own && "text-accent-text")}>
      {handle}
    </a>
  );
}
