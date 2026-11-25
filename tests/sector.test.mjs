// Tests for src/rating/sector.js: the published European sector averages shown
// next to the rule-of-thumb benchmarks. They must never change a grade.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DAMODARAN_EUROPE, SECTOR_ROWS, SECTOR_SOURCE, sectorReference } from "../src/rating/sector.js";
import { INDUSTRIES } from "../src/rating/benchmarks.js";
import { RATIOS } from "../src/rating/ratios.js";
import { rate } from "../src/rating/rating.js";
import { trackGeometry } from "../src/shared/track.js";
import { HAND_CASE } from "./fixtures.mjs";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, `${msg}: ${a} vs ${b}`);

test("every industry maps to Damodaran rows that exist, and every row is used", () => {
  assert.deepEqual(Object.keys(SECTOR_ROWS).sort(), INDUSTRIES.map((i) => i.id).sort());
  const used = new Set(Object.values(SECTOR_ROWS).flat());
  for (const name of used) assert.ok(DAMODARAN_EUROPE[name], name);
  assert.deepEqual([...used].sort(), Object.keys(DAMODARAN_EUROPE).sort());
  for (const [name, row] of Object.entries(DAMODARAN_EUROPE)) {
    assert.equal(row.length, 9, name);
    assert.ok(row[0] > 0 && row[5] > 0 && row[7] > 0, `${name}: firm counts`);
  }
  assert.equal(SECTOR_SOURCE.dataAsOf, "2026-01");
});

test("an industry's value is the firm-weighted average of its rows (by hand)", () => {
  const [sa, net] = [DAMODARAN_EUROPE["Software (System & Application)"], DAMODARAN_EUROPE["Software (Internet)"]];
  const ref = sectorReference("software");
  near(ref.operatingMargin.value, (sa[0] * sa[3] + net[0] * net[3]) / (sa[0] + net[0]) / 100, "operating margin");
  near(ref.roic.value, (sa[7] * sa[8] + net[7] * net[8]) / (sa[7] + net[7]) / 100, "ROIC from ROC");
  assert.equal(ref.operatingMargin.firms, sa[0] + net[0]);
  const general = sectorReference("general");
  near(general.netMargin.value, DAMODARAN_EUROPE["Total Market (without financials)"][4] / 100, "general = Total Market");
});

test("ROA and ROCE are not published; an EBITDA margin below the operating margin is not shown", () => {
  for (const industry of INDUSTRIES) {
    const ref = sectorReference(industry.id);
    assert.deepEqual(Object.keys(ref).sort(), RATIOS.map((r) => r.id).sort());
    assert.equal(ref.roa.reason, "notPublished");
    assert.equal(ref.roce.reason, "notPublished");
    if (ref.ebitdaMargin.value !== null) assert.ok(ref.ebitdaMargin.value >= ref.operatingMargin.value, industry.id);
  }
  assert.equal(sectorReference("software").ebitdaMargin.reason, "inconsistent");
  assert.equal(sectorReference("unknown").netMargin.value, null);
});

test("the rating carries the reference but its score is unchanged by it", () => {
  const rating = rate(HAND_CASE, "manufacturing");
  const net = rating.ratios.find((r) => r.id === "netMargin");
  assert.deepEqual(net.sector, sectorReference("manufacturing").netMargin);
  assert.equal(rate(HAND_CASE, "general").score, 96, "the hand case still scores 96 on the General scale");
});

test("the track places the reference mark like the value marker", () => {
  const g = trackGeometry(9.6, [0, 3, 6, 10], 6.4);
  // The track runs from the floor 0 − 3 = −3 to 10 + (10 − 6) = 14, a span of 17.
  near(g.reference.at, ((6.4 + 3) / 17) * 100, "position");
  assert.equal(g.reference.outside, null);
  assert.equal(trackGeometry(5, [0, 3, 6, 10], 40).reference.outside, "above");
  assert.equal(trackGeometry(5, [0, 3, 6, 10]).reference, null);
});
