import { describe, expect, it } from "vitest";
import { amountOf, base, betterPool, collateral, conditionsHold, debtForHealth, health, holds, reading, run, walk, type World } from "./engine";
import { makeRule, type Action, type Rule } from "@/lib/model/autopilot";

// Collateral 400 against a debt of 250 at 0.8 LTV is a health of 1.28.
const world: World = { gap: 1.5, price: 48.79, wallet: 200, poolA: 300, poolB: 100, debt: 250 };
const rule = (conditions: Rule["conditions"], action: Action, match: "all" | "any" = "all") => makeRule({ name: "r", conditions, action, match });

describe("reading and holds", () => {
  it("reads each subject from the world", () => {
    expect(reading("health_factor", world)).toBeCloseTo(1.28, 5);
    expect(reading("rate_gap", world)).toBe(1.5);
    expect(reading("fx_price", world)).toBe(48.79);
    expect(reading("idle_usdc", world)).toBe(200);
    expect(reading("pool_rate", world, "A")).toBe(4);
    expect(reading("pool_rate", world, "B")).toBe(5.5);
  });
  it("compares at or above, and at or below", () => {
    expect(holds({ kind: "health_factor", comparator: "lte", value: 1.5 }, world)).toBe(true);
    expect(holds({ kind: "health_factor", comparator: "lte", value: 1.2 }, world)).toBe(false);
    expect(holds({ kind: "fx_price", comparator: "gte", value: 48.79 }, world)).toBe(true);
  });
  it("joins conditions with all or any", () => {
    const cs: Rule["conditions"] = [{ kind: "health_factor", comparator: "lte", value: 1.5 }, { kind: "idle_usdc", comparator: "gte", value: 5000 }];
    expect(conditionsHold({ conditions: cs, match: "all" }, world)).toBe(false);
    expect(conditionsHold({ conditions: cs, match: "any" }, world)).toBe(true);
    expect(conditionsHold({ conditions: [], match: "all" }, world)).toBe(false);
  });
});

describe("base and amountOf", () => {
  it("draws each action from its own pot", () => {
    expect(base({ kind: "supply_from_wallet", amount: "all" }, world)).toBe(200);
    expect(base({ kind: "repay_from_wallet", amount: "all" }, world)).toBe(200); // the wallet, not the whole debt
    expect(base({ kind: "withdraw_to_wallet", amount: "all" }, world)).toBe(400);
    expect(base({ kind: "move_to_best_pool", amount: "all" }, world)).toBe(300); // B pays more, so A is moved
  });
  it("takes everything, a share, or a fixed amount capped by the pot", () => {
    expect(amountOf({ kind: "supply_from_wallet", amount: "all" }, world)).toBe(200);
    expect(amountOf({ kind: "supply_from_wallet", amount: { percent: 25 } }, world)).toBe(50);
    expect(amountOf({ kind: "supply_from_wallet", amount: 60 }, world)).toBe(60);
    expect(amountOf({ kind: "supply_from_wallet", amount: 9999 }, world)).toBe(200);
  });
  it("moves to whichever pool pays more", () => {
    expect(betterPool(world)).toBe("B");
    expect(betterPool({ ...world, gap: -2 })).toBe("A");
    expect(base({ kind: "move_to_best_pool", amount: "all" }, { ...world, gap: -2 })).toBe(100);
  });
});

describe("health follows the position", () => {
  it("is collateral against debt, and infinite with no loan", () => {
    expect(collateral(world)).toBe(400);
    expect(health(world)).toBeCloseTo(1.28, 5);
    expect(health({ ...world, debt: 0 })).toBe(Infinity);
    expect(health({ ...world, poolA: 0, poolB: 0 })).toBe(0);
  });
  it("rises when the loan is repaid", () => {
    const after = run({ kind: "repay_from_wallet", amount: "all" }, world).world;
    expect(after.debt).toBe(50);
    expect(health(after)).toBeCloseTo(6.4, 5);
  });
  it("falls when collateral leaves", () => {
    const after = run({ kind: "withdraw_to_wallet", amount: { percent: 50 } }, world).world;
    expect(collateral(after)).toBe(200);
    expect(health(after)).toBeCloseTo(0.64, 5);
  });
  it("does not move when USDC only changes pools", () => {
    const after = run({ kind: "move_to_best_pool", amount: "all" }, world).world;
    expect(health(after)).toBeCloseTo(health(world), 5);
  });
  it("turns a wanted health back into a debt, and leaves it alone with no collateral", () => {
    expect(debtForHealth(world, 2)).toBe(160);
    expect(health({ ...world, debt: debtForHealth(world, 2) })).toBeCloseTo(2, 5);
    expect(debtForHealth({ ...world, poolA: 0, poolB: 0 }, 2)).toBe(250);
  });
});

