// Tests for src/shared/margin.js: safe division, bands and threshold scores.

import { test } from "node:test";
import assert from "node:assert/strict";
import { safeDivide, margin, bandFor, scoreAgainstThresholds, assertThresholds, marginContributions } from "../src/shared/margin.js";

const SCALE = [0, 5, 10, 20];

test("safeDivide returns null instead of a fake value", () => {
  assert.equal(safeDivide(1, 4), 0.25);
  assert.equal(safeDivide(-3, 2), -1.5);
  assert.equal(safeDivide(1, 0), null);
  assert.equal(safeDivide(0, 0), null);
  assert.equal(safeDivide(null, 2), null);
  assert.equal(safeDivide(1, undefined), null);
  assert.equal(safeDivide(Number.NaN, 2), null);
  assert.equal(margin(150, 1000), 0.15);
  assert.equal(margin(10, 0), null);
});

test("bandFor: a value at a threshold belongs to that band", () => {
  const band = (v) => bandFor(v, SCALE).id;
  assert.equal(band(-0.01), "poor");
  assert.equal(band(0), "weak");
  assert.equal(band(4.99), "weak");
  assert.equal(band(5), "fair");
  assert.equal(band(10), "good");
  assert.equal(band(20), "excellent");
  assert.equal(band(500), "excellent");
  assert.equal(bandFor(12, SCALE).label, "Good");
});

test("scoreAgainstThresholds hits 0/20/50/75/100 at floor/poor/fair/good/excellent", () => {
  // floor = poor − (fair − poor) = 0 − 5 = −5
  assert.equal(scoreAgainstThresholds(-5, SCALE), 0);
  assert.equal(scoreAgainstThresholds(0, SCALE), 20);
  assert.equal(scoreAgainstThresholds(5, SCALE), 50);
  assert.equal(scoreAgainstThresholds(10, SCALE), 75);
  assert.equal(scoreAgainstThresholds(20, SCALE), 100);
});

test("scoreAgainstThresholds interpolates linearly and clamps to 0–100", () => {
  assert.equal(scoreAgainstThresholds(-2.5, SCALE), 10);
  assert.equal(scoreAgainstThresholds(2.5, SCALE), 35);
  assert.equal(scoreAgainstThresholds(7.5, SCALE), 62.5);
  assert.equal(scoreAgainstThresholds(15, SCALE), 87.5);
  assert.equal(scoreAgainstThresholds(-100, SCALE), 0);
  assert.equal(scoreAgainstThresholds(1000, SCALE), 100);
  // Negative thresholds work too (software operating margin).
  assert.equal(scoreAgainstThresholds(0, [-5, 5, 15, 25]), 35);
});

test("thresholds must be four strictly ascending numbers", () => {
  assert.doesNotThrow(() => assertThresholds([1, 2, 3, 4]));
  assert.throws(() => assertThresholds([1, 2, 3]), /four numbers/);
  assert.throws(() => assertThresholds([1, 2, 2, 4]), /strictly ascending/);
  assert.throws(() => assertThresholds([4, 3, 2, 1]), /strictly ascending/);
  assert.throws(() => assertThresholds([1, 2, Number.NaN, 4]), /four numbers/);
  assert.throws(() => bandFor(1, [1, 1, 1, 1]), /strictly ascending/);
});

test("marginContributions: segment margins weighted by revenue add up to the company margin", () => {
  const { rows, total } = marginContributions([
    { label: "SMS", revenue: 600, grossProfit: 120 }, // 20% margin, 60% of revenue → 12 points
    { label: "WhatsApp", revenue: 300, grossProfit: 15 }, // 5% margin → 1.5 points
    { label: "Voice", revenue: 100, grossProfit: -10 }, // loss → −1 point
  ]);
  assert.deepEqual(rows.map((r) => r.label), ["SMS", "WhatsApp", "Voice"]);
  assert.deepEqual(rows.map((r) => r.revenueShare), [0.6, 0.3, 0.1]);
  assert.deepEqual(rows.map((r) => r.margin), [0.2, 0.05, -0.1]);
  assert.deepEqual(rows.map((r) => r.contribution), [0.12, 0.015, -0.01]);
  assert.deepEqual(total, { revenue: 1000, grossProfit: 125, margin: 0.125 });
  const sum = rows.reduce((s, r) => s + r.revenueShare * r.margin, 0);
  assert.ok(Math.abs(sum - total.margin) < 1e-12);
});

test("marginContributions never fakes a margin on zero revenue", () => {
  const { rows, total } = marginContributions([{ label: "Viber", revenue: 0, grossProfit: 0 }]);
  assert.deepEqual(rows[0], { label: "Viber", revenueShare: null, margin: null, contribution: null });
  assert.equal(total.margin, null);
  assert.deepEqual(marginContributions([]).rows, []);
});
