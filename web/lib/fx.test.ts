import { describe, expect, it, vi } from "vitest";
import { FX_OFF_NOTE, FX_ON, fxProblem } from "./fx";
import { answerLocally } from "@/lib/chat/fallback";
import { parseSentence } from "@/lib/sentence";
import { TEMPLATES, foldCoreRules, makeRule, type Rule } from "@/lib/model/autopilot";

// USD/TRY off, as it ships, whatever the shell says.
vi.hoisted(() => { delete process.env.NEXT_PUBLIC_KOUL_FX; });

const live = { fx: 48.79, healthFactor: 2.1, hasLoan: true, rateA: 3.1, rateB: 4.2, idleUsdc: 50, prices: { XLM: 0.17 }, holdings: { XLM: 120 } };
const fxRule: Rule = makeRule({ name: "Lira exit", conditions: [{ kind: "fx_price", comparator: "gte", value: 50 }], action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 600 });
const health: Rule = makeRule({ name: "Stay safe", conditions: [{ kind: "health_factor", comparator: "lte", value: 1.25 }], action: { kind: "repay_from_wallet", amount: "all" }, cooldownSec: 600 });

describe("USD/TRY off", () => {
  it("is off by default", () => expect(FX_ON).toBe(false));
  it("refuses a rule that reads USD/TRY, with a readable reason", () => {
    expect(fxProblem(fxRule)).toMatch(/^USD\/TRY is not available right now\./);
    expect(fxProblem(fxRule)).not.toContain(":");
    expect(fxProblem(health)).toBeNull();
  });
  it("offers no template that reads USD/TRY", () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
    for (const t of TEMPLATES) expect(t.rules().some((r) => r.conditions.some((c) => c.kind === "fx_price"))).toBe(false);
  });
  it("the keyword parser places no USD/TRY rule", () => {
    const r = parseSentence("Pull everything back to my wallet if USD/TRY passes 50");
    expect(r.rules).toEqual([]);
    expect(r.unplaced.length).toBe(1);
  });
  it("the local answerer says USD/TRY is not available", () => {
    for (const text of ["Exit if the lira drops", "Pull everything back to my wallet if USD/TRY passes 50"]) {
      const r = answerLocally([{ role: "user", text }], [health], "live", live);
      expect(r.kind).toBe("unsupported");
      expect(r.message.startsWith(FX_OFF_NOTE)).toBe(true);
      expect(r.message).not.toContain("USD/TRY,");
    }
  });
  it("a USD/TRY rule read back from the chain still renders", () => {
    const { rules } = foldCoreRules({ account_id: "12", rules: [{ conditions: [{ type: "FxPrice", asset: "TRY", cmp: "Below", level: "2000000000000", max_age_secs: "900" }], match_all: true, action: { type: "WithdrawToWallet", hub: 1, amount: { type: "All" } }, cooldown_ledgers: 120 }] });
    expect(rules[0]).toMatchObject({ name: "Withdraw", conditions: [{ kind: "fx_price", comparator: "gte", value: 50 }] });
    expect(fxProblem(rules[0]!)).not.toBeNull();
  });
});
