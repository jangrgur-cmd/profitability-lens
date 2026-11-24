// Tests for src/shared/margin.js: safe division, bands and threshold scores.

import { test } from "node:test";
import assert from "node:assert/strict";
import { safeDivide, margin, bandFor, scoreAgainstThresholds, assertThresholds } from "../src/shared/margin.js";

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
