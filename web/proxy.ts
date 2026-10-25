import { NextResponse, type NextRequest } from "next/server";
import { gateFor, INVITE_COOKIE, rendersApp, routeFor, type GateInput } from "@/lib/app-host";
import { personalCodeExists, signInvite, verifyInvite } from "@/lib/invite";
import { WAITLIST_ON } from "@/lib/waitlist";

const INVITE_MAX_AGE = 60 * 60 * 24 * 90;

/** Personal codes from approved signups; off without WAITLIST_SECRET, and the env codes still work. */
function personal(): GateInput["personal"] {
  const secret = process.env.WAITLIST_SECRET;
  if (!secret) return undefined;
  return { verify: (c) => verifyInvite(c, secret), exists: personalCodeExists, sign: (c) => signInvite(c, secret) };
}

/**
 * app.koul.me serves the app, koul.me the landing; the rules live in lib/app-host.ts. While the waitlist is on,
 * app pages show the waitlist unless the browser holds an invite: one of KOUL_INVITE_CODES, or a personal code from an
 * approved signup, through ?invite=CODE.
 */
export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const route = routeFor(request.headers.get("host") ?? "", url.pathname, url.search);
  if (route.kind === "redirect") return NextResponse.redirect(new URL(route.to, url), route.status);

  if (rendersApp(route, url.pathname)) {
    const gate = await gateFor(url.pathname, url.search, {
      on: WAITLIST_ON,
      codes: process.env.KOUL_INVITE_CODES,
      cookie: request.cookies.get(INVITE_COOKIE)?.value,
      personal: personal(),
    });
    if (gate.kind === "waitlist") return NextResponse.rewrite(new URL(gate.invalid ? "/waitlist?invalid=1" : "/waitlist", url));
    if (gate.kind === "admit") {
      const response = NextResponse.redirect(new URL(gate.to, url), 307);
      response.cookies.set({
        name: INVITE_COOKIE,
        value: gate.cookie,
        path: "/",
        maxAge: INVITE_MAX_AGE,
        httpOnly: true,
        sameSite: "lax",
        secure: url.protocol === "https:",
      });
      return response;
    }
  }

  if (route.kind === "rewrite") return NextResponse.rewrite(new URL(route.to, url));
  return NextResponse.next();
}

export const config = {
  // Pages only: never the API, Next's own files, or anything with a file extension.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
