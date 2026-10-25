/**
 * The waitlist switch. NEXT_PUBLIC_KOUL_WAITLIST=1 closes the app to anyone without an invite (proxy.ts) and turns
 * the landing's Open app into an email field. It is read at build time, so changing it needs a redeploy.
 */
export const WAITLIST_ON = process.env.NEXT_PUBLIC_KOUL_WAITLIST === "1";
