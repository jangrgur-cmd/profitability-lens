// Tests for src/shared/track.js: geometry of the benchmark track.

import { test } from "node:test";
import assert from "node:assert/strict";
import { trackGeometry } from "../src/shared/track.js";

test("track runs from the score floor to as far above excellent as excellent is above good", () => {
  // [0, 5, 10, 20]: floor = 0 − 5 = −5, top = 20 + 10 = 30, width 35.
  const g = trackGeometry(12, [0, 5, 10, 20]);
  assert.equal(g.min, -5);
  assert.equal(g.max, 30);
  assert.deepEqual(g.ticks.map((t) => t.value), [0, 5, 10, 20]);
  assert.deepEqual(g.ticks.map((t) => +t.at.toFixed(6)), [5 / 35 * 100, 10 / 35 * 100, 15 / 35 * 100, 25 / 35 * 100].map((x) => +x.toFixed(6)));
  assert.equal(+g.marker.at.toFixed(6), +((17 / 35) * 100).toFixed(6));
  assert.equal(g.marker.outside, null);
});

test("the five band segments cover the whole track without gaps, worst to best", () => {
  const g = trackGeometry(null, [15, 25, 35, 50]);
  assert.deepEqual(g.segments.map((s) => s.id), ["poor", "weak", "fair", "good", "excellent"]);
  assert.equal(g.segments[0].from, 0);
  assert.equal(g.segments[4].to, 100);
  for (let i = 1; i < 5; i += 1) assert.equal(g.segments[i].from, g.segments[i - 1].to);
  assert.equal(g.marker, null, "no marker without a value");
});

test("values off the scale are pinned to the end and marked", () => {
  assert.deepEqual(trackGeometry(-40, [0, 5, 10, 20]).marker, { at: 0, outside: "below" });
  assert.deepEqual(trackGeometry(99, [0, 5, 10, 20]).marker, { at: 100, outside: "above" });
  assert.equal(trackGeometry(30, [0, 5, 10, 20]).marker.outside, null, "the end itself is on the scale");
  assert.throws(() => trackGeometry(1, [5, 4, 3, 2]), /ascending/);
});
