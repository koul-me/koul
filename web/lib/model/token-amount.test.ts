import { describe, expect, it } from "vitest";
import { fmtTokenAmount } from "./autopilot";

describe("token amounts", () => {
  it("keeps small levels readable instead of rounding them to 0", () => {
    expect(fmtTokenAmount(0.002)).toBe("0.002");
    expect(fmtTokenAmount(0.00214321)).toBe("0.002143");
    expect(fmtTokenAmount(0)).toBe("0");
    expect(fmtTokenAmount(1)).toBe("1.00");
    expect(fmtTokenAmount(1234.5)).toBe("1,234.50");
  });
});
