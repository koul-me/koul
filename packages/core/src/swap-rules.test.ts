import { describe, expect, it } from "vitest";
import { decodeAutopilot, encodeAutopilot } from "./codec";
import { permissionsFor } from "./permissions";
import { type Autopilot } from "./schema";
import { validateAutopilot } from "./validate";

const XLM = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const USDC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const AGG = "CDNTWMWW2WGYTKIZTJYNGNVQQZI4KTC5BQRZ3275KESRX5T4O3AYECL5";
const ap: Autopilot = { account_id: "12", rules: [
  { conditions: [{ type: "TokenPrice", token: XLM, cmp: "Below", level: "15000000000000" }], match_all: true, action: { type: "SwapFromWallet", token_in: XLM, token_out: USDC, amount: { type: "Fixed", value: "5000000" }, max_slippage_bps: 100 }, cooldown_ledgers: 30 },
  { conditions: [{ type: "TokenBalance", token: XLM, cmp: "Below", amount: "10000000" }], match_all: true, action: { type: "WithdrawAndSwap", hub: 1, token_out: XLM, amount: { type: "Percent", bps: 2500 }, max_slippage_bps: 200 }, cooldown_ledgers: 300 },
] };

describe("swap rules", () => {
  it("round trip through the contract codec", () => {
    expect(validateAutopilot(ap)).toEqual([]);
    expect(decodeAutopilot(encodeAutopilot(ap))).toEqual(ap);
  });
  it("reject the same token on both sides and slippage outside 1..2000 bps", () => {
    const swap = ap.rules[0]!;
    expect(validateAutopilot({ ...ap, rules: [{ ...swap, action: { ...swap.action, token_out: XLM } }] })).toContain("rules.0.action: tokens must differ");
    expect(validateAutopilot({ ...ap, rules: [{ ...swap, action: { ...swap.action, max_slippage_bps: 2001 } }] }).length).toBe(1);
  });
  it("grant the aggregator and each input token's transfer to it, nothing else", () => {
    const p = permissionsFor(ap, { router: "router", controller: "controller", pool: "pool", usdc: USDC, aggregator: AGG });
    expect(p.allowedCalls).toEqual([["router", "tick"], ["controller", "withdraw"], [AGG, "execute_strategy"], [XLM, "transfer"], [USDC, "transfer"]]);
    expect(p.transferRecipients).toEqual([AGG]);
    expect(() => permissionsFor(ap, { router: "router", controller: "controller", pool: "pool", usdc: USDC })).toThrow(/aggregator/);
  });
});
