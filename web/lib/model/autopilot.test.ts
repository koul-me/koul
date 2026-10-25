import { describe, expect, it } from "vitest";
import { validateAutopilot } from "@koul/core";
import { XOXNO, tokenBySymbol } from "@/lib/koul";
import { TEMPLATES, foldCoreRules, makeRule, toCoreAutopilot, type Rule } from "./autopilot";

const strip = (rules: Rule[]) => rules.map(({ name, conditions, match, action, cooldownSec }) => ({ name, conditions, match, action, cooldownSec }));

describe("UI rules to the router's autopilot", () => {
  it("maps swap rules onto the router's swap actions with the 1% oracle floor, in each token's own decimals", () => {
    const rules = [
      makeRule({ name: "Sell ETH", conditions: [{ kind: "token_price", comparator: "gte", value: 2500, token: "ETH" }], action: { kind: "sell_token", amount: { percent: 50 }, token: "ETH" }, cooldownSec: 3600 }),
      makeRule({ name: "Sell wBTC", conditions: [{ kind: "token_balance", comparator: "gte", value: 0.5, token: "wBTC" }], action: { kind: "sell_token", amount: 0.25, token: "wBTC" }, cooldownSec: 3600 }),
      makeRule({ name: "Buy SOL", conditions: [{ kind: "token_balance", comparator: "lte", value: 100, token: "XLM" }], action: { kind: "buy_token", amount: 10, token: "SOL" }, cooldownSec: 3600 }),
      makeRule({ name: "Into XLM", conditions: [{ kind: "idle_usdc", comparator: "gte", value: 1 }], action: { kind: "withdraw_to_token", amount: "all", token: "XLM" }, cooldownSec: 600 }),
    ];
    const { autopilot, unsupported, ruleIds } = toCoreAutopilot({ rules }, 106n);
    expect(unsupported).toEqual([]);
    expect(validateAutopilot(autopilot)).toEqual([]);
    const eth = tokenBySymbol("ETH").id, wbtc = tokenBySymbol("wBTC").id, sol = tokenBySymbol("SOL").id;
    expect(autopilot.rules.map((r) => r.action)).toEqual([
      { type: "SwapFromWallet", token_in: eth, token_out: XOXNO.usdc, amount: { type: "Percent", bps: 5000 }, max_slippage_bps: 100 },
      { type: "SwapFromWallet", token_in: wbtc, token_out: XOXNO.usdc, amount: { type: "Fixed", value: "25000000" }, max_slippage_bps: 100 },
      { type: "SwapFromWallet", token_in: XOXNO.usdc, token_out: sol, amount: { type: "Fixed", value: "100000000" }, max_slippage_bps: 100 },
      { type: "WithdrawAndSwap", hub: 1, token_out: XOXNO.xlm, amount: { type: "All" }, max_slippage_bps: 100 },
      { type: "WithdrawAndSwap", hub: 2, token_out: XOXNO.xlm, amount: { type: "All" }, max_slippage_bps: 100 },
    ]);
    expect(autopilot.rules[0]!.conditions).toEqual([{ type: "TokenPrice", token: eth, cmp: "AtOrAbove", level: "250000000000000000" }]);
    expect(autopilot.rules[1]!.conditions).toEqual([{ type: "TokenBalance", token: wbtc, cmp: "AtOrAbove", amount: "50000000" }]);
    expect(ruleIds).toEqual([rules[0]!.id, rules[1]!.id, rules[2]!.id, rules[3]!.id, rules[3]!.id]);
    // And back: tokens, decimals and the per-hub pair folded into one card.
    const folded = foldCoreRules(autopilot);
    expect(strip(folded.rules).map(({ name: _n, ...r }) => r)).toEqual(strip(rules).map(({ name: _n, ...r }) => r));
    expect(folded.rules.map((r) => r.name)).toEqual(["Sell ETH", "Sell wBTC", "Buy SOL", "Into XLM"]);
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
    const rule = makeRule({ name: "Dip", conditions: [{ kind: "token_price", comparator: "lte", value: 0.1523, token: "XLM" }], action: { kind: "buy_token", amount: 5, token: "XLM" }, cooldownSec: 600 });
    const folded = foldCoreRules(toCoreAutopilot({ rules: [rule] }, 1n).autopilot);
    expect(folded.rules[0]!.conditions[0]).toEqual({ kind: "token_price", comparator: "lte", value: 0.1523, token: "XLM" });
    expect(folded.rules[0]!.action).toEqual({ kind: "buy_token", amount: 5, token: "XLM" });
  });
});
