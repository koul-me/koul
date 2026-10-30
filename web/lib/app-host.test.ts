import { describe, expect, it } from "vitest";
import { appBaseFor, appHrefFor, appPathFor, gateFor, parseInviteCodes, rendersApp, routeFor } from "./app-host";

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
    // The competition's join step needs the wallet, so it lives in the app; its public pages stay on koul.me.
    expect(routeFor("koul.me", "/join")).toEqual({ kind: "redirect", to: "https://app.koul.me/join", status: 308 });
    expect(routeFor("koul.me", "/compete/leaderboard")).toEqual({ kind: "next" });
    expect(routeFor("app.koul.me", "/join")).toEqual({ kind: "rewrite", to: "/app/join" });
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
  const on = { on: true, codes: "judge-abc, team-def\nfriend-ghi" };
  // Personal codes, faked: inv-good exists; its cookie is "inv-good.sig".
  const personal = {
    verify: async (c: string) => c === "inv-good.sig",
    exists: async (c: string) => c === "inv-good",
    sign: async (c: string) => `${c}.sig`,
  };

  it("lets everyone in when the waitlist is off", async () => {
    expect(await gateFor("/autopilot", "", { on: false, codes: "judge-abc" })).toEqual({ kind: "open" });
  });

  it("shows the waitlist without the cookie, or with a revoked one", async () => {
    expect(await gateFor("/", "", on)).toEqual({ kind: "waitlist", invalid: false });
    expect(await gateFor("/autopilot", "?load=abc", { ...on, cookie: "old-code" })).toEqual({ kind: "waitlist", invalid: false });
  });

  it("says when a tried code does not work", async () => {
    expect(await gateFor("/", "?invite=wrong", on)).toEqual({ kind: "waitlist", invalid: true });
    expect(await gateFor("/", "?invite=inv-nope", { ...on, personal })).toEqual({ kind: "waitlist", invalid: true });
  });

  it("lets any listed code's cookie through", async () => {
    expect(await gateFor("/autopilot", "?load=abc", { ...on, cookie: "team-def" })).toEqual({ kind: "open" });
    expect(await gateFor("/", "", { ...on, cookie: "friend-ghi" })).toEqual({ kind: "open" });
  });

  it("admits a listed invite in any case and drops only the invite parameter", async () => {
    expect(await gateFor("/", "?invite=judge-abc", on)).toEqual({ kind: "admit", to: "/", cookie: "judge-abc" });
    expect(await gateFor("/app/autopilot", "?load=abc&invite=TEAM-DEF", on)).toEqual({ kind: "admit", to: "/app/autopilot?load=abc", cookie: "team-def" });
  });

  it("admits a personal code with a signed cookie, and lets that cookie through", async () => {
    expect(await gateFor("/", "?invite=INV-good", { ...on, personal })).toEqual({ kind: "admit", to: "/", cookie: "inv-good.sig" });
    expect(await gateFor("/deposit", "", { ...on, personal, cookie: "inv-good.sig" })).toEqual({ kind: "open" });
    expect(await gateFor("/deposit", "", { ...on, personal, cookie: "inv-good.forged" })).toEqual({ kind: "waitlist", invalid: false });
  });

  it("ignores personal codes when they are off", async () => {
    expect(await gateFor("/", "?invite=inv-good", on)).toEqual({ kind: "waitlist", invalid: true });
    expect(await gateFor("/", "", { ...on, cookie: "inv-good.sig" })).toEqual({ kind: "waitlist", invalid: false });
  });

  it("has no way in when no codes are set", async () => {
    expect(await gateFor("/", "", { on: true, cookie: "" })).toEqual({ kind: "waitlist", invalid: false });
    expect(await gateFor("/", "?invite=x", { on: true, codes: " , ", cookie: "" })).toEqual({ kind: "waitlist", invalid: true });
  });

  it("splits the code list on commas, spaces and new lines", () => {
    expect(parseInviteCodes(" A-1, b-2\n c-3 ,,")).toEqual(["a-1", "b-2", "c-3"]);
    expect(parseInviteCodes(undefined)).toEqual([]);
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
