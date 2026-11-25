// Tests for src/rating/years.js: several years of one company.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chainYears, validateYears, rateYears, trendSentence, relativeChange, MAX_YEARS } from "../src/rating/years.js";
import { rate } from "../src/rating/rating.js";
import { HAND_CASE } from "./fixtures.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

/** The hand case without its prior-year fields: the year before supplies them. */
const LATEST = { ...HAND_CASE, priorAssets: null, priorEquity: null };

/**
 * An earlier year whose year-end balance sheet is the hand case's prior year (assets 800, equity 300).
 * By hand: gross 300/800 = 37.5%, EBITDA 140, EBIT 100, EBT 70, net 56 (7%), ROA 56/800 = 7%,
 * ROE 56/300 = 18.67%, ROCE 100/650 = 15.38%, tax rate 20% → NOPAT 80, ROIC 80/600 = 13.33%.
 */
const EARLIER = {
  revenue: 800, cogs: 500, opex: 160, da: 40, otherIncome: null, interest: 30, tax: 14,
  assets: 800, equity: 300, currentLiabilities: 150, debt: 350, cash: 50, priorAssets: null, priorEquity: null,
};

const TWO_YEARS = [{ year: 2025, values: LATEST }, { year: 2024, values: EARLIER }];

test("chainYears: each year takes the year before as its prior-year balance sheet", () => {
  const [latest, earlier] = chainYears(TWO_YEARS);
  assert.equal(latest.priorAssets, 800);
  assert.equal(latest.priorEquity, 300);
  assert.equal(earlier.priorAssets, null, "the oldest year keeps its own prior-year fields");
  assert.deepEqual(chainYears([{ year: 2025, values: HAND_CASE }]), [HAND_CASE]);
});

test("the latest year chained from the year before rates exactly like the single-year hand case", () => {
  const trend = rateYears(TWO_YEARS, "general");
  const single = rate(HAND_CASE, "general");
  assert.deepEqual(trend.years[0].rating.ratios.map((r) => r.value), single.ratios.map((r) => r.value));
  assert.equal(trend.years[0].rating.score, single.score);
});

test("rateYears: the earlier year worked out by hand, series oldest first", () => {
  const trend = rateYears(TWO_YEARS, "general");
  const earlier = Object.fromEntries(trend.years[1].rating.ratios.map((r) => [r.id, r.value]));
  close(earlier.grossMargin, 0.375, "gross");
  close(earlier.netMargin, 0.07, "net");
  close(earlier.roa, 0.07, "ROA");
  close(earlier.roe, 56 / 300, "ROE");
  close(earlier.roce, 100 / 650, "ROCE");
  close(earlier.roic, 80 / 600, "ROIC");
  assert.deepEqual(trend.series.ratios.netMargin.map((v) => Math.round(v * 1000) / 1000), [0.07, 0.096]);
  assert.deepEqual(trend.series.keyFigures.revenue, [800, 1000]);
  assert.equal(trend.series.score.length, 2);
});

test("year-on-year: ratio changes in points, amounts in %, score in points", () => {
  const { yoy, years } = rateYears(TWO_YEARS, "general");
  assert.equal(yoy.year, 2025);
  assert.equal(yoy.previousYear, 2024);
  close(yoy.ratios.grossMargin, 0.025, "gross +2.5 pp");
  close(yoy.ratios.roe, 0.24 - 56 / 300, "ROE");
  close(yoy.ratios.roce, 0.15 - 100 / 650, "ROCE");
  close(yoy.keyFigures.revenue, 0.25, "revenue +25%");
  close(yoy.keyFigures.netIncome, 96 / 56 - 1, "net income");
  close(yoy.keyFigures.interestCover, 150 / 30 - 100 / 30, "interest cover change in turns");
  assert.equal(yoy.score, years[0].rating.score - years[1].rating.score);
});

test("relativeChange has no meaning from a zero or negative base", () => {
  assert.equal(relativeChange(120, 100), 0.2);
  assert.equal(relativeChange(50, -100), null);
  assert.equal(relativeChange(50, 0), null);
  assert.equal(relativeChange(null, 100), null);
});

test("trendSentence names the score change, the biggest moves and revenue growth", () => {
  const trend = rateYears(TWO_YEARS, "general");
  const text = trendSentence(trend);
  assert.match(text, /on 2024/);
  assert.match(text, /Biggest improvement: ROE \(\+5\.3 pp\); biggest fall: ROCE \(−⁠0\.4 pp\)\./);
  assert.match(text, /Revenue \+25\.0% in 2025\.$/);
  assert.equal(trendSentence(rateYears([TWO_YEARS[0]], "general")), null);
});

test("validateYears reports errors by year, and a chained prior-year field is not blamed on the newer year", () => {
  const bad = [{ year: 2025, values: LATEST }, { year: 2024, values: { ...EARLIER, assets: null } }];
  const errors = validateYears(bad);
  assert.deepEqual(Object.keys(errors), ["1"]);
  assert.deepEqual(Object.keys(errors[1]), ["assets"]);
  assert.deepEqual(validateYears(TWO_YEARS), {});
});

test("between one and five years", () => {
  const many = Array.from({ length: MAX_YEARS + 1 }, (_, i) => ({ year: 2025 - i, values: LATEST }));
  assert.throws(() => rateYears(many, "general"), /Between 1 and 5/);
  assert.throws(() => rateYears([], "general"), /Between 1 and 5/);
});
