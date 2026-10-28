import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { derToRaw, rpIdFor } = await import("./passkey-proof");

describe("passkey proof", () => {
  it("turns a DER signature into r||s, dropping sign bytes and padding short values", () => {
    const r = Buffer.alloc(32, 0x81), s = Buffer.alloc(31, 0x22);
    const der = Buffer.concat([Buffer.from([0x30, 4 + 33 + 31, 0x02, 33, 0x00]), r, Buffer.from([0x02, 31]), s]);
    expect(derToRaw(der).toString("hex")).toBe(r.toString("hex") + "00" + s.toString("hex"));
  });

  it("accepts koul.me origins and localhost only outside production", () => {
    expect(rpIdFor("https://app.koul.me")).toBe("koul.me");
    expect(rpIdFor("https://koul.me")).toBe("koul.me");
    expect(rpIdFor("https://evil.example")).toBeNull();
    expect(rpIdFor("https://koul.me.evil.example")).toBeNull();
    expect(rpIdFor("http://localhost:3200")).toBe("localhost");
  });
});
