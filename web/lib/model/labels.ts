/**
 * The compact voice of a rule row: `IF health < 1.25 → Repay debt · NOW 2.10`. Conditions and observed values
 * are mono, actions are plain words. Nothing here is a sentence.
 */
import { tokenBySymbol, usdPerTryToTryPerUsd } from "@/lib/koul";
import { aprToApy, fmtPrice, tokenOf, type Action, type Condition, type ConditionKind, type LiveValues } from "./autopilot";

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export { describeCondition as conditionCompact, describeConditions as conditionsCompact, describeAction as actionShort } from "@/lib/rules/describe";

/** The subject a condition reads, for the editor pickers. */
export const CONDITION_SUBJECTS: { kind: ConditionKind; label: string; unit: string }[] = [
  { kind: "fx_price", label: "USD/TRY", unit: "" },
  { kind: "health_factor", label: "health", unit: "" },
  { kind: "rate_gap", label: "rate gap", unit: "%" },
  { kind: "idle_usdc", label: "wallet", unit: "USDC" },
  { kind: "pool_rate", label: "hub APY", unit: "%" },
  { kind: "token_price", label: "token price", unit: "USD" },
  { kind: "token_balance", label: "token held", unit: "" },
];

export const ACTION_CHOICES: { kind: Action["kind"]; label: string }[] = [
  { kind: "withdraw_to_wallet", label: "Withdraw to wallet" },
  { kind: "repay_from_wallet", label: "Repay debt" },
  { kind: "move_to_best_pool", label: "Move to the better hub" },
  { kind: "supply_from_wallet", label: "Supply to a hub" },
  { kind: "sell_token", label: "Sell a token for USDC" },
  { kind: "buy_token", label: "Buy a token with USDC" },
  { kind: "withdraw_to_token", label: "Swap supplied USDC into a token" },
];

const NO_DEBT = 10n ** 30n;

/**
 * The live value beside a rule, from the router's `check` (`observed`, in contract units) or from the app's own
 * reads. Returns the text after "NOW": `2.10`, `48.79`, `4.20%`, `50.00 USDC`.
 */
export function observedLabel(c: Pick<Condition, "kind" | "token">, observed: bigint | null): string | null {
  if (observed === null) return null;
  switch (c.kind) {
    case "health_factor": return observed >= NO_DEBT ? "NO DEBT" : n2(Number(observed) / 1e18);
    case "rate_gap": return `${n2(Math.abs(Number(observed)) / 100)}%`;
    case "pool_rate": return `${n2(aprToApy(Number(observed) / 100))}%`;
    case "fx_price": return observed === 0n ? null : n2(usdPerTryToTryPerUsd(observed));
    case "idle_usdc": return `${n2(Number(observed) / 1e7)} USDC`;
    case "token_price": return observed === 0n ? null : `$${fmtPrice(Number(observed) / 1e14)}`;
    case "token_balance": { const t = tokenBySymbol(tokenOf(c)); return `${n2(Number(observed) / 10 ** t.decimals)} ${t.symbol}`; }
  }
}

/** The same label from the app's live numbers, for rules that are not on-chain yet. */
export function liveLabel(c: Condition, live: Pick<LiveValues, "rateA" | "rateB" | "healthFactor" | "hasLoan" | "fx" | "idleUsdc" | "prices" | "holdings">): string | null {
  switch (c.kind) {
    case "health_factor": return !live.hasLoan ? "NO DEBT" : live.healthFactor === null ? null : n2(live.healthFactor);
    case "rate_gap": return live.rateA === null || live.rateB === null ? null : `${n2(Math.abs(live.rateB - live.rateA))}%`;
    case "pool_rate": { const apr = (c.pool ?? "B") === "A" ? live.rateA : live.rateB; return apr === null ? null : `${n2(aprToApy(apr))}%`; }
    case "fx_price": return live.fx === null || live.fx <= 0 ? null : n2(live.fx);
    case "idle_usdc": return live.idleUsdc === null ? null : `${n2(live.idleUsdc)} USDC`;
    case "token_price": { const p = live.prices[tokenOf(c)]; return p ? `$${fmtPrice(p.usd)}` : null; }
    case "token_balance": { const h = live.holdings[tokenOf(c)]; return h === undefined ? null : `${n2(h)} ${tokenOf(c)}`; }
  }
}

/** "2H", "35M", "3D" for the RAN … AGO marker and the Activity tile. */
export function agoShort(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return `${s}S`;
  if (s < 3600) return `${Math.floor(s / 60)}M`;
  if (s < 86400) return `${Math.floor(s / 3600)}H`;
  return `${Math.floor(s / 86400)}D`;
}

/** "10m", "1h", "6h", "1d" for the WAIT picker and the row. */
export function cooldownShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/** "TODAY", "YESTERDAY", "SAT 20 SEP": the sticky day header on Activity. */
export function dayLabel(at: number, now = Date.now()): string {
  const d = new Date(at);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return "YESTERDAY";
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`.toUpperCase();
}

/** "TODAY 14:02", "SAT 21:15", "12 SEP 09:10". */
export function whenLabel(at: number, now = Date.now()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `TODAY ${time}`;
  const days = (now - at) / 86_400_000;
  if (days < 6) return `${d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} ${time}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase()} ${time}`;
}
