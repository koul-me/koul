/**
 * Two sites from one project: app.koul.me is the app, koul.me is the landing. These pure rules decide where a
 * request goes (used by proxy.ts) and how an app path becomes a link on the current host (used by lib/app-base).
 * Hosts without an app subdomain (localhost, *.vercel.app) keep the app under /app.
 */
export const APP_HOST = "app.koul.me";
const LANDING_HOSTS = ["koul.me", "www.koul.me"];
const APP_PAGES = ["autopilot", "activity", "account", "deposit", "withdraw"];

export type Route =
  | { kind: "next" }
  | { kind: "rewrite"; to: string }
  | { kind: "redirect"; to: string; status: 307 | 308 };

export const isAppHost = (host: string) => host.split(":")[0]!.startsWith("app.");

const isAppPage = (path: string) => APP_PAGES.some((p) => path === `/${p}` || path.startsWith(`/${p}/`));
/** "/app" becomes "/", "/app/autopilot" becomes "/autopilot"; null when the path is not under /app. */
const underApp = (path: string) => (path === "/app" ? "/" : path.startsWith("/app/") ? path.slice(4) : null);

/** Where a page request goes. `to` is a path on the same host, or a full URL when it leaves for app.koul.me. */
export function routeFor(host: string, path: string, search = ""): Route {
  const name = host.split(":")[0]!;

  // The app host (app.localhost too): bare paths render the /app routes; /app paths lose the prefix.
  if (isAppHost(name)) {
    const stripped = underApp(path);
    if (stripped !== null) return { kind: "redirect", to: `${stripped}${search}`, status: 308 };
    if (path === "/" || isAppPage(path)) return { kind: "rewrite", to: `/app${path === "/" ? "" : path}${search}` };
    return { kind: "next" };
  }

  const appPath = underApp(path) ?? (isAppPage(path) ? path : null);
  if (appPath === null) return { kind: "next" };
  // koul.me: the app has its own host.
  if (LANDING_HOSTS.includes(name)) return { kind: "redirect", to: `https://${APP_HOST}${appPath}${search}`, status: 308 };
  // Any other host keeps the app under /app.
  if (isAppPage(path)) return { kind: "redirect", to: `/app${path}${search}`, status: 307 };
  return { kind: "next" };
}

/** The base the app's links use on a host: "" on the app host, "/app" everywhere else. */
export const appBaseFor = (host: string) => (isAppHost(host) ? "" : "/app");

/** An app path ("/", "/autopilot?load=x") as an href under a base. */
export const appHrefFor = (base: string, path: string) => (base === "" ? path : path === "/" ? base : `${base}${path}`);

/** A browser pathname back to the app path: "/app/autopilot" under "/app" is "/autopilot". */
export function appPathFor(base: string, pathname: string): string {
  if (base === "" || !(pathname === base || pathname.startsWith(`${base}/`))) return pathname;
  return pathname.slice(base.length) || "/";
}
