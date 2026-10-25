import { describe, expect, it } from "vitest";
import { signInvite, verifyInvite } from "./invite";

describe("invite cookies", () => {
  it("verifies its own signature and nothing else", async () => {
    const cookie = await signInvite("inv-abc23456", "secret");
    expect(await verifyInvite(cookie, "secret")).toBe(true);
    expect(await verifyInvite(cookie, "other")).toBe(false);
    expect(await verifyInvite(cookie.replace("inv-abc23456", "inv-zzz23456"), "secret")).toBe(false);
    expect(await verifyInvite("inv-abc23456", "secret")).toBe(false);
    expect(await verifyInvite("", "secret")).toBe(false);
  });
});
