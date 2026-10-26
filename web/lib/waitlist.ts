/**
 * The waitlist switch, NEXT_PUBLIC_KOUL_WAITLIST. Read at build time, so changing it needs a redeploy.
 * - "closed" (or "1"): the app opens only with an invite (proxy.ts); the landing's Open app becomes the email field.
 * - "open": the landing keeps the email field, with Open app beside it, and anyone can use the app.
 * - unset: no waitlist anywhere.
 */
const MODE = process.env.NEXT_PUBLIC_KOUL_WAITLIST;

/** The landing collects emails. */
export const WAITLIST_ON = MODE === "open" || MODE === "closed" || MODE === "1";
/** The app needs an invite. */
export const WAITLIST_GATED = MODE === "closed" || MODE === "1";
