/**
 * The one wording for a rule, wherever it shows: Home, the running tile, the editor, the library, the chat draft.
 * Conditions are mono ("USD/TRY > 50.00"), actions are plain words with the amount in them ("Withdraw 50 USDC to
 * wallet", "Supply 50% of idle to Hub 1").
 */
import { POOLS, amountUnit, fmtPrice, tokenOf, type Action, type Condition, type Rule } from "@/lib/model/autopilot";
import { isPercent } from "@/lib/model/capital";
import { hubName } from "@/lib/model/hubs";

// A level still being typed (an empty field is NaN) reads as a dash, not "NaN".
const n2 = (v: number) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
const n0 = (v: number) => (Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—");

/** `gte` reads as ">" and `lte` as "<", the way the design writes conditions. */
const op = (c: Condition) => (c.comparator === "gte" ? ">" : "<");

export function describeCondition(c: Condition): string {
  switch (c.kind) {
    case "rate_gap": return `rate gap > ${n2(c.value)}%`;
    case "pool_rate": return `${hubName(POOLS[c.pool ?? "B"].hub)} APY ${op(c)} ${n2(c.value)}%`;
    case "health_factor": return `health ${op(c)} ${n2(c.value)}`;
    case "fx_price": return `USD/TRY ${op(c)} ${n2(c.value)}`;
    case "idle_usdc": return `wallet ${op(c)} ${n0(c.value)} USDC`;
    case "token_price": return `${tokenOf(c)} ${op(c)} $${fmtPrice(c.value)}`;
    case "token_balance": return `wallet ${op(c)} ${n0(c.value)} ${tokenOf(c)}`;
  }
}

export function describeConditions(rule: Pick<Rule, "conditions" | "match">): string {
  return rule.conditions.map(describeCondition).join(rule.match === "all" ? " AND " : " OR ");
}

/** "everything" → nothing said, a share → "50%", a fixed amount → "50 USDC" (or "50 XLM" for a sale of a token). */
export function describeAmount(a: Action["amount"], unit = "USDC"): string | null {
  if (a === "all") return null;
  if (isPercent(a)) return `${a.percent}%`;
  return `${n0(a)} ${unit}`;
}

export function describeAction(a: Action): string {
  const amt = describeAmount(a.amount, amountUnit(a));
  const t = tokenOf(a);
  const share = isPercent(a.amount);
  switch (a.kind) {
    case "repay_from_wallet": return amt ? (share ? `Repay ${amt} of debt` : `Repay ${amt}`) : "Repay debt";
    case "withdraw_to_wallet": return amt ? `Withdraw ${amt} to wallet` : "Withdraw to wallet";
    case "move_to_best_pool": return amt ? `Move ${amt} to the better hub` : "Move to the better hub";
    case "supply_from_wallet": {
      const hub = hubName(POOLS[a.pool ?? "B"].hub);
      return amt ? (share ? `Supply ${amt} of idle to ${hub}` : `Supply ${amt} to ${hub}`) : `Supply idle to ${hub}`;
    }
    case "sell_token": return amt ? (share ? `Sell ${amt} of ${t} for USDC` : `Sell ${amt} for USDC`) : `Sell all ${t} for USDC`;
    case "buy_token": return amt ? (share ? `Buy ${t} with ${amt} of idle` : `Buy ${t} with ${amt}`) : `Buy ${t} with idle USDC`;
    case "withdraw_to_token": return amt ? `Swap ${amt} of supplied into ${t}` : `Swap supplied USDC into ${t}`;
  }
}

/** "IF USD/TRY > 50.00 → Withdraw to wallet", for places that want one string. */
export function describeRule(rule: Pick<Rule, "conditions" | "match" | "action">): string {
  return `IF ${describeConditions(rule)} → ${describeAction(rule.action)}`;
}
