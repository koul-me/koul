import { describe, expect, it } from "vitest";
import { KOUL, XOXNO } from "@/lib/koul";
import { grantCovers } from "./access";
import { makeRule, toCoreAutopilot } from "./autopilot";

const supply = makeRule({ name: "Put it to work", conditions: [{ kind: "idle_usdc", comparator: "gte", value: 10 }], action: { kind: "supply_from_wallet", amount: "all", pool: "B" } });
const sellXlm = makeRule({ name: "Sell XLM", conditions: [{ kind: "token_price", comparator: "gte", value: 0.3, token: "XLM" }], action: { kind: "sell_token", amount: "all", token: "XLM" } });
const grantFor = (rules: typeof supply[]) => {
  const ap = toCoreAutopilot({ rules }, 106n).autopilot;
  return { ap, params: { accountId: "106", allowedCalls: [[KOUL.router, "tick"], [XOXNO.controller, "supply"], [XOXNO.usdc, "transfer"]] as [string, string][], transferRecipients: [XOXNO.pool], maxCallsPerWindow: 40, windowLedgers: 2000 } };
};

describe("an existing key covers new rules", () => {
  it("when it already allows every call and recipient they need", () => {
    const { ap, params } = grantFor([supply]);
    expect(grantCovers(params, ap)).toBe(true);
  });
  it("not when a swap is added: the aggregator and the XLM transfer are missing", () => {
    const { params } = grantFor([supply]);
    expect(grantCovers(params, toCoreAutopilot({ rules: [supply, sellXlm] }, 106n).autopilot)).toBe(false);
  });
  it("not for another XOXNO account, nor without a key", () => {
    const { ap, params } = grantFor([supply]);
    expect(grantCovers({ ...params, accountId: "7" }, ap)).toBe(false);
    expect(grantCovers(null, ap)).toBe(false);
  });
});
