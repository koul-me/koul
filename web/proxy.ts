import { NextResponse, type NextRequest } from "next/server";
import { routeFor } from "@/lib/app-host";

/** app.koul.me serves the app, koul.me the landing; the rules live in lib/app-host.ts. */
export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const route = routeFor(request.headers.get("host") ?? "", url.pathname, url.search);
  if (route.kind === "rewrite") return NextResponse.rewrite(new URL(route.to, url));
  if (route.kind === "redirect") return NextResponse.redirect(new URL(route.to, url), route.status);
  return NextResponse.next();
}

export const config = {
  // Pages only: never the API, Next's own files, or anything with a file extension.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
