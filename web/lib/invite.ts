import { store } from "@/lib/redis";

/**
 * Personal invite codes: made when the owner approves someone (lib/waitlist-server.ts), kept in Redis, and turned
 * into a signed cookie the first time a browser uses one, so the proxy checks later visits without a network call.
 * No "server-only" here: proxy.ts imports this.
 */

/** Personal codes start with this; the env codes (judge-, team-, beta-) never do. */
export const PERSONAL_PREFIX = "inv";
/** Personal code -> the email it was made for. */
export const inviteKey = (code: string) => `koul:invite:${code}`;

/** True when a personal code exists. Any store error counts as no, so the page shows the waitlist, never a crash. */
export async function personalCodeExists(code: string): Promise<boolean> {
  if (!code.startsWith(`${PERSONAL_PREFIX}-`)) return false;
  try {
    return (await store()?.exists(inviteKey(code))) === 1;
  } catch {
    return false;
  }
}

const encoder = new TextEncoder();
const b64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** HMAC-SHA256 of a message, base64url. Web Crypto, so it runs in the proxy and in route handlers alike. */
export async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** Compares two strings in time that does not depend on where they differ. */
export function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The cookie value for a personal code: "code.signature". */
export const signInvite = async (code: string, secret: string) => `${code}.${await hmac(`invite:${code}`, secret)}`;

export async function verifyInvite(cookie: string, secret: string): Promise<boolean> {
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return false;
  return sameString(cookie.slice(dot + 1), await hmac(`invite:${cookie.slice(0, dot)}`, secret));
}

/** The signature on an owner's Approve link for one email. */
export const approveSignature = (email: string, secret: string) => hmac(`approve:${email}`, secret);
