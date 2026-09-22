/**
 * The playground's engine: the same walk the router does, in the browser, on invented numbers. Rules are checked
 * top to bottom; the first one whose conditions hold and whose action has something to move is the one that runs,
 * and the rest are left alone. Pure, so the page can show exactly what it computes.
 */
import { POOLS, type Action, type Condition, type ConditionKind, type PoolId, type Rule } from "@/lib/model/autopilot";
import { isPercent } from "@/lib/model/capital";

/** Everything the playground's rules can read, and the mock position they act on. All invented. */
export interface World {
  /** Loan health, liquidation at 1.00. */
  health: number;
  /** The difference between what the two pools pay, in percent points. Pool B is the better one. */
  gap: number;
  /** A price feed, quoted the way the app quotes USD/TRY. */
  price: number;
  /** Idle USDC in the wallet. */
  wallet: number;
  poolA: number;
  poolB: number;
  debt: number;
}

/** What the lower-paying pool pays; the better one pays this plus the gap. */
export const BASE_RATE = 4;
/** The router ignores moves under a whole USDC. */
export const MIN_MOVE = 1;

export const rateOf = (w: World, pool: PoolId) => (pool === "A" ? BASE_RATE : BASE_RATE + w.gap);
export const betterPool = (w: World): PoolId => (w.gap >= 0 ? "B" : "A");

/** The number a condition reads right now. */
export function reading(kind: ConditionKind, w: World, pool: PoolId = "B"): number {
  switch (kind) {
    case "health_factor": return w.health;
    case "rate_gap": return Math.abs(w.gap);
    case "fx_price": return w.price;
    case "idle_usdc": return w.wallet;
    case "pool_rate": return rateOf(w, pool);
  }
}

export function holds(c: Condition, w: World): boolean {
  const v = reading(c.kind, w, c.pool ?? "B");
  return c.comparator === "gte" ? v >= c.value : v <= c.value;
}

/** All of the conditions, or any of them, as the rule says. */
export function conditionsHold(rule: Pick<Rule, "conditions" | "match">, w: World): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.match === "any" ? rule.conditions.some((c) => holds(c, w)) : rule.conditions.every((c) => holds(c, w));
}

/** The pot an action draws from: the wallet, the debt, what is supplied, or the worse pool for a move. */
export function base(action: Action, w: World): number {
  switch (action.kind) {
    case "supply_from_wallet": return w.wallet;
    case "repay_from_wallet": return Math.min(w.wallet, w.debt);
    case "withdraw_to_wallet": return w.poolA + w.poolB;
    case "move_to_best_pool": return betterPool(w) === "B" ? w.poolA : w.poolB;
  }
}

/** How much of that pot the rule takes: everything, a share of it, or a fixed amount capped by it. */
export function amountOf(action: Action, w: World): number {
  const pot = base(action, w);
  const want = action.amount === "all" ? pot : isPercent(action.amount) ? (pot * action.amount.percent) / 100 : Math.min(action.amount, pot);
  return Math.max(0, Math.round(Math.min(want, pot) * 100) / 100);
}

export interface Ran { world: World; moved: number; text: string }

/** The world after the action, and the sentence the page shows for it. */
export function run(action: Action, w: World): Ran {
  const moved = amountOf(action, w);
  const next = { ...w };
  switch (action.kind) {
    case "supply_from_wallet": {
      const pool = action.pool ?? "B";
      next.wallet -= moved;
      if (pool === "A") next.poolA += moved; else next.poolB += moved;
      return { world: next, moved, text: `Supplied ${moved.toFixed(2)} USDC to Hub ${POOLS[pool].hub}` };
    }
    case "repay_from_wallet":
      next.wallet -= moved;
      next.debt -= moved;
      return { world: next, moved, text: `Repaid ${moved.toFixed(2)} USDC of the loan` };
    case "withdraw_to_wallet": {
      // Taken from the pools in proportion, the way a withdrawal across hubs lands.
      const supplied = w.poolA + w.poolB;
      const fromA = supplied === 0 ? 0 : (moved * w.poolA) / supplied;
      next.poolA -= fromA;
      next.poolB -= moved - fromA;
      next.wallet += moved;
      return { world: next, moved, text: `Withdrew ${moved.toFixed(2)} USDC to the wallet` };
    }
    case "move_to_best_pool": {
      const to = betterPool(w);
      if (to === "B") { next.poolA -= moved; next.poolB += moved; } else { next.poolB -= moved; next.poolA += moved; }
      return { world: next, moved, text: `Moved ${moved.toFixed(2)} USDC to Hub ${POOLS[to].hub}` };
    }
  }
}

export interface Walk {
  /** The rule that runs, or null when none does. */
  index: number | null;
  /** Every rule whose conditions hold, in order, whether or not it runs. */
  matched: number[];
  /** Matched, but with nothing to move, so the router walks past it. */
  skipped: number[];
}

/** The router's walk: first match wins, unless its action has nothing to move. */
export function walk(rules: Pick<Rule, "conditions" | "match" | "action" | "enabled">[], w: World): Walk {
  const matched: number[] = [];
  const skipped: number[] = [];
  let index: number | null = null;
  rules.forEach((r, i) => {
    if (r.enabled === false || !conditionsHold(r, w)) return;
    matched.push(i);
    if (amountOf(r.action, w) < MIN_MOVE) { skipped.push(i); return; }
    if (index === null) index = i;
  });
  return { index, matched, skipped };
}
