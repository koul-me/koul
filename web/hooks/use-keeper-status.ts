"use client";

/** The keeper's last pass, from /api/keeper/status, so the running tile can say "Last check 12 s ago". */
import { usePoll } from "@/lib/data/store";

export interface KeeperStatusView { lastPassAt: number | null; healthy: boolean }

async function readKeeperStatus(): Promise<KeeperStatusView | null> {
  const r = await fetch("/api/keeper/status", { cache: "no-store" });
  if (!r.ok) return null;
  const s = (await r.json()) as { lastPassAt: number | null; healthy: boolean };
  return { lastPassAt: s.lastPassAt, healthy: s.healthy };
}

export function useKeeperStatus(): KeeperStatusView | null {
  return usePoll<KeeperStatusView | null>("keeper-status", readKeeperStatus, { intervalMs: 15_000 }).data ?? null;
}
