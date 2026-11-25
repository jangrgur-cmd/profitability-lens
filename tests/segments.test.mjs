// Tests for src/segments/segments.js, src/segments/samples.js,
// src/shared/concentration.js and src/shared/sparkline.js.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { analyseSegments, readSegmentPaste, segmentSummary, segmentsCsv, validateSegments, SEGMENT_KINDS } from "../src/segments/segments.js";
import { SEGMENT_SAMPLES } from "../src/segments/samples.js";
import { profitCurve, topShare } from "../src/shared/concentration.js";
import { sparklineGeometry } from "../src/shared/sparkline.js";
import { SAMPLES } from "../src/rating/samples.js";
import { useLanguage } from "../src/shared/i18n.js";
import { MINUS } from "../src/shared/format.js";

afterEach(() => useLanguage("en"));

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

/**
 * By hand: A 100 − 60 = CM 40, − 10 fixed = 30; B 50 − 20 = 30, − 40 = −10;
 * C 200 − 150 = 50, no fixed costs = 50. Totals: revenue 350, CM 120, profit 70.
 * Ranked C, A, B; cumulative shares 50/70, 80/70, 70/70.
 */
const HAND = [
  { name: "A", revenue: 100, variableCosts: 60, fixedCosts: 10 },
  { name: "B", revenue: 50, variableCosts: 20, fixedCosts: 40 },
  { name: "C", revenue: 200, variableCosts: 150, fixedCosts: null },
];

test("analyseSegments: contribution margin, segment profit and ranking, worked out by hand", () => {
  const a = analyseSegments(HAND);
  assert.deepEqual(a.rows.map((r) => [r.rank, r.name, r.contribution, r.profit]), [[1, "C", 50, 50], [2, "A", 40, 30], [3, "B", 30, -10]]);
  assert.deepEqual(a.totals, { revenue: 350, variableCosts: 230, fixedCosts: 50, contribution: 120, profit: 70, cmRatio: 120 / 350, profitMargin: 0.2 });
  close(a.rows[1].cmRatio, 0.4, "A's CM ratio");
  close(a.rows[0].cumulativeShare, 50 / 70, "C");
  close(a.rows[1].cumulativeShare, 80 / 70, "A: above 100% because B loses money");
  close(a.rows[2].cumulativeShare, 1, "the curve ends at 100%");
  assert.deepEqual(a.top20.count, 1);
  close(a.top20.share, 50 / 70, "top 20%");
  assert.equal(a.peak.count, 2);
  close(a.peak.share, 80 / 70, "peak");
  assert.deepEqual(a.lossMakers, { count: 1, loss: -10 });
  assert.equal(a.hasFixedCosts, true);
  const points = a.contributions.rows.reduce((s, r) => s + r.contribution, 0);
  close(points, a.contributions.total.margin, "segment contributions add up to the company margin");
});

test("segmentSummary in English and Croatian", () => {
  const a = analyseSegments(HAND);
  assert.equal(segmentSummary(a),
    `The most profitable of 3 segments (33%) earns 71.4% of total profit. 1 segment loses money (${MINUS}€10). The profitable segments alone earn 114.3% of the total.`);
  const many = analyseSegments(Array.from({ length: 10 }, (_, i) => ({ name: `S${i}`, revenue: 100, variableCosts: 10 * i, fixedCosts: null })));
  assert.match(segmentSummary(many), /^The top 2 of 10 segments \(20%\) earn 34.5% of total profit\. No segment loses money\.$/);
  useLanguage("hr");
  // Croatian puts a non-breaking space before % (\s matches it).
  assert.match(segmentSummary(a), /^Najprofitabilniji segment \(jedan od 3, odnosno 33\s%\) ostvaruje 71,4\s% ukupne dobiti\. 1 segment posluje s gubitkom/);
  assert.match(segmentSummary(many), /^Najprofitabilnijih 20\s% segmenata \(2 od 10\) ostvaruje 34,5\s% ukupne dobiti\. Nijedan segment ne posluje s gubitkom\.$/);
});

test("summary edge cases: one segment, and a total loss with no meaningful shares", () => {
  assert.match(segmentSummary(analyseSegments([HAND[0]])), /^There is only one segment/);
  const loss = analyseSegments([{ name: "X", revenue: 10, variableCosts: 20, fixedCosts: null }, { name: "Y", revenue: 10, variableCosts: 5, fixedCosts: null }]);
  assert.equal(loss.top20.share, null);
  assert.match(segmentSummary(loss), /shares of profit have no meaning/);
});

