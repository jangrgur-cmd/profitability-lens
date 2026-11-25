// Tests for src/rating/ratios.js, built around the hand-checkable case in
// CLAUDE.md §4.5. That case must stay in the tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { RATIOS, deriveStatement, computeRatios, dupont } from "../src/rating/ratios.js";
import { HAND_CASE } from "./fixtures.mjs";

function near(actual, expected, label = "", tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} expected ${expected}, got ${actual}`);
}

test("hand case: derived statement", () => {
  const s = deriveStatement(HAND_CASE);
  assert.equal(s.grossProfit, 400);
  assert.equal(s.ebitda, 200);
  assert.equal(s.ebit, 150);
  assert.equal(s.ebt, 120);
  assert.equal(s.netIncome, 96);
  near(s.taxRate, 0.2, "tax rate");
  near(s.nopat, 120, "NOPAT");
  assert.equal(s.avgAssets, 1000);
  assert.equal(s.avgEquity, 400);
  assert.equal(s.capitalEmployed, 1000);
  assert.equal(s.investedCapital, 800);
  assert.equal(s.interestCover, 5);
});

test("hand case: all eight ratios", () => {
  const r = computeRatios(deriveStatement(HAND_CASE));
  const expected = { grossMargin: 0.4, ebitdaMargin: 0.2, operatingMargin: 0.15, netMargin: 0.096, roa: 0.096, roe: 0.24, roce: 0.15, roic: 0.15 };
  for (const [id, value] of Object.entries(expected)) {
    assert.equal(r[id].status, "ok", id);
    near(r[id].value, value, id);
  }
  assert.equal(r.roe.numerator, 96);
  assert.equal(r.roe.denominator, 400);
});

test("hand case: DuPont 9.6% × 1.00 × 2.50 = 24%", () => {
  const d = dupont(deriveStatement(HAND_CASE));
  assert.equal(d.status, "ok");
  near(d.netMargin, 0.096, "net margin");
  near(d.assetTurnover, 1, "asset turnover");
  near(d.equityMultiplier, 2.5, "equity multiplier");
  near(d.roe, 0.24, "ROE");
});

test("ratio weights add up to 100 and ids are unique", () => {
  assert.equal(RATIOS.reduce((s, r) => s + r.weight, 0), 100);
  assert.equal(new Set(RATIOS.map((r) => r.id)).size, RATIOS.length);
  for (const r of RATIOS) assert.ok(r.meaning && r.improve && r.formula && r.shortLabel, r.id);
});

test("blank COGS: gross margin is missing and all costs count as operating expenses", () => {
  const s = deriveStatement({ ...HAND_CASE, cogs: null, opex: 800 });
  assert.equal(s.grossProfit, null);
  assert.equal(s.ebitda, 200);
  const r = computeRatios(s);
  assert.deepEqual(r.grossMargin, { status: "missing", value: null, numerator: null, denominator: null, missing: ["cogs"] });
  assert.equal(r.ebitdaMargin.status, "ok");
});

test("ROCE needs current liabilities and ROIC needs debt", () => {
  const r = computeRatios(deriveStatement({ ...HAND_CASE, currentLiabilities: null, debt: null }));
  assert.deepEqual(r.roce.missing, ["currentLiabilities"]);
  assert.deepEqual(r.roic.missing, ["debt"]);
});

test("blank cash counts as 0 in invested capital", () => {
  assert.equal(deriveStatement({ ...HAND_CASE, cash: null }).investedCapital, 900);
});

test("without prior-year figures, averages are the year-end figures", () => {
  const s = deriveStatement({ ...HAND_CASE, priorAssets: null, priorEquity: null });
  assert.equal(s.avgAssets, 1200);
  assert.equal(s.avgEquity, 500);
});

test("negative equity makes ROE and the DuPont equity multiplier not meaningful", () => {
  for (const values of [{ ...HAND_CASE, equity: -100, priorEquity: null }, { ...HAND_CASE, equity: -100, priorEquity: 300 }, { ...HAND_CASE, equity: 100, priorEquity: -300 }]) {
    const s = deriveStatement(values);
    const r = computeRatios(s);
    assert.equal(r.roe.status, "not_meaningful");
    assert.equal(r.roe.value, null);
    assert.match(r.roe.reason, /zero or negative/);
    const d = dupont(s);
    assert.equal(d.status, "not_meaningful");
    assert.equal(d.equityMultiplier, null);
    assert.equal(d.roe, null);
    near(d.netMargin, s.netIncome / s.revenue, "net margin still shown");
  }
});

test("capital employed or invested capital at or below zero is not meaningful", () => {
  const r = computeRatios(deriveStatement({ ...HAND_CASE, currentLiabilities: 1200, cash: 900 }));
  assert.equal(r.roce.status, "not_meaningful");
  assert.equal(r.roic.status, "not_meaningful");
  assert.equal(r.roce.denominator, 0);
  assert.equal(r.roic.denominator, 0);
});

test("tax rate: 0 when EBT is not positive, capped at 50% for NOPAT", () => {
  assert.equal(deriveStatement({ ...HAND_CASE, tax: 0, interest: 200 }).taxRate, 0);
  const loss = deriveStatement({ ...HAND_CASE, interest: 200, tax: 5 });
  assert.equal(loss.taxRate, 0);
  assert.equal(loss.nopat, loss.ebit);
  assert.equal(deriveStatement({ ...HAND_CASE, tax: 90 }).taxRate, 0.5);
  assert.equal(deriveStatement({ ...HAND_CASE, tax: -10 }).taxRate, 0, "a tax credit does not raise NOPAT above EBIT");
});

test("other financial income enters EBT; no interest means no interest cover", () => {
  const s = deriveStatement({ ...HAND_CASE, otherIncome: -20, interest: null });
  assert.equal(s.ebt, 130);
  assert.equal(s.interestCover, null);
});

test("other operating income counts in EBITDA and EBIT, not in revenue (by hand)", () => {
  // Hand case plus 50 of other operating income: EBITDA 200 + 50 = 250, EBIT 200,
  // EBT 170, net income 146. Margins still divide by revenue 1000.
  const s = deriveStatement({ ...HAND_CASE, otherOpIncome: 50 });
  near(s.revenue, 1000, "revenue");
  near(s.grossProfit, 400, "gross profit");
  near(s.ebitda, 250, "EBITDA");
  near(s.ebit, 200, "EBIT");
  near(s.netIncome, 146, "net income");
  const r = computeRatios(s);
  near(r.grossMargin.value, 0.4, "gross margin unchanged");
  near(r.operatingMargin.value, 0.2, "operating margin");
  near(r.netMargin.value, 0.146, "net margin");
  near(deriveStatement({ ...HAND_CASE, otherOpIncome: null }).ebitda, 200, "blank counts as 0");
});
