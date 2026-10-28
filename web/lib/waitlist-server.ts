import "server-only";
import { randomInt } from "node:crypto";
import { inviteKey, PERSONAL_PREFIX } from "@/lib/invite";
import { store } from "@/lib/redis";

/** Emails scored by the time they first joined; a second signup with the same email changes nothing. */
const LIST = "koul:waitlist";
/** Where each email first signed up from: hero, header, close, app. */
const FROM = "koul:waitlist:from";
/** Approved email -> its personal code, so approving twice sends the same code again. */
const APPROVED = "koul:waitlist:approved";

// The generator's alphabet: no 0/o, 1/l/i, so a code typed from an email still works.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const newCode = () => `${PERSONAL_PREFIX}-${Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

/** Adds an email to the waitlist: "added" the first time, "exists" after that, null when no store is configured. */
export async function joinWaitlist(email: string, from: string): Promise<{ result: "added" | "exists"; count: number } | null> {
  const redis = store();
  if (!redis) return null;
  const [added] = await Promise.all([
    redis.zadd(LIST, { nx: true }, { score: Date.now(), member: email }),
    redis.hsetnx(FROM, email, from),
  ]);
  return { result: added ? "added" : "exists", count: await redis.zcard(LIST) };
}

/** Approves an email: its personal code, made the first time and reused after. Null when no store is configured. */
export async function approve(email: string): Promise<{ code: string; fresh: boolean } | null> {
  const redis = store();
  if (!redis) return null;
  const existing = await redis.hget<string>(APPROVED, email);
  if (existing) return { code: existing, fresh: false };
  const code = newCode();
  // hsetnx: if two approvals race, the first code wins and both send it.
  if (!(await redis.hsetnx(APPROVED, email, code))) return { code: (await redis.hget<string>(APPROVED, email))!, fresh: false };
  await redis.set(inviteKey(code), email);
  return { code, fresh: true };
}
