/** Which actions and conditions the router can pair. Moves need the rate gap; the rate gap only moves. */
import { tokenBySymbol } from "@/lib/koul";
import { tokenOf, type Rule } from "./autopilot";

/** The router ignores moves under 1 USDC, so a fixed amount starts there. */
export const MIN_AMOUNT_USDC = 1;

export function pairingProblem(rule: Rule): string | null {
  const hasGap = rule.conditions.some((c) => c.kind === "rate_gap");
  if (rule.action.kind === "move_to_best_pool" && !hasGap) return "Moving to the better hub needs the rate gap as its condition";
  if (rule.action.kind !== "move_to_best_pool" && hasGap) return "The rate gap can only move USDC to the better hub";
  if (rule.conditions.some((c) => c.kind === "rate_gap" && c.comparator !== "gte")) return "The rate gap only works as \"more than\"";
  if (rule.conditions.some((c) => !(c.value > 0))) return "Every level must be above zero";
  // The router's floor would refuse every fill, so the rule could never run.
  if ((rule.action.kind === "buy_token" || rule.action.kind === "withdraw_to_token") && !tokenBySymbol(tokenOf(rule.action)).buys) return `On testnet every route pays under the oracle for ${tokenOf(rule.action)}, so the router refuses buying it. Selling it works.`;
  // A sale is counted in the token sold, so any positive amount; the router skips a swap worth under 1 USD.
  if (rule.action.kind === "sell_token" && typeof rule.action.amount === "number" && !(rule.action.amount > 0)) return "An amount must be above zero";
  if (rule.action.kind !== "sell_token" && typeof rule.action.amount === "number" && !(rule.action.amount >= MIN_AMOUNT_USDC)) return `An amount must be at least ${MIN_AMOUNT_USDC} USDC`;
  if (typeof rule.action.amount === "object" && !(Number.isInteger(rule.action.amount.percent) && rule.action.amount.percent >= 1 && rule.action.amount.percent <= 100)) return "A share is a whole percent between 1 and 100";
  return null;
}
