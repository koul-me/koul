import { expect, it } from "vitest";
import type { ActivityRow } from "@/hooks/use-activity";
import { tallyRuns } from "./runs";

const run = (at: number, ruleIndex: number, amount: number, autopilotId = 1): ActivityRow => ({ id: `r${at}`, kind: "run", who: "auto", at, title: "run", amount, autopilotId, ruleIndex });
const saved = (at: number, autopilotId = 1): ActivityRow => ({ id: `s${at}`, kind: "rules_saved", who: "you", at, title: "Autopilot saved", autopilotId });

it("counts each card's runs since the last save, folding a card's contract rules together", () => {
  // Contract rules 0 and 1 are one card (a per-hub pair), rule 2 is the second card.
  const contractToUi = [0, 0, 1];
  const rows = [run(100, 2, 5), saved(200), run(300, 0, 10), run(400, 1, 20), run(500, 2, -7), run(600, 0, 1, 2)];
  const { byCard, savedAt } = tallyRuns(rows, 1, contractToUi);
  expect(savedAt).toBe(200);
  expect(byCard.get(0)).toMatchObject({ n: 2, usdc: 30 });
  expect(byCard.get(0)!.last.at).toBe(400);
  expect(byCard.get(1)).toMatchObject({ n: 1, usdc: 7 });
});

it("counts everything the node still has when the save is out of reach", () => {
  const { byCard, savedAt } = tallyRuns([run(100, 0, 1), run(200, 0, 2)], 1, [0]);
  expect(savedAt).toBeNull();
  expect(byCard.get(0)).toMatchObject({ n: 2, usdc: 3 });
});
