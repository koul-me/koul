/**
 * XOXNO's hub names from its testnet lending API (`hubName` per market), read here because the API answers 403
 * "Origin not allowed" to a browser on app.koul.me. Cached for five minutes; the defaults answer when XOXNO is down.
 */
import { DEFAULT_HUB_NAMES } from "@/lib/model/hubs";

export const runtime = "nodejs";
export const revalidate = 300;

const XOXNO_LENDING_ASSETS = "https://testnet-api.xoxno.com/stellar-lending/v1/assets";

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(XOXNO_LENDING_ASSETS, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`XOXNO answered ${res.status}`);
    const assets = (await res.json()) as Array<{ hubId?: unknown; hubName?: unknown }>;
    const hubs: Record<number, string> = {};
    for (const a of assets) if (typeof a.hubId === "number" && typeof a.hubName === "string" && a.hubName.trim()) hubs[a.hubId] = a.hubName.trim();
    return Response.json({ hubs: { ...DEFAULT_HUB_NAMES, ...hubs }, live: true });
  } catch (err) {
    console.error("Hub names:", err instanceof Error ? err.message : err);
    return Response.json({ hubs: DEFAULT_HUB_NAMES, live: false });
  }
}
