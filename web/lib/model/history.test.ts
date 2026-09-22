import { describe, expect, it } from "vitest";
import { balanceHistory, lastDays } from "./history";

const DAY = 86_400_000;
const now = 100 * DAY;

describe("balanceHistory", () => {
  it("builds forward from zero when the history reaches the wallet's start", () => {
    const h = balanceHistory([{ at: 10 * DAY, amount: 1000 }, { at: 50 * DAY, amount: -200 }], 810, 0, true, now);
    expect(h.series[0]).toEqual({ t: 0, v: 0 });
    expect(h.series.find((p) => p.t === 10 * DAY)?.v).toBe(1000);
    expect(h.series.find((p) => p.t === 50 * DAY)?.v).toBe(800);
    expect(h.series.at(-1)).toEqual({ t: now, v: 810 });
    expect(h.netIn).toBe(800);
    expect(h.pnl).toBeCloseTo(10);
  });

  it("puts interest in the PnL", () => {
    const h = balanceHistory([{ at: 10 * DAY, amount: 1000 }], 1012.5, 0, true, now);
    expect(h.pnl).toBeCloseTo(12.5);
    expect(h.pnlPct).toBeCloseTo(1.25);
  });

  it("has no percent with nothing deposited", () => {
    const h = balanceHistory([], 0, 0, true, now);
    expect(h.pnl).toBe(0);
    expect(h.pnlPct).toBeNull();
  });

  it("walks back from today, with no PnL, when the start is unknown", () => {
    const h = balanceHistory([{ at: 5 * DAY, amount: 500 }, { at: 20 * DAY, amount: 100 }], 600, 10 * DAY, false, now);
    expect(h.netIn).toBe(100);
    expect(h.series[0]).toEqual({ t: 10 * DAY, v: 500 });
    expect(h.series.at(-1)).toEqual({ t: now, v: 600 });
    expect(h.pnl).toBeNull();
    expect(h.pnlPct).toBeNull();
  });
});

describe("lastDays", () => {
  it("starts from the balance at the edge of the range", () => {
    const h = balanceHistory([{ at: 10 * DAY, amount: 1000 }, { at: 95 * DAY, amount: 100 }], 1100, 0, true, now);
    const week = lastDays(h.series, 7, now);
    expect(week[0]).toEqual({ t: 93 * DAY, v: 1000 });
    expect(week.at(-1)).toEqual({ t: now, v: 1100 });
  });
});
