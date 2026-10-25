import { describe, expect, it } from "vitest";
import { appBaseFor, appHrefFor, appPathFor, gateFor, rendersApp, routeFor } from "./app-host";

describe("routeFor", () => {
  it("serves the app at the root of app.koul.me", () => {
    expect(routeFor("app.koul.me", "/")).toEqual({ kind: "rewrite", to: "/app" });
    expect(routeFor("app.koul.me", "/autopilot", "?load=abc")).toEqual({ kind: "rewrite", to: "/app/autopilot?load=abc" });
    expect(routeFor("app.koul.me", "/deposit")).toEqual({ kind: "rewrite", to: "/app/deposit" });
  });

  it("drops the /app prefix on app.koul.me", () => {
    expect(routeFor("app.koul.me", "/app")).toEqual({ kind: "redirect", to: "/", status: 308 });
    expect(routeFor("app.koul.me", "/app/account", "?x=1")).toEqual({ kind: "redirect", to: "/account?x=1", status: 308 });
  });

  it("sends app paths on koul.me to app.koul.me, keeping the query", () => {
    expect(routeFor("koul.me", "/")).toEqual({ kind: "next" });
    expect(routeFor("koul.me", "/app")).toEqual({ kind: "redirect", to: "https://app.koul.me/", status: 308 });
    expect(routeFor("www.koul.me", "/app/activity")).toEqual({ kind: "redirect", to: "https://app.koul.me/activity", status: 308 });
    expect(routeFor("koul.me", "/autopilot", "?load=abc")).toEqual({ kind: "redirect", to: "https://app.koul.me/autopilot?load=abc", status: 308 });
  });

  it("keeps the app under /app on other hosts", () => {
    expect(routeFor("localhost:3200", "/")).toEqual({ kind: "next" });
    expect(routeFor("localhost:3200", "/app/autopilot")).toEqual({ kind: "next" });
    expect(routeFor("koul-stellar.vercel.app", "/autopilot", "?load=abc")).toEqual({ kind: "redirect", to: "/app/autopilot?load=abc", status: 307 });
  });

  it("leaves unrelated paths alone", () => {
    expect(routeFor("app.koul.me", "/opengraph-image")).toEqual({ kind: "next" });
    expect(routeFor("koul.me", "/applesauce")).toEqual({ kind: "next" });
    expect(routeFor("koul.me", "/autopilots")).toEqual({ kind: "next" });
  });
});

describe("app links", () => {
  it("has no base on the app host and /app elsewhere", () => {
    expect(appBaseFor("app.koul.me")).toBe("");
    expect(appBaseFor("app.localhost:3200")).toBe("");
    expect(appBaseFor("koul-stellar.vercel.app")).toBe("/app");
  });

  it("maps app paths to hrefs and back", () => {
    expect(appHrefFor("", "/")).toBe("/");
    expect(appHrefFor("", "/autopilot")).toBe("/autopilot");
    expect(appHrefFor("/app", "/")).toBe("/app");
    expect(appHrefFor("/app", "/deposit?m=crypto")).toBe("/app/deposit?m=crypto");
    expect(appPathFor("/app", "/app")).toBe("/");
    expect(appPathFor("/app", "/app/account")).toBe("/account");
    expect(appPathFor("", "/account")).toBe("/account");
    expect(appPathFor("/app", "/applesauce")).toBe("/applesauce");
  });
});

describe("waitlist gate", () => {
  const on = { on: true, code: "early" };

  it("lets everyone in when the waitlist is off", () => {
    expect(gateFor("/autopilot", "", { on: false, code: "early" })).toEqual({ kind: "open" });
  });

  it("shows the waitlist without the cookie, or with a wrong one", () => {
    expect(gateFor("/", "", on)).toEqual({ kind: "waitlist" });
    expect(gateFor("/autopilot", "?load=abc", { ...on, cookie: "old" })).toEqual({ kind: "waitlist" });
    expect(gateFor("/", "?invite=wrong", on)).toEqual({ kind: "waitlist" });
  });

  it("lets the cookie through", () => {
    expect(gateFor("/autopilot", "?load=abc", { ...on, cookie: "early" })).toEqual({ kind: "open" });
  });

  it("admits a valid invite and drops only the invite parameter", () => {
    expect(gateFor("/", "?invite=early", on)).toEqual({ kind: "admit", to: "/", code: "early" });
    expect(gateFor("/app/autopilot", "?load=abc&invite=early", on)).toEqual({ kind: "admit", to: "/app/autopilot?load=abc", code: "early" });
  });

  it("has no way in when no code is set", () => {
    expect(gateFor("/", "?invite=", { on: true, cookie: "" })).toEqual({ kind: "waitlist" });
    expect(gateFor("/", "?invite=", { on: true, code: "  ", cookie: "" })).toEqual({ kind: "waitlist" });
  });

  it("only gates requests that render the app", () => {
    const at = (host: string, path: string) => rendersApp(routeFor(host, path), path);
    expect(at("app.koul.me", "/")).toBe(true);
    expect(at("app.koul.me", "/deposit")).toBe(true);
    expect(at("localhost:3200", "/app/account")).toBe(true);
    expect(at("koul.me", "/")).toBe(false);
    expect(at("localhost:3200", "/")).toBe(false);
    expect(at("app.koul.me", "/waitlist")).toBe(false);
    expect(at("koul.me", "/waitlist")).toBe(false);
    expect(at("app.koul.me", "/opengraph-image")).toBe(false);
  });
});
