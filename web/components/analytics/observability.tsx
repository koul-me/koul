"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { withAppPrefix } from "@/lib/analytics";

/** Vercel Web Analytics (visits, custom events) and Speed Insights (Core Web Vitals) for the landing and the app. */
export function Observability() {
  return (
    <>
      <Analytics beforeSend={withAppPrefix} />
      <SpeedInsights beforeSend={withAppPrefix} />
    </>
  );
}
