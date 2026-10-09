import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateBilling, calculatorInput, type CalculatorInput } from "../src/services/calculator.js";
const base = (): CalculatorInput => ({ from: "2026-10-05", to: "2026-10-08", exchangeRate: 5.45,
  gupshupCapUsd: 75, previousFlow: 0, startingBalanceUsd: 320, endingBalanceUsd: 260.693246,
  channels: [{ channel: "2998", service: 7950, marketing: 0, utility: 0, authentication: 0, received: 7958, previousService: 1000 }] });
test("wallet reconciliation includes incoming fees and retains six-decimal USD precision", () => {
  const result = calculateBilling(calculatorInput.parse(base()));
  assert.equal(result.metaUsd, 54.06);
  assert.equal(result.gupshupUsd, 15.908);
  assert.equal(result.totalUsd, 69.968);
  assert.equal(result.consumedUsd, 59.306754);
  assert.equal(result.differenceUsd, 10.661246);
  assert.ok(Math.abs(result.totalBrl - 381.3256) < 1e-8);
});
test("service allowance belongs to each number and only the remaining monthly allowance applies", () => {
  const input = base(); input.channels[0].service = 300; input.channels[0].previousService = 900;
  input.channels.push({ ...input.channels[0], channel: "0061", previousService: 0 });
  const result = calculateBilling(input);
  assert.deepEqual(result.channels.map(c => [c.freeService, c.billedService]), [[100, 200], [300, 0]]);
  assert.equal(result.metaUsd, 1.36);
});
test("Gupshup cap is applied to cumulative monthly flow, charging only the period delta", () => {
  const input = base(); input.previousFlow = 74990; input.channels[0].received = 0;
  assert.equal(calculateBilling(input).gupshupUsd, 0.01);
  input.previousFlow = 75000;
  assert.equal(calculateBilling(input).gupshupUsd, 0);
  input.channels[0].service = 0; input.channels[0].marketing = 100;
  assert.equal(calculateBilling(input).metaUsd, 6.25);
});
test("reject impossible periods, duplicate numbers and invalid monetary/count inputs", () => {
  for (const patch of [{ from: "2026-09-30" }, { to: "2026-11-01" }, { from: "2026-10-10" },
    { from: "2026-02-30" }, { exchangeRate: 0 }, { previousFlow: -1 }, { previousFlow: 0.5 },
    { from: "2026-10-01", previousFlow: 10 }]) {
    assert.equal(calculatorInput.safeParse({ ...base(), ...patch }).success, false);
  }
  const input = base(); input.channels.push({ ...input.channels[0] });
  assert.equal(calculatorInput.safeParse(input).success, false);
});
