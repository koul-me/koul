import { describe, expect, it } from "vitest";
import { basketUsd, capitalCheck, capitalOpening, chunkBySize, chunkPairs, commandBytes, counterpartyKind, flagsFor, fxRules, historyEveryMs, HISTORY_PUSHES_PER_DAY, insideMoves, outsideUsd, rank, score, valueUsd, type Prices, type ScoredToken } from "./competition";
import type { Autopilot } from "./schema";

const TOKENS: ScoredToken[] = [
  { symbol: "USDC", id: "C-usdc", decimals: 7, feed: null },
  { symbol: "ETH", id: "C-eth", decimals: 7, feed: "ETH" },
  { symbol: "wBTC", id: "C-wbtc", decimals: 8, feed: "BTC" },
  { symbol: "XLM", id: "C-xlm", decimals: 7, feed: "XLM" },
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

describe("swap edge", () => {
  it("does not count a swap's edge as added capital", () => {
    // 100 in, 94 USD of edge from testnet pools: net in 194, capital still 100.
    expect(flagsFor({ netInUsd: 194, inUsd: 100, outUsd: 0, manualTxs: 0, swapEdgeUsd: 94 }, { autopilotOnly: true, startingCapitalUsd: 100 })).toEqual([]);
    expect(score(194.41, 194).returnPct).toBeCloseTo(0.21, 2);
  });
});

describe("starting basket", () => {
  const BASKET = { USDC: 100, XLM: 10_000 };
  const XLM = (n: number) => (BigInt(n) * 10_000_000n).toString();
  /** The capital check as the indexer runs it: the opening fixed at `open` prices, then the window's outside units. */
  const check = (value: number, open: Prices, before: Record<string, string> = {}, after: Record<string, string> = {}, edge = 0) => {
    const state = { openingPrices: open, capitalOpeningUsd: capitalOpening(value, before, edge, TOKENS, open), outsideUnits: { ...before } };
    for (const [k, v] of Object.entries(after)) state.outsideUnits[k] = (BigInt(state.outsideUnits[k] ?? "0") + BigInt(v)).toString();
    return flagsFor({ netInUsd: 0, inUsd: 0, outUsd: 0, manualTxs: 0 }, { autopilotOnly: true, startingCapitalUsd: 100 }, { capital: capitalCheck(state, BASKET, TOKENS) });
  };
  const at = (xlm: number, usdc: number, price: number) => usdc + xlm * price;

  it("values the basket at the given prices and names a missing price", () => {
    expect(basketUsd(BASKET, TOKENS, { XLM: 0.17 }).usd).toBeCloseTo(1800, 6);
    expect(basketUsd(BASKET, TOKENS, {})).toEqual({ usd: 100, unpriced: ["XLM"] });
  });

  it("does not flag a wallet that holds the basket, at any price", () => {
    expect(check(at(10_000, 100, 0.17), { XLM: 0.17 })).toEqual([]);
    // Created at 0.15, first scored at 0.20: the opening and the basket move together.
    expect(check(at(10_000, 100, 0.2), { XLM: 0.2 })).toEqual([]);
    // 99 idle USDC and 1 supplied to open the XOXNO account, plus a little interest.
    expect(check(at(10_000, 100.0005, 0.17), { XLM: 0.17 })).toEqual([]);
  });

  it("does not flag a wallet created in the window when the price moved before its first scoring", () => {
    // Friendbot XLM and the 100 USDC came in at 0.15; outside units are valued at the opening price, not then.
    const units = { XLM: XLM(10_000), USDC: "1000000000" };
    expect(capitalOpening(at(10_000, 100, 0.2), units, 0, TOKENS, { XLM: 0.2 })).toBe(0);
    expect(check(at(10_000, 100, 0.2), { XLM: 0.2 }, units)).toEqual([]);
  });

  it("flags a wallet that held more XLM than the basket before the window", () => {
    expect(check(at(20_000, 100, 0.17), { XLM: 0.17 })).toEqual(["added capital: 3500.00 USD in at opening prices, starting basket worth 1800.00"]);
  });

  it("does not flag a wallet that spent some of its XLM", () => {
    expect(check(at(5_000, 100, 0.17), { XLM: 0.17 })).toEqual([]);
    expect(check(at(10_000, 100, 0.17), { XLM: 0.17 }, {}, { XLM: "-" + XLM(5_000) })).toEqual([]);
  });

  it("flags XLM sent in from outside during the window", () => {
    expect(check(at(10_000, 100, 0.17), { XLM: 0.17 }, {}, { XLM: XLM(10_000) })).toHaveLength(1);
    // Within the slack: 1% of the basket plus a dollar.
    expect(check(at(10_000, 100, 0.17), { XLM: 0.17 }, {}, { XLM: XLM(100) })).toEqual([]);
  });

  it("leaves the capital check out until the opening is fixed, and without a basket", () => {
    expect(capitalCheck({ outsideUnits: {} }, BASKET, TOKENS)).toBeUndefined();
    expect(capitalCheck({ openingPrices: { XLM: 0.17 }, capitalOpeningUsd: 0, outsideUnits: {} }, undefined, TOKENS)).toBeUndefined();
    expect(outsideUsd({ XLM: XLM(1_000) }, 50, TOKENS, { XLM: 0.2 })).toBeCloseTo(250, 6);
  });
});

describe("moves inside the wallet", () => {
  const sellXlm = [
    { txHash: "a", token: "XLM", incoming: false, amount: 5_000_0000000n, usd: 850 },
    { txHash: "a", token: "USDC", incoming: true, amount: 860_0000000n, usd: 860 },
  ];

  it("counts an autopilot XLM to USDC swap as a swap, with its edge, not as a manual move", () => {
    expect(insideMoves(sellXlm, new Set(["a"]))).toEqual({ manualTxs: 0, swapEdgeUsd: 10 });
    // The same swap by hand.
    expect(insideMoves(sellXlm, new Set())).toEqual({ manualTxs: 1, swapEdgeUsd: 10 });
    // A swap that paid less than the oracle price is a real loss, not negative capital.
    expect(insideMoves([{ ...sellXlm[0]! }, { ...sellXlm[1]!, usd: 840 }], new Set(["a"])).swapEdgeUsd).toBe(0);
  });

  it("lets the 1 USDC that opens the XOXNO account through, and nothing more", () => {
    const supply = (amount: bigint) => [{ txHash: "b", token: "USDC", incoming: false, amount, usd: Number(amount) / 1e7 }];
    expect(insideMoves(supply(1_0000000n), new Set()).manualTxs).toBe(0);
    expect(insideMoves(supply(2_0000000n), new Set()).manualTxs).toBe(1);
  });
});

describe("USD/TRY rules", () => {
  const ap = (...types: ("FxPrice" | "IdleBalance")[]): Pick<Autopilot, "rules"> => ({
    rules: types.map((type) => ({
      conditions: [type === "FxPrice" ? { type, asset: "TRY", cmp: "Below" as const, level: "1", max_age_secs: "900" } : { type, cmp: "AtOrAbove" as const, amount: "1" }],
      match_all: true, action: { type: "WithdrawToWallet" as const, hub: 1, amount: { type: "All" as const } }, cooldown_ledgers: 0,
    })),
  });

  it("counts the rules that read the mock FX oracle", () => {
    expect(fxRules([ap("IdleBalance"), null])).toBe(0);
    expect(fxRules([ap("FxPrice", "IdleBalance"), ap("FxPrice")])).toBe(2);
  });

  it("flags an entry whose autopilot used one", () => {
    expect(flagsFor({ netInUsd: 100, inUsd: 100, outUsd: 0, manualTxs: 0 }, { autopilotOnly: true, startingCapitalUsd: 100 }, { fx: true })).toEqual(["a rule on USD/TRY, a test price the team sets"]);
  });
});

describe("Redis budget", () => {
  const pair = (i: number, n: number): [string, string] => [`koul:comp:score:${i}`, "x".repeat(n)];

  it("packs pairs in order under the byte limit, one MSET per group", () => {
    const pairs = Array.from({ length: 10 }, (_, i) => pair(i, 100));
    const groups = chunkPairs(pairs, 400);
    expect(groups.flat()).toEqual(pairs);
    expect(groups.map((g) => g.length)).toEqual([3, 3, 3, 1]);
    for (const g of groups) expect(g.reduce((n, [k, v]) => n + k.length + v.length + 6, 0)).toBeLessThanOrEqual(400);
  });

  it("sends a pair larger than the limit alone, and nothing for no pairs", () => {
    expect(chunkPairs([pair(1, 10), pair(2, 1000), pair(3, 10)], 400).map((g) => g.length)).toEqual([1, 1, 1]);
    expect(chunkPairs([])).toEqual([]);
  });

  it("counts bytes, not characters", () => {
    expect(chunkPairs([["k", "é".repeat(150)], ["k", "é".repeat(150)]], 400)).toHaveLength(2);
    expect(chunkPairs([["k", "e".repeat(150)], ["k", "e".repeat(150)]], 400)).toHaveLength(1);
  });

  it("puts 300 entries' scores and totals and the board in two MSETs", () => {
    const pairs = Array.from({ length: 300 }, (_, i) => [pair(i, 500), pair(i, 800)]).flat();
    expect(chunkPairs([...pairs, pair(-1, 45_000)])).toHaveLength(2);
  });

  it("groups list commands by their size in the request", () => {
    const cmds = Array.from({ length: 5 }, (_, i) => ["RPUSH", `koul:comp:history:${i}`, "y".repeat(150)]);
    expect(commandBytes(["GET", "k"])).toBe(2 + 6 + 4);
    expect(chunkBySize(cmds, commandBytes, 400).map((g) => g.length)).toEqual([2, 2, 1]);
  });

  it("keeps history hourly up to 300 entries and the pushes a day bounded past it", () => {
    expect(historyEveryMs(1)).toBe(3600_000);
    expect(historyEveryMs(300)).toBe(3600_000);
    expect(historyEveryMs(1000)).toBe(200 * 60_000);
    for (const n of [301, 1000, 5000]) expect((n * 86_400_000) / historyEveryMs(n)).toBeLessThanOrEqual(HISTORY_PUSHES_PER_DAY);
  });
});
