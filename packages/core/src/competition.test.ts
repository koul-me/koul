import { describe, expect, it } from "vitest";
import { counterpartyKind, flagsFor, rank, score, valueUsd, type ScoredToken } from "./competition";

const TOKENS: ScoredToken[] = [
  { symbol: "USDC", id: "C-usdc", decimals: 7, feed: null },
  { symbol: "ETH", id: "C-eth", decimals: 7, feed: "ETH" },
  { symbol: "wBTC", id: "C-wbtc", decimals: 8, feed: "BTC" },
];

describe("competition scoring", () => {
  it("values idle USDC, net supplied USDC and tokens at the oracle price", () => {
    const v = valueUsd({ tokens: { USDC: 10_0000000n, ETH: 5000000n, wBTC: 1000000n }, supplied: 50_0000000n, borrowed: 5_0000000n }, TOKENS, { ETH: 2400, BTC: 110_000 });
    // 10 idle + 45 net supplied + 0.5 ETH * 2400 + 0.01 BTC * 110,000
    expect(v.usd).toBeCloseTo(10 + 45 + 1200 + 1100, 6);
    expect(v.unpriced).toEqual([]);
  });

  it("counts an unpriced token as 0 and says so", () => {
    expect(valueUsd({ tokens: { ETH: 1_0000000n }, supplied: 0n, borrowed: 0n }, TOKENS, {})).toEqual({ usd: 0, unpriced: ["ETH"] });
  });

  it("treats classic accounts and other wallets as outside money, protocols as inside", () => {
    const wallets = new Set(["CWALLET2"]);
    expect(counterpartyKind("GABC", (c) => wallets.has(c))).toBe("external");
    expect(counterpartyKind("CWALLET2", (c) => wallets.has(c))).toBe("external");
    expect(counterpartyKind("CXOXNOPOOL", (c) => wallets.has(c))).toBe("internal");
  });

  it("nets out the money that came in", () => {
    expect(score(112, 100)).toEqual({ pnlUsd: 12, returnPct: 12 });
    expect(score(0, 0)).toEqual({ pnlUsd: 0, returnPct: null });
    // A swap into ETH is not a loss: value stays, net in stays.
    expect(score(100, 100).returnPct).toBe(0);
  });

  it("flags manual moves only when the competition is autopilot-only, and added capital always", () => {
    const totals = { netInUsd: 100, inUsd: 100, outUsd: 0, manualTxs: 2 };
    expect(flagsFor(totals, { autopilotOnly: true, startingCapitalUsd: 100 })).toEqual(["2 moves not made by the autopilot"]);
    expect(flagsFor(totals, { autopilotOnly: false, startingCapitalUsd: 100 })).toEqual([]);
    expect(flagsFor({ ...totals, netInUsd: 200, manualTxs: 0 }, { autopilotOnly: false, startingCapitalUsd: 100 })).toEqual(["added capital: 200.00 USD in, 100 allowed"]);
  });

  it("ranks by return, ties share a rank, flagged and empty entries are unranked", () => {
    const r = rank([
      { id: "a", returnPct: 5, flagged: false },
      { id: "b", returnPct: 12, flagged: false },
      { id: "c", returnPct: 5, flagged: false },
      { id: "d", returnPct: 50, flagged: true },
      { id: "e", returnPct: null, flagged: false },
      { id: "f", returnPct: -3, flagged: false },
    ]);
    expect(r.map((x) => [x.id, x.rank])).toEqual([["d", null], ["b", 1], ["a", 2], ["c", 2], ["f", 4], ["e", null]]);
  });
});
