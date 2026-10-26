import { describe, expect, it } from "vitest";
import { makeRule, toCoreAutopilot, type Condition } from "./autopilot";
import { pairingProblem } from "./pairing";
import { describeRule } from "@/lib/rules/describe";

// The level field holds NaN while it is empty (backspace over the number); nothing that renders may throw on it.
const kinds: Condition[] = [
  { kind: "health_factor", comparator: "lte", value: NaN },
  { kind: "fx_price", comparator: "gte", value: NaN },
  { kind: "idle_usdc", comparator: "gte", value: NaN },
  { kind: "rate_gap", comparator: "gte", value: NaN },
  { kind: "pool_rate", comparator: "lte", value: NaN, pool: "B" },
  { kind: "token_price", comparator: "lte", value: NaN, token: "ETH" },
  { kind: "token_balance", comparator: "gte", value: NaN, token: "wBTC" },
];

describe("an empty level", () => {
  for (const c of kinds) {
    it(`does not throw for ${c.kind}`, () => {
      const rule = makeRule({ name: "r", conditions: [c], action: c.kind === "rate_gap" ? { kind: "move_to_best_pool", amount: "all" } : { kind: "withdraw_to_wallet", amount: "all" } });
      expect(() => toCoreAutopilot({ rules: [rule] }, 1n)).not.toThrow();
      expect(toCoreAutopilot({ rules: [rule] }, 1n).unsupported).toEqual([rule]);
      expect(pairingProblem(rule)).toMatch(/above zero/);
      expect(describeRule(rule)).not.toMatch(/NaN/);
    });
  }
});
