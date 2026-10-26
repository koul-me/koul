/**
 * How often each rule card ran, from the router's `fired` rows in Activity. Saving rewrites the rule list, so a
 * contract rule index only names a card for runs after the autopilot's last save; earlier runs are not counted.
 */
import type { ActivityRow } from "@/hooks/use-activity";

export interface RuleRuns { n: number; usdc: number; last: ActivityRow }

export function tallyRuns(rows: ActivityRow[], autopilotId: number, contractToUi: number[]): { byCard: Map<number, RuleRuns>; savedAt: number | null } {
  const saves = rows.filter((r) => r.kind === "rules_saved" && r.autopilotId === autopilotId).map((r) => r.at);
  const savedAt = saves.length ? Math.max(...saves) : null;
  const byCard = new Map<number, RuleRuns>();
  for (const row of rows) {
    if (row.kind !== "run" || row.autopilotId !== autopilotId || row.ruleIndex === undefined) continue;
    if (savedAt !== null && row.at < savedAt) continue;
    const card = contractToUi[row.ruleIndex];
    if (card === undefined) continue;
    const seen = byCard.get(card);
    byCard.set(card, { n: (seen?.n ?? 0) + 1, usdc: (seen?.usdc ?? 0) + Math.abs(row.amount ?? 0), last: !seen || row.at > seen.last.at ? row : seen.last });
  }
  return { byCard, savedAt };
}
