import { describe, expect, it } from "vitest";
import { applyEvents, applyLive, cursorLedger, emptyTraction, groupOf, isLoadTest, routerEvent, snapshotOf, swapUsd, TEAM_WALLETS, tractionSummary, type RouterEvent } from "./traction";
import { SWAP_TOKENS, USDC_TESTNET } from "./tokens";

const ETH: string = SWAP_TOKENS.find((t) => t.symbol === "ETH")!.id;
const XLM: string = SWAP_TOKENS.find((t) => t.symbol === "XLM")!.id;
const USDC: string = USDC_TESTNET.id;
const PRICES = { ETH: 4000, XLM: 0.4 };
const A = `CA${"A".repeat(54)}`, B = `CB${"B".repeat(54)}`;
const at = (iso: string) => Date.parse(iso);
/** Event ids as the RPC writes them: a zero-padded TOID and an index, so string order is ledger order. */
const id = (n: number) => `${String(n).padStart(19, "0")}-0000000000`;
const NOW = at("2026-10-31T12:00:00Z");

const set = (n: number, user: string, when: string): RouterEvent => ({ id: id(n), at: at(when), type: "autopilot_set", user, autopilotId: 1, rules: 2 });
const fired = (n: number, user: string, when: string, kind = "swap"): RouterEvent => ({ id: id(n), at: at(when), type: "fired", user, kind, amount: 10_0000000n });
const swap = (n: number, user: string, when: string, tokenIn = USDC, amountIn = 40_0000000n, tokenOut = ETH, amountOut = 500000n): RouterEvent => ({ id: id(n), at: at(when), type: "swapped", user, tokenIn, tokenOut, amountIn, amountOut });

