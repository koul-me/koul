import { track as vercelTrack } from "@vercel/analytics";
import { isAppHost } from "@/lib/app-host";

/**
 * The funnel, from the landing to a live autopilot. Every custom event goes through `track` so the names stay in
 * one list. Custom events need Vercel Pro; on Hobby they are dropped and page views still count.
 */
export type KoulEvent =
  | "open_app"
  | "wallet_created"
  | "wallet_connected"
  | "autopilot_started"
  | "autopilot_updated"
  | "rules_cleared"
  | "access_granted"
  | "access_revoked"
  | "crypto_sent"
  | "bank_deposit_started"
  | "bank_deposit_completed"
  | "bank_withdraw_started"
  | "bank_withdraw_completed";

export function track(event: KoulEvent, props?: Record<string, string | number | boolean>) {
  vercelTrack(event, props);
}

/**
 * On app.koul.me the proxy serves /app at the root, so the landing and the app would both report "/". Reporting
 * the app's pages under /app, as every other host shows them, keeps the two apart in the dashboards.
 */
export function withAppPrefix<E extends { url: string }>(event: E): E {
  const url = new URL(event.url);
  if (!isAppHost(url.hostname) || url.pathname === "/app" || url.pathname.startsWith("/app/")) return event;
  url.pathname = url.pathname === "/" ? "/app" : `/app${url.pathname}`;
  return { ...event, url: url.toString() };
}
