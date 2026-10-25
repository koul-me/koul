/**
 * XOXNO's own names for its lending hubs, the `hubName` of its lending API, which app/api/hubs reads server side (the
 * API refuses browser origins). The defaults are those names as of 2026-10-25; they show until the read lands, and
 * stay when it fails.
 */
export const DEFAULT_HUB_NAMES: Record<number, string> = { 1: "Core", 2: "Secondary USDC", 3: "Liquidity Pools", 4: "Liqvid Private Credit" };

let names: Record<number, string> = { ...DEFAULT_HUB_NAMES };

/** "Core", "Secondary USDC"; "Hub 7" for a hub XOXNO has not named. */
export const hubName = (hub: number): string => names[hub] ?? `Hub ${hub}`;

export function setHubNames(next: Record<number, string>): void {
  names = { ...DEFAULT_HUB_NAMES, ...next };
}

/** Once per page load: the live names replace the defaults for every label drawn after. */
export async function loadHubNames(): Promise<void> {
  try {
    const res = await fetch("/api/hubs");
    if (!res.ok) return;
    const body = (await res.json()) as { hubs?: Record<string, string> };
    if (body.hubs) setHubNames(Object.fromEntries(Object.entries(body.hubs).map(([k, v]) => [Number(k), v])));
  } catch {
    // The defaults stay.
  }
}
