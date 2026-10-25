import "server-only";
import { Redis } from "@upstash/redis";

/** Emails scored by the time they first joined; a second signup with the same email changes nothing. */
const LIST = "koul:waitlist";
/** Where each email first signed up from: hero, header, close, app. */
const FROM = "koul:waitlist:from";

/**
 * The Upstash store from the Vercel Marketplace integration. It has shipped under both the KV_* and the
 * UPSTASH_REDIS_* names, so either works. Null when neither is set.
 */
function store(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

/** Adds an email to the waitlist. False when no store is configured. */
export async function joinWaitlist(email: string, from: string): Promise<boolean> {
  const redis = store();
  if (!redis) return false;
  await Promise.all([
    redis.zadd(LIST, { nx: true }, { score: Date.now(), member: email }),
    redis.hsetnx(FROM, email, from),
  ]);
  return true;
}
