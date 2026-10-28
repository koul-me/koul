import { Redis } from "@upstash/redis";

/**
 * The Upstash store from the Vercel Marketplace integration (waitlist, invites, keeper status). It has shipped under
 * both the KV_* and the UPSTASH_REDIS_* names, so either works. Null when neither is set. No "server-only" here:
 * proxy.ts imports it through lib/invite.ts.
 */
export function store(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}