describe("traction aggregation", () => {
  it("keeps what the pools paid out beside the input, and reads state written before it existed", () => {
    // 40 USDC in, 0.05 ETH out ($200 at $4,000): the pool paid five times the oracle price. Then 0.01 ETH in for 180 USDC.
    const s = applyEvents(emptyTraction("R"), [swap(1, A, "2026-10-31T01:00:00Z"), swap(2, A, "2026-10-31T02:00:00Z", ETH, 100000n, USDC, 180_0000000n)], PRICES, NOW);
    expect(s.wallets[0]).toMatchObject({ volumeUsd: 80, volumeOutUsd: 380 });
    expect(s.days["2026-10-31"]![0]).toEqual([0, 2, 80, 0, 0, 380]);
    const old = structuredClone(s);
    delete old.wallets[0]!.volumeOutUsd;
    old.days["2026-10-31"]![0] = [0, 2, 80, 0, 0];
    const sum = tractionSummary(old, [], new Set(), [], NOW);
    expect(sum.organic).toMatchObject({ volumeUsd: 80, volumeOutUsd: 0 });
    expect(sum.days.organic.at(-1)).toMatchObject({ volumeUsd: 80, volumeOutUsd: 0 });
    expect(tractionSummary(s, [], new Set(), [], NOW).wallets[0]).toMatchObject({ volumeUsd: 80, volumeOutUsd: 380 });
  });

  it("reads the router's events and ignores anything else", () => {
    expect(routerEvent("x", 1, ["autopilot_set", A], { autopilot_id: 1, account_id: 7n, rules: 3 })).toEqual({ id: "x", at: 1, type: "autopilot_set", user: A, autopilotId: 1, rules: 3 });
    expect(routerEvent("x", 1, ["swapped", A], { token_in: USDC, token_out: ETH, amount_in: 5n, amount_out: 99n, min_out: 1n })).toMatchObject({ type: "swapped", tokenIn: USDC, amountIn: 5n, amountOut: 99n });
    expect(routerEvent("x", 1, ["fired", A], { branch: "fx" })).toBeNull();
    expect(routerEvent("x", 1, ["transfer", A], { amount: 1n })).toBeNull();
  });

  it("values a swap by its input at the oracle price, never its output", () => {
    expect(swapUsd(USDC, 40_0000000n, PRICES)).toBe(40);
    expect(swapUsd(ETH, 500000n, PRICES)).toBeCloseTo(200, 6);
    expect(swapUsd(ETH, 1n, {})).toBeNull();
    expect(swapUsd("CUNKNOWN", 1n, PRICES)).toBeNull();
  });

  it("reads the ledger out of a paging token", () => {
    expect(cursorLedger("0023104420086546431-4294967295")).toBe(5379416);
  });

  it("counts wallets, saves, runs, swaps and volume per wallet and per UTC day", () => {
    const s = applyEvents(emptyTraction("R"), [
      set(1, A, "2026-10-30T23:50:00Z"), fired(2, A, "2026-10-30T23:55:00Z"), swap(3, A, "2026-10-30T23:55:00Z"),
      fired(4, A, "2026-10-31T00:05:00Z", "supply"), set(5, B, "2026-10-31T09:00:00Z"),
      fired(6, B, "2026-10-31T09:05:00Z"), swap(7, B, "2026-10-31T09:05:00Z", ETH, 100000n, USDC),
      { id: id(8), at: at("2026-10-31T10:00:00Z"), type: "autopilot_cleared", user: B, autopilotId: 1 },
    ], PRICES, NOW);
    const [a, b] = s.wallets;
    expect(a).toMatchObject({ address: A, firstSeen: at("2026-10-30T23:50:00Z"), trades: 2, swaps: 1, volumeUsd: 40, sets: 1, kinds: { swap: 1, supply: 1 }, tokens: ["USDC", "ETH"], lastTrade: at("2026-10-31T00:05:00Z") });
    expect(b).toMatchObject({ trades: 1, swaps: 1, volumeUsd: 40, clears: 1, ids: [1] });
    expect(s.days["2026-10-30"]).toEqual({ 0: [1, 1, 40, 1, 0, 200] });
    expect(s.days["2026-10-31"]).toEqual({ 0: [1, 0, 0, 0, 0], 1: [1, 1, 40, 1, 1, 0.05] });
    expect(s.lastEventId).toBe(id(8));
  });

  it("counts an event once however often it is read", () => {
    const events = [set(1, A, "2026-10-31T01:00:00Z"), fired(2, A, "2026-10-31T01:05:00Z"), swap(3, A, "2026-10-31T01:05:00Z")];
    const once = applyEvents(emptyTraction("R"), events, PRICES, NOW);
    expect(applyEvents(once, events, PRICES, NOW)).toEqual(once);
    // Overlapping batches, as a run that re-reads from an older cursor gets them.
    const split = applyEvents(applyEvents(emptyTraction("R"), events.slice(0, 2), PRICES, NOW), events.slice(1), PRICES, NOW);
    expect(split).toEqual(once);
  });

  it("counts a swap with no price as $0 and says so", () => {
    const s = applyEvents(emptyTraction("R"), [swap(1, A, "2026-10-31T01:00:00Z", XLM, 10_0000000n)], {}, NOW);
    expect(s.wallets[0]!.volumeUsd).toBe(0);
    expect(s.unpriced).toBe(1);
  });

  it("keeps hourly runs for seven days only", () => {
    const s = applyEvents(emptyTraction("R"), [fired(1, A, "2026-10-20T10:00:00Z"), fired(2, A, "2026-10-31T10:30:00Z")], PRICES, NOW);
    expect(Object.keys(s.hours)).toEqual([String(at("2026-10-31T10:00:00Z"))]);
    expect(s.wallets[0]!.trades).toBe(2);
  });

  it("adds wallets only the views know and sets everyone's live counts", () => {
    const s = applyLive(applyEvents(emptyTraction("R"), [set(1, A, "2026-10-31T01:00:00Z")], PRICES, NOW), new Map([[B, { autopilots: 1, rules: 4 }]]));
    expect(s.wallets.map((w) => [w.address, w.firstSeen, w.live])).toEqual([[A, at("2026-10-31T01:00:00Z"), { autopilots: 0, rules: 0 }], [B, null, { autopilots: 1, rules: 4 }]]);
  });
});