test("readSegmentPaste: header names in Croatian or English, any column order, or none", () => {
  const hr = readSegmentPaste("Kupac\tPrihodi\tVarijabilni troškovi\tIzravni fiksni troškovi\nKupac A\t120.000\t84.000\t9.000\nKupac B\t60.000\t(50.000)\t");
  assert.equal(hr.header, true);
  assert.deepEqual(hr.segments, [
    { name: "Kupac A", revenue: 120000, variableCosts: 84000, fixedCosts: 9000 },
    { name: "Kupac B", revenue: 60000, variableCosts: 50000, fixedCosts: null },
  ]);
  const reordered = readSegmentPaste("Revenue;Product;Direct costs\n1.000;Bread;600\nno revenue;Cake;");
  assert.deepEqual(reordered.segments, [{ name: "Bread", revenue: 1000, variableCosts: 600, fixedCosts: null }]);
  assert.deepEqual(reordered.skipped.map((s) => s.line), [3]);
  const plain = readSegmentPaste("North\t500\t300\t50\nSouth\t400\t350");
  assert.equal(plain.header, false);
  assert.deepEqual(plain.segments.map((s) => [s.name, s.revenue, s.variableCosts, s.fixedCosts]), [["North", 500, 300, 50], ["South", 400, 350, null]]);
});

test("validateSegments", () => {
  const { rows, table } = validateSegments([{ name: "", revenue: -1, variableCosts: Number.NaN, fixedCosts: -2 }]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["fixedCosts", "name", "revenue", "variableCosts"]);
  assert.match(table, /more than zero/);
  assert.match(validateSegments([]).table, /at least one/);
  assert.deepEqual(validateSegments(HAND), { rows: {}, table: null });
});

test("the fictional samples: the bakery's product lines add up to the bakery in the rating examples", () => {
  const bakery = analyseSegments(SEGMENT_SAMPLES.find((s) => s.id === "bakery").segments);
  const rated = SAMPLES.find((s) => s.id === "bakery").values;
  assert.equal(bakery.totals.revenue, rated.revenue);
  assert.equal(bakery.totals.variableCosts, rated.cogs);
  for (const lang of ["en", "hr"]) {
    useLanguage(lang);
    for (const sample of SEGMENT_SAMPLES) {
      assert.ok(sample.fictional && sample.name && sample.description, `${lang} ${sample.id}`);
      const a = analyseSegments(sample.segments);
      assert.ok(a.lossMakers.count > 0, `${sample.id} has a loss-maker to learn from`);
      assert.ok(!/\{\w+\}/.test(segmentSummary(a)), `${lang} ${sample.id} summary`);
    }
    assert.ok(SEGMENT_KINDS.every((k) => k.label));
  }
});

test("segmentsCsv: machine-readable header and raw numbers", () => {
  const [head, first] = segmentsCsv(analyseSegments(HAND)).split("\r\n");
  assert.equal(head, "rank,segment,revenue,variable_costs,contribution,cm_ratio,direct_fixed_costs,segment_profit,profit_share,cumulative_profit_share");
  assert.equal(first, "1,C,200,150,50,0.25,,50,0.714286,0.714286");
});

test("profitCurve and topShare (shared with the messaging case study)", () => {
  const curve = profitCurve([{ p: 1 }, { p: 5 }, { p: -2 }, { p: 4 }], (x) => x.p);
  assert.deepEqual(curve.points.map((pt) => pt.profit), [5, 4, 1, -2]);
  assert.equal(curve.totalProfit, 8);
  assert.equal(curve.peak.rank, 3);
  assert.deepEqual(topShare(curve), { count: 1, share: 5 / 8 });
  assert.deepEqual(topShare(profitCurve([], (x) => x)), { count: 0, share: null });
  assert.equal(topShare(profitCurve(Array.from({ length: 13 }, (_, i) => i), (x) => x)).count, 3, "round(13 × 0.2) = 3");
});

test("sparklineGeometry: a line through the known values, gaps for missing ones, zero line when the range crosses it", () => {
  const g = sparklineGeometry([1, null, 3], { width: 100, height: 20, pad: 0 });
  assert.equal(g.path, "M0 20M100 0");
  assert.equal(g.points.length, 2);
  assert.equal(g.zeroY, null);
  const cross = sparklineGeometry([-1, 1], { width: 10, height: 10, pad: 0 });
  assert.equal(cross.path, "M0 10L10 0");
  assert.equal(cross.zeroY, 5);
  const flat = sparklineGeometry([2, 2], { width: 10, height: 10, pad: 0 });
  assert.equal(flat.path, "M0 5L10 5");
  assert.deepEqual(sparklineGeometry([null, null]), { path: "", points: [], last: null, zeroY: null });
});
