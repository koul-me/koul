import { describe, expect, it } from "vitest";
import { appBaseFor, appHrefFor, appPathFor, routeFor } from "./app-host";

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
