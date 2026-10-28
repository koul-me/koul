"use client";

/** Re-renders the server page every 30 s while the tab is visible, so the status stays current without a reload. */
import * as React from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