describe("traction groups", () => {
  const loop = (user: string, from: number) => [set(from, user, "2026-10-28T14:30:00Z"), fired(from + 1, user, "2026-10-28T14:35:00Z"), swap(from + 2, user, "2026-10-28T14:35:00Z"), fired(from + 3, user, "2026-10-28T14:40:00Z"), swap(from + 4, user, "2026-10-28T14:40:00Z", ETH, 100000n, USDC)];

  it("tags the 2026-10-28 load test pattern and nothing like it outside the window or with other tokens", () => {
    const s = applyEvents(emptyTraction("R"), [...loop(A, 1), set(10, B, "2026-10-28T17:00:00Z"), fired(11, B, "2026-10-28T17:05:00Z"), swap(12, B, "2026-10-28T17:05:00Z")], PRICES, NOW);
    expect(isLoadTest(s.wallets[0]!)).toBe(true);
    expect(isLoadTest(s.wallets[1]!)).toBe(false);
    const xlm = applyEvents(s, [fired(20, A, "2026-10-29T10:00:00Z"), swap(21, A, "2026-10-29T10:00:00Z", USDC, 10_0000000n, XLM)], PRICES, NOW);
    expect(isLoadTest(xlm.wallets[0]!)).toBe(false);
  });

  it("puts the bots and tagged wallets on the team, load test apart, everyone else organic", () => {
    const s = applyEvents(emptyTraction("R"), [...loop(A, 1), set(10, B, "2026-10-31T01:00:00Z"), set(11, TEAM_WALLETS[0], "2026-10-31T02:00:00Z")], PRICES, NOW);
    expect(s.wallets.map((w) => groupOf(w, new Set()))).toEqual(["loadtest", "organic", "team"]);
    expect(groupOf(s.wallets[1]!, new Set([B]))).toBe("team");
    const sum = tractionSummary(s, [], new Set(), [], NOW);
    expect(sum.days.noLoadTest.find((d) => d.day === "2026-10-28")).toMatchObject({ newUsers: 0, trades: 0 });
    expect(sum.days.all.find((d) => d.day === "2026-10-28")).toMatchObject({ newUsers: 1, trades: 2 });
  });
});