describe("run", () => {
  it("supplies from the wallet into a pool", () => {
    const r = run({ kind: "supply_from_wallet", amount: 50, pool: "B" }, world);
    expect(r.world.wallet).toBe(150);
    expect(r.world.poolB).toBe(150);
    expect(r.text).toBe("Supplied 50.00 USDC to Pool 2");
  });
  it("repays from the wallet, never more than the debt", () => {
    const r = run({ kind: "repay_from_wallet", amount: "all" }, { ...world, wallet: 400, debt: 250 });
    expect(r.moved).toBe(250);
    expect(r.world.debt).toBe(0);
    expect(r.world.wallet).toBe(150);
    expect(health(r.world)).toBe(Infinity);
  });
  it("never drives a balance below zero, whatever the amount asks for", () => {
    const odd: World = { ...world, wallet: 33.333, poolA: 12.005, poolB: 0, debt: 500 };
    for (const action of [{ kind: "supply_from_wallet", amount: 9999 }, { kind: "withdraw_to_wallet", amount: "all" }, { kind: "repay_from_wallet", amount: { percent: 100 } }] as const) {
      const r = run(action, odd);
      expect(Math.min(r.world.wallet, r.world.poolA, r.world.poolB, r.world.debt)).toBeGreaterThanOrEqual(0);
    }
  });
  it("withdraws from both pools in proportion", () => {
    const r = run({ kind: "withdraw_to_wallet", amount: 100 }, world);
    expect(r.world.poolA).toBe(225);
    expect(r.world.poolB).toBe(75);
    expect(r.world.wallet).toBe(300);
  });
  it("moves the worse pool into the better one", () => {
    const r = run({ kind: "move_to_best_pool", amount: { percent: 50 } }, world);
    expect(r.world.poolA).toBe(150);
    expect(r.world.poolB).toBe(250);
  });
});

describe("walk: first match runs", () => {
  const exit = rule([{ kind: "fx_price", comparator: "gte", value: 50 }], { kind: "withdraw_to_wallet", amount: "all" });
  const guard = rule([{ kind: "health_factor", comparator: "lte", value: 1.5 }], { kind: "repay_from_wallet", amount: "all" });

  it("runs nothing when no condition holds", () => {
    expect(walk([exit], world)).toEqual({ index: null, matched: [], skipped: [] });
  });
  it("runs whichever matching rule is on top, so the order decides", () => {
    const w = { ...world, price: 51 };
    const first = walk([exit, guard], w);
    const flipped = walk([guard, exit], w);
    expect(first).toEqual({ index: 0, matched: [0, 1], skipped: [] });
    expect(flipped).toEqual({ index: 0, matched: [0, 1], skipped: [] });
    expect([exit, guard][first.index!]!.action.kind).toBe("withdraw_to_wallet");
    expect([guard, exit][flipped.index!]!.action.kind).toBe("repay_from_wallet");
  });
  it("walks past a match with nothing to move", () => {
    const w = { ...world, price: 51, wallet: 0 }; // guard first, but the wallet is empty
    expect(walk([guard, exit], w)).toEqual({ index: 1, matched: [0, 1], skipped: [0] });
  });
  it("ignores a rule that is off", () => {
    const off = { ...guard, enabled: false };
    expect(walk([off, exit], { ...world, price: 51 })).toEqual({ index: 1, matched: [1], skipped: [] });
  });
});
