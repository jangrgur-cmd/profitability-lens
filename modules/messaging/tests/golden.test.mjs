// Characterisation tests: the dashboard's numbers must not change when code
// is moved or refactored. tests/golden/expected.json was produced from the
// code as it was before integration into Profitability Lens; it is rewritten
// only by scripts/update-golden.mjs, when a change to the numbers is intended.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRealData, takeSnapshot } from "./golden/snapshot.mjs";

const expected = JSON.parse(readFileSync(new URL("./golden/expected.json", import.meta.url), "utf8"));
const actual = takeSnapshot(loadRealData());

/** Relative tolerance for floating-point sums whose order a refactor may change.
 *  1e-12 of €112M is €0.0001, so even one extra message (≈ €0.03) fails the test. */
const RELATIVE_TOLERANCE = 1e-12;

/**
 * Compares two JSON values; numbers may differ by a tiny relative amount.
 * Returns the path of the first difference, or null when they match.
 */
function firstDifference(a, b, path = "$") {
  if (typeof a === "number" && typeof b === "number") {
    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= RELATIVE_TOLERANCE * scale ? null : `${path}: expected ${b}, got ${a}`;
  }
  if (Array.isArray(a) !== Array.isArray(b) || typeof a !== typeof b || (a === null) !== (b === null)) {
    return `${path}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
  }
  if (a === null || typeof a !== "object") return a === b ? null : `${path}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!(key in a) || !(key in b)) return `${path}.${key}: present in only one snapshot`;
    const diff = firstDifference(a[key], b[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

for (const section of Object.keys(expected)) {
  test(`golden: ${section} is unchanged`, () => {
    assert.ok(section in actual, `${section} is missing from the current snapshot`);
    assert.equal(firstDifference(actual[section], expected[section], section), null);
  });
}

test("golden: the snapshot has no new sections without expected values", () => {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
});

test("golden: the comparison catches a real change", () => {
  assert.equal(firstDifference({ x: 112e6 }, { x: 112e6 + 1e-5 }), null);
  assert.notEqual(firstDifference({ x: 112e6 }, { x: 112e6 + 0.03 }), null);
  assert.notEqual(firstDifference({ x: 100 }, { x: 100.01 }), null);
  assert.notEqual(firstDifference({ x: "€1.2M" }, { x: "€1.3M" }), null);
  assert.notEqual(firstDifference({ x: [1, 2] }, { x: [1, 2, 3] }), null);
});