describe("traction summary", () => {
  const events = [
    set(1, A, "2026-10-29T10:00:00Z"), fired(2, A, "2026-10-29T10:05:00Z"), swap(3, A, "2026-10-29T10:05:00Z"),
    set(4, B, "2026-10-31T08:00:00Z"), fired(5, B, "2026-10-31T08:05:00Z"), swap(6, B, "2026-10-31T08:05:00Z"), fired(7, B, "2026-10-31T11:05:00Z"),
    set(8, TEAM_WALLETS[0], "2026-10-31T09:00:00Z"), fired(9, TEAM_WALLETS[0], "2026-10-31T09:05:00Z"), swap(10, TEAM_WALLETS[0], "2026-10-31T09:05:00Z", USDC, 1000_0000000n),
  ];
  const state = () => {
    const s = applyLive(applyEvents({ ...emptyTraction("R"), historyFrom: at("2026-10-28T20:00:00Z") }, events, PRICES, NOW), new Map([[A, { autopilots: 1, rules: 2 }], [TEAM_WALLETS[0], { autopilots: 1, rules: 5 }]]));
    s.updatedAt = NOW;
    return s;
  };

  it("splits headlines into organic and team", () => {
    const sum = tractionSummary(state(), [], new Set(), [], NOW);
    expect(sum.organic).toMatchObject({ users: 1, autopilots: 1, rules: 2, usersEver: 2, trades: 3, trades24h: 2, trades7d: 3, swaps: 2, volumeUsd: 80, tradesPerAutopilot: 1.5, kinds: { swap: 3 } });
    expect(sum.team).toMatchObject({ users: 1, rules: 5, trades: 1, volumeUsd: 1000 });
    expect(sum.all).toMatchObject({ users: 2, rules: 7, trades: 4, volumeUsd: 1080 });
  });

  it("moves a wallet tagged later out of organic in every past day", () => {
    const sum = tractionSummary(state(), [], new Set([A]), [], NOW);
    expect(sum.organic.trades).toBe(2);
    expect(sum.days.organic.find((d) => d.day === "2026-10-29")).toMatchObject({ newUsers: 0, trades: 0 });
    expect(sum.days.all.find((d) => d.day === "2026-10-29")).toMatchObject({ newUsers: 1, trades: 1, active: 1, volumeUsd: 40 });
    expect(sum.days.noLoadTest).toEqual(sum.days.all);
  });

  it("has a row for every UTC day from the first event, with cumulative users", () => {
    const sum = tractionSummary(state(), [], new Set(), [], NOW);
    expect(sum.days.organic.map((d) => [d.day, d.newUsers, d.cumulativeUsers, d.trades])).toEqual([["2026-10-29", 1, 1, 1], ["2026-10-30", 0, 1, 0], ["2026-10-31", 1, 2, 2]]);
  });

  it("follows every created wallet to an autopilot and a trade", () => {
    const C = `CC${"C".repeat(54)}`;
    const sum = tractionSummary(state(), [], new Set(), [[A, at("2026-10-29T09:00:00Z")], [C, at("2026-10-30T09:00:00Z")], [TEAM_WALLETS[0], at("2026-10-31T08:00:00Z")]], NOW);
    expect(sum.funnel).toEqual({ since: at("2026-10-29T09:00:00Z"), created: 3, withAutopilot: 2, traded: 2 });
    expect([sum.all.created, sum.organic.created, sum.team.created]).toEqual([3, 2, 1]);
  });

  it("keeps the last snapshot of each day and ranks wallets by trades", () => {
    const s = state();
    const snaps = [snapshotOf(s, new Set(), at("2026-10-31T11:00:00Z"), 3), snapshotOf(s, new Set(), at("2026-10-31T10:00:00Z"), 2), snapshotOf(s, new Set(), at("2026-10-30T10:00:00Z"), 1)];
    const sum = tractionSummary(s, snaps, new Set(), [], NOW);
    expect(sum.live.map((p) => p.ledger)).toEqual([1, 3]);
    expect(sum.live[1]!.organic).toEqual({ users: 1, autopilots: 1, rules: 2 });
    expect(sum.wallets.map((w) => [w.address, w.group])).toEqual([[B, "organic"], [TEAM_WALLETS[0], "team"], [A, "organic"]]);
  });

  it("is empty but whole with nothing stored", () => {
    const sum = tractionSummary(emptyTraction("R"), [], new Set(), [], NOW);
    expect(sum.days.organic).toEqual([]);
    expect(sum.organic.tradesPerAutopilot).toBeNull();
    expect(sum.funnel.since).toBeNull();
  });
});

describe("traction last trade transaction", () => {
  it("keeps the hash of the latest trade whatever order the events came in", () => {
    const withTx = (n: number, when: string, tx: string): RouterEvent => ({ id: id(n), at: at(when), type: "fired", user: A, kind: "swap", amount: 1n, tx });
    const s = applyEvents(emptyTraction("R"), [withTx(2, "2026-10-31T10:00:00Z", "bbb"), withTx(1, "2026-10-31T09:00:00Z", "aaa")], PRICES, NOW);
    expect(s.wallets[0]!.lastTx).toBe("bbb");
    expect(tractionSummary(s, [], new Set(), [], NOW).wallets[0]!.lastTx).toBe("bbb");
  });
});
