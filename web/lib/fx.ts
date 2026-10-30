/**
 * The USD/TRY switch. USD/TRY rules read the team's own mock FX oracle, whose price is moved by hand, so they are off
 * unless NEXT_PUBLIC_KOUL_FX=on. Off means no new USD/TRY condition anywhere: not in the editor, the templates, the
 * chat or the parser, and a save that still carries one is refused. The FX code paths stay; this flag gates them.
 */
import type { Rule } from "@/lib/model/autopilot";

/** The one place the flag is read. Literal access so Next inlines it in the browser bundle too. */
export const FX_ON = process.env.NEXT_PUBLIC_KOUL_FX === "on";

/** What a person reads when they ask for USD/TRY while it is off. No colon: the chat route shows it as is. */
export const FX_OFF_NOTE = "USD/TRY is not available right now.";

export const hasFx = (rule: Pick<Rule, "conditions">): boolean => rule.conditions.some((c) => c.kind === "fx_price");

/** Why a rule cannot be saved while USD/TRY is off, or null. */
export function fxProblem(rule: Pick<Rule, "conditions">): string | null {
  return !FX_ON && hasFx(rule) ? `${FX_OFF_NOTE} Pick another condition or delete this rule.` : null;
}
