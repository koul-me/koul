import { describe, expect, it } from "vitest";
import { validateAutopilot } from "@koul/core";
import { XOXNO } from "@/lib/koul";
import { TEMPLATES, foldCoreRules, makeRule, toCoreAutopilot, type Rule } from "./autopilot";

const strip = (rules: Rule[]) => rules.map(({ name, conditions, match, action, cooldownSec }) => ({ name, conditions, match, action, cooldownSec }));

describe("UI rules to the router's autopilot", () => {
  it("maps swap rules onto the router's swap actions with the 1% oracle floor", () => {
    const rules = [
      makeRule({ name: "Sell XLM", conditions: [{ kind: "xlm_price", comparator: "gte", value: 0.25 }], action: { kind: "sell_xlm", amount: { percent: 50 } }, cooldownSec: 3600 }),
      makeRule({ name: "Buy XLM", conditions: [{ kind: "xlm_balance", comparator: "lte", value: 100 }], action: { kind: "buy_xlm", amount: 10 }, cooldownSec: 3600 }),
      makeRule({ name: "Into XLM", conditions: [{ kind: "idle_usdc", comparator: "gte", value: 1 }], action: { kind: "withdraw_to_xlm", amount: "all" }, cooldownSec: 600 }),
    ];
    const { autopilot, unsupported, ruleIds } = toCoreAutopilot({ rules }, 106n);
    expect(unsupported).toEqual([]);
    expect(validateAutopilot(autopilot)).toEqual([]);
    expect(autopilot.rules.map((r) => r.action)).toEqual([
      { type: "SwapFromWallet", token_in: XOXNO.xlm, token_out: XOXNO.usdc, amount: { type: "Percent", bps: 5000 }, max_slippage_bps: 100 },
      { type: "SwapFromWallet", token_in: XOXNO.usdc, token_out: XOXNO.xlm, amount: { type: "Fixed", value: "100000000" }, max_slippage_bps: 100 },
      { type: "WithdrawAndSwap", hub: 1, token_out: XOXNO.xlm, amount: { type: "All" }, max_slippage_bps: 100 },
      { type: "WithdrawAndSwap", hub: 2, token_out: XOXNO.xlm, amount: { type: "All" }, max_slippage_bps: 100 },
    ]);
    expect(autopilot.rules[0]!.conditions).toEqual([{ type: "TokenPrice", token: XOXNO.xlm, cmp: "AtOrAbove", level: "25000000000000" }]);
    expect(autopilot.rules[1]!.conditions).toEqual([{ type: "TokenBalance", token: XOXNO.xlm, cmp: "Below", amount: "1000000000" }]);
    expect(ruleIds).toEqual([rules[0]!.id, rules[1]!.id, rules[2]!.id, rules[2]!.id]);
  });

  it("reads every template back from the chain as the same cards, per-hub pairs folded", () => {
    for (const t of TEMPLATES) {
      const rules = t.rules();
      const { autopilot } = toCoreAutopilot({ rules }, 12n);
      expect(validateAutopilot(autopilot)).toEqual([]);
      const folded = foldCoreRules(autopilot);
      expect(strip(folded.rules).map(({ name: _n, ...r }) => r)).toEqual(strip(rules).map(({ name: _n, ...r }) => r));
      expect(folded.contractToUi.length).toBe(autopilot.rules.length);
    }
  });

  it("keeps an XLM price to four decimals both ways", () => {
    const rule = makeRule({ name: "Dip", conditions: [{ kind: "xlm_price", comparator: "lte", value: 0.1523 }], action: { kind: "buy_xlm", amount: 5 }, cooldownSec: 600 });
    const folded = foldCoreRules(toCoreAutopilot({ rules: [rule] }, 1n).autopilot);
    expect(folded.rules[0]!.conditions[0]).toEqual({ kind: "xlm_price", comparator: "lte", value: 0.1523 });
    expect(folded.rules[0]!.action).toEqual({ kind: "buy_xlm", amount: 5 });
  });
});
