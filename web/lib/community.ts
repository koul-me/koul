/**
 * The Koul Telegram group, where competition winners are contacted. NEXT_PUBLIC_KOUL_TELEGRAM_URL is inlined at build
 * time, so the same value reaches server and client components. Null when it is unset or not an https link: pages
 * hide the link then, rather than show a dead one.
 */
const raw = (process.env.NEXT_PUBLIC_KOUL_TELEGRAM_URL ?? "").trim();

export const TELEGRAM_URL: string | null = /^https:\/\/\S+$/.test(raw) ? raw : null;
