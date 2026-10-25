import { expect, it } from "vitest";
import { makeRule } from "./autopilot";
import { pairingProblem } from "./pairing";

const when = [{ kind: "token_price" as const, comparator: "lte" as const, value: 1.1, token: "EURC" as const }];

it("refuses buying a token the testnet router cannot buy, and allows selling it", () => {
  expect(pairingProblem(makeRule({ name: "Buy EURC", conditions: when, action: { kind: "buy_token", amount: 10, token: "EURC" } }))).toMatch(/refuses buying it/);
  expect(pairingProblem(makeRule({ name: "Into EURC", conditions: when, action: { kind: "withdraw_to_token", amount: "all", token: "EURC" } }))).toMatch(/refuses buying it/);
  expect(pairingProblem(makeRule({ name: "Sell EURC", conditions: when, action: { kind: "sell_token", amount: 5, token: "EURC" } }))).toBeNull();
  expect(pairingProblem(makeRule({ name: "Buy ETH", conditions: when, action: { kind: "buy_token", amount: 10, token: "ETH" } }))).toBeNull();
});

it("lets a sale be a fraction of a coin", () => {
  expect(pairingProblem(makeRule({ name: "Sell wBTC", conditions: when, action: { kind: "sell_token", amount: 0.01, token: "wBTC" } }))).toBeNull();
  expect(pairingProblem(makeRule({ name: "Buy SOL", conditions: when, action: { kind: "buy_token", amount: 0.5, token: "SOL" } }))).toMatch(/at least 1 USDC/);
});
