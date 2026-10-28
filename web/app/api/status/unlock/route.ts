/**
 * GET ?key=STATUS_SECRET: opens the private status page in this browser for 90 days (an httpOnly cookie holding an
 * HMAC of the secret) and goes there. A wrong key gets the same 404 the page gives, so the route reveals nothing.
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { sameSecret, STATUS_COOKIE, statusCookieValue } from "@/lib/status-server";

export async function GET(request: Request): Promise<Response> {
  const limited = await rateLimit(request, "register");
  if (limited) return limited;
  const url = new URL(request.url);
  const secret = process.env.STATUS_SECRET;
  const key = url.searchParams.get("key") ?? "";
  const value = statusCookieValue();
  if (!secret || !value || !sameSecret(key, secret)) return new Response("Not found", { status: 404 });
  const res = NextResponse.redirect(new URL("/status/private", url), 303);
  res.cookies.set({ name: STATUS_COOKIE, value, path: "/status", maxAge: 90 * 86400, httpOnly: true, sameSite: "lax", secure: url.protocol === "https:" });
  return res;
}
