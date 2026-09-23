import { describe, expect, it } from "vitest";
import { withAppPrefix } from "./analytics";

const url = (u: string) => withAppPrefix({ type: "pageview" as const, url: u }).url;

describe("withAppPrefix", () => {
  it("reports app.koul.me pages under /app", () => {
    expect(url("https://app.koul.me/")).toBe("https://app.koul.me/app");
    expect(url("https://app.koul.me/deposit?x=1")).toBe("https://app.koul.me/app/deposit?x=1");
  });
  it("leaves the landing and /app paths alone", () => {
    expect(url("https://koul.me/")).toBe("https://koul.me/");
    expect(url("https://koul-stellar.vercel.app/app/autopilot")).toBe("https://koul-stellar.vercel.app/app/autopilot");
    expect(url("https://app.koul.me/app/activity")).toBe("https://app.koul.me/app/activity");
  });
});
