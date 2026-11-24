// Tests for src/rating/rating.js, benchmarks.js and samples.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rate, gradeFor, GRADES } from "../src/rating/rating.js";
import { INDUSTRIES, BENCHMARK_SOURCE, assertBenchmarksComplete, getIndustry } from "../src/rating/benchmarks.js";
import { SAMPLES } from "../src/rating/samples.js";
import { validateValues } from "../src/rating/fields.js";
import { HAND_CASE } from "./fixtures.mjs";

const flagIds = (rating) => rating.flags.map((f) => f.id);

test("benchmarks: seven industries, a valid scale for every ratio, labelled rule-of-thumb", () => {
  assert.doesNotThrow(assertBenchmarksComplete);
  assert.deepEqual(INDUSTRIES.map((i) => i.label), [
    "General", "Retail & wholesale", "Manufacturing", "Software & SaaS",
    "Telecom & CPaaS / messaging", "Professional services", "Tourism & hospitality",
  ]);
  assert.equal(BENCHMARK_SOURCE.kind, "rule-of-thumb");
  assert.throws(() => getIndustry("banking"), /Unknown industry/);
});

test("grades: A ≥ 80, B ≥ 65, C ≥ 50, D ≥ 35, E below", () => {
  const letter = (score) => gradeFor(score).letter;
  assert.deepEqual([100, 80, 79, 65, 64, 50, 49, 35, 34, 0].map(letter), ["A", "A", "B", "B", "C", "C", "D", "D", "E", "E"]);
  assert.deepEqual(GRADES.map((g) => g.label), ["Excellent", "Strong", "Adequate", "Weak", "Poor"]);
});

test("hand case on General benchmarks: score worked out by hand", () => {
  const r = rate(HAND_CASE, "general");
  // Scores per ratio on the General scale (value → score):
  // gross 40 → 83.33, EBITDA 20 → 100, EBIT 15 → 100, net 9.6 → 97.5,
  // ROA 9.6 → 97.5, ROE 24 → 100, ROCE 15 → 84.375, ROIC 15 → 100.
  const expectedScores = { grossMargin: 75 + (5 / 15) * 25, ebitdaMargin: 100, operatingMargin: 100, netMargin: 97.5, roa: 97.5, roe: 100, roce: 84.375, roic: 100 };
  for (const ratio of r.ratios) {
    assert.ok(Math.abs(ratio.score - expectedScores[ratio.id]) < 1e-9, `${ratio.id}: ${ratio.score}`);
  }
  // Weighted: (10×83.33 + 10×100 + 15×100 + 15×97.5 + 15×97.5 + 15×100 + 10×84.375 + 10×100) / 100
  assert.ok(Math.abs(r.rawScore - 96.0208333333) < 1e-9, String(r.rawScore));
  assert.equal(r.score, 96);
  assert.equal(r.grade.letter, "A");
  assert.deepEqual(r.coverage, { count: 8, total: 8, weightShare: 1, label: "8 of 8 ratios" });
  assert.deepEqual(flagIds(r), []);
  assert.equal(r.ratios.find((x) => x.id === "grossMargin").band.id, "good");
  assert.equal(r.ratios.find((x) => x.id === "roe").band.id, "excellent");
  assert.equal(r.keyFigures.interestCover, 5);
});

test("missing ratios are left out and the weights renormalised", () => {
  const values = { ...HAND_CASE, cogs: null, opex: 800, currentLiabilities: null, debt: null };
  const r = rate(values, "general");
  // Without gross margin, ROCE and ROIC: weights 10 + 15 + 15 + 15 + 15 = 70.
  const expected = (10 * 100 + 15 * 100 + 15 * 97.5 + 15 * 97.5 + 15 * 100) / 70;
  assert.ok(Math.abs(r.rawScore - expected) < 1e-9);
  assert.equal(r.coverage.label, "5 of 8 ratios");
  assert.equal(r.coverage.weightShare, 0.7);
  assert.ok(!flagIds(r).includes("low_coverage"), "70% of the weight is enough");
  const missing = r.ratios.filter((x) => x.status === "missing");
  assert.deepEqual(missing.map((x) => [x.id, x.score, x.band]), [["grossMargin", null, null], ["roce", null, null], ["roic", null, null]]);
});

