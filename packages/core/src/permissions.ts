import type { Autopilot } from "./schema";
import { validateAutopilot } from "./validate";

export interface AgentPermissions {
  allowedCalls: Array<[contractId: string, method: string]>;
  transferRecipients: string[];
  descriptions: string[];
}
export interface PermissionContracts { router: string; controller: string; pool: string; usdc: string; aggregator?: string }

/**
 * Union of the calls that the autopilot can make, including XOXNO's token transfer to its pool and, for swaps, the
 * aggregator's pull of the input token. Every one of them is only usable inside a router tick (the policy's session).
 */
export function permissionsFor(ap: Autopilot, contracts: PermissionContracts): AgentPermissions {
  const errors = validateAutopilot(ap);
  if (errors.length) throw new Error(errors.join("; "));
  const kinds = new Set(ap.rules.map((r) => r.action.type));
  const allowedCalls: AgentPermissions["allowedCalls"] = [[contracts.router, "tick"]];
  const descriptions = ["Check and run the first eligible autopilot rule"];
  const needsWithdraw = kinds.has("MoveSupply") || kinds.has("RepayWithCollateral") || kinds.has("WithdrawToWallet") || kinds.has("WithdrawAndSwap");
  const needsSupply = kinds.has("MoveSupply") || kinds.has("SupplyFromWallet");
  const needsRepay = kinds.has("RepayFromWallet") || kinds.has("RepayWithCollateral");
  if (needsWithdraw) { allowedCalls.push([contracts.controller, "withdraw"]); descriptions.push("Withdraw USDC from your own XOXNO position to your wallet"); }
  if (needsSupply) { allowedCalls.push([contracts.controller, "supply"]); descriptions.push(kinds.has("SupplyFromWallet") ? "Put idle USDC from your wallet into your own XOXNO position" : "Supply wallet USDC to your own XOXNO position"); }
  if (needsRepay) { allowedCalls.push([contracts.controller, "repay"]); descriptions.push("Repay debt on your own XOXNO position"); }
  const swapInputs = [...new Set(ap.rules.flatMap((r) => r.action.type === "SwapFromWallet" ? [r.action.token_in] : r.action.type === "WithdrawAndSwap" ? [contracts.usdc] : []))];
  if (swapInputs.length && !contracts.aggregator) throw new Error("A swap rule needs the aggregator address");
  if (swapInputs.length) { allowedCalls.push([contracts.aggregator!, "execute_strategy"]); descriptions.push("Swap tokens in your wallet through the XOXNO aggregator, paid back to your wallet, never below the oracle price less your slippage"); }
  const transferTokens = [...new Set([...(needsSupply || needsRepay ? [contracts.usdc] : []), ...swapInputs])];
  for (const token of transferTokens) allowedCalls.push([token, "transfer"]);
  if (needsSupply || needsRepay) descriptions.push("Transfer USDC from your wallet to the XOXNO pool");
  if (swapInputs.length) descriptions.push("Hand a swap's input to the aggregator");
  const transferRecipients = [...(needsSupply || needsRepay ? [contracts.pool] : []), ...(swapInputs.length ? [contracts.aggregator!] : [])];
  return { allowedCalls, transferRecipients, descriptions };
}
