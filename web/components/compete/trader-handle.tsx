"use client";

import { useWallet } from "@/hooks/use-wallet";
import { cn } from "@/lib/utils";

/**
 * Identify the viewer by wallet, so only their own leaderboard name is highlighted. With `hidden`, other people's names
 * are blurred until hovered, focused or tapped; the viewer's own stays readable.
 */
export function TraderHandle({ href, handle, wallet, hidden = false }: { href: string | null; handle: string; wallet: string; hidden?: boolean }) {
  const { address, isConnected, initializing } = useWallet();
  const own = !initializing && isConnected && address === wallet;
  if (hidden && !own) {
    return (
      <span tabIndex={0} title="Hover to show the name" className="mono inline-block cursor-default select-none text-[14px] blur-[5px] transition-[filter] duration-200 hover:blur-none hover:select-auto focus:blur-none focus:outline-none">
        {handle}
      </span>
    );
  }

  if (!href) return <span className={cn("mono text-[14px]", own && "text-accent-text")}>{handle}</span>;
  return (
    <a href={href} className={cn("text-[15px] font-semibold underline-offset-4 hover:underline", own && "text-accent-text")}>
      {handle}
    </a>
  );
}