test("the industry changes the bands and the score", () => {
  const software = rate(HAND_CASE, "software");
  const retail = rate(HAND_CASE, "retail");
  assert.equal(software.ratios[0].band.id, "poor", "40% gross margin is poor for software");
  assert.equal(retail.ratios[0].band.id, "excellent", "and excellent for retail");
  assert.ok(software.score < retail.score);
  assert.equal(software.industry.label, "Software & SaaS");
});

test("rate refuses inputs that do not validate", () => {
  assert.throws(() => rate({ ...HAND_CASE, revenue: null }), /Revenue is required/);
  assert.throws(() => rate({ ...HAND_CASE, assets: 0 }), /Total assets must be greater than zero/);
  assert.throws(() => rate(HAND_CASE, "unknown"), /Unknown industry/);
});

test("flags: net loss, negative equity and an operating loss despite a gross profit", () => {
  const r = rate({ ...HAND_CASE, opex: 500, equity: -50, priorEquity: null }, "general");
  assert.deepEqual(flagIds(r).slice(0, 3), ["net_loss", "negative_equity", "operating_loss"]);
  assert.equal(r.flags[0].severity, "critical");
  assert.equal(r.flags[2].severity, "serious");
  assert.equal(r.ratios.find((x) => x.id === "roe").status, "not_meaningful");
  assert.match(r.summary, /Watch out: net loss; equity is zero or negative; operating loss/);
});

test("flags: interest cover below 1.5×, including a negative EBIT", () => {
  const low = rate({ ...HAND_CASE, interest: 110 }, "general"); // 150 / 110 = 1.36×
  const flag = low.flags.find((f) => f.id === "low_interest_cover");
  assert.equal(flag.severity, "serious");
  assert.match(flag.detail, /1\.36×/);
  const negative = rate({ ...HAND_CASE, opex: 400 }, "general");
  assert.match(negative.flags.find((f) => f.id === "low_interest_cover").detail, /does not cover interest at all/);
  assert.ok(!flagIds(rate(HAND_CASE)).includes("low_interest_cover"), "5× is fine");
  assert.ok(!flagIds(rate({ ...HAND_CASE, interest: 0 })).includes("low_interest_cover"), "no interest, no flag");
});

test("flags: leverage above 3× equity, heavy depreciation, low coverage, no prior year", () => {
  const leveraged = rate({ ...HAND_CASE, equity: 300, priorEquity: 200 }); // 1000 / 250 = 4×
  assert.ok(flagIds(leveraged).includes("leverage_inflated_roe"));
  const heavyDa = rate({ ...HAND_CASE, da: 120 }); // 120 / 200 = 60% of EBITDA
  assert.match(heavyDa.flags.find((f) => f.id === "high_depreciation").detail, /60% of EBITDA/);
  const sparse = rate({ revenue: 1000, assets: 1000, equity: -10 });
  assert.equal(sparse.coverage.weightShare, 0.55);
  assert.ok(flagIds(sparse).includes("low_coverage"));
  const noPrior = rate({ ...HAND_CASE, priorAssets: null });
  const info = noPrior.flags.find((f) => f.id === "no_prior_year");
  assert.equal(info.severity, "info");
  assert.match(info.detail, /prior-year total assets,/);
  assert.equal(noPrior.flags[noPrior.flags.length - 1].id, "no_prior_year", "info comes last");
});

test("summary names the grade, industry, strongest and weakest ratio", () => {
  assert.equal(
    rate(HAND_CASE, "general").summary,
    "Excellent profitability: grade A (96/100) against rule-of-thumb General benchmarks; strongest is EBITDA margin (20.0%, Excellent), weakest is gross margin (40.0%, Good).",
  );
});

test("samples: valid, fictional, and graded B, C and E", () => {
  assert.equal(SAMPLES.length, 3);
  const grades = SAMPLES.map((s) => {
    assert.equal(s.fictional, true);
    assert.match(s.description, /^Fictional/);
    assert.deepEqual(validateValues(s.values), {}, s.id);
    return rate(s.values, s.industryId).grade.letter;
  });
  assert.deepEqual(grades, ["B", "C", "E"]);
  const hotel = rate(SAMPLES[1].values, SAMPLES[1].industryId);
  assert.equal(hotel.ratios[0].status, "missing", "the hotel has no COGS");
  assert.deepEqual(flagIds(hotel), ["low_interest_cover", "leverage_inflated_roe", "high_depreciation"]);
});
