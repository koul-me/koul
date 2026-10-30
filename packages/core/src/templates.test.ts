import { expect, it } from "vitest";
import { permissionsFor } from "./permissions";
import { healthGuard, liraShield, yieldOnly } from "./templates";
import { validateAutopilot } from "./validate";

const contracts = { router: "router", controller: "controller", pool: "pool", usdc: "usdc" };
const hasFx = (ap: ReturnType<typeof liraShield>) => ap.rules.some((r) => r.conditions.some((c) => c.type === "FxPrice"));
it("templates validate and request only their action permissions", () => {
  for (const ap of [liraShield("12"), liraShield("12", { fx: true }), yieldOnly("12"), healthGuard("12")]) expect(validateAutopilot(ap)).toEqual([]);
  expect(permissionsFor(healthGuard("12"), contracts).allowedCalls).toEqual([["router", "tick"], ["controller", "repay"], ["usdc", "transfer"]]);
  expect(permissionsFor(yieldOnly("12"), contracts).allowedCalls).toEqual([["router", "tick"], ["controller", "withdraw"], ["controller", "supply"], ["usdc", "transfer"]]);
});
it("no template reads USD/TRY unless asked to", () => {
  for (const ap of [liraShield("12"), yieldOnly("12"), healthGuard("12")]) expect(hasFx(ap)).toBe(false);
  expect(hasFx(liraShield("12", { fx: true }))).toBe(true);
  expect(liraShield("12", { fx: true }).rules).toHaveLength(5);
});
