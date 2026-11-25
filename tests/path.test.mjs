// Tests for src/rating/path.js: what would move the grade.

import { test } from "node:test";
import assert from "node:assert/strict";
import { nextGrade, pointsByRatio, leverPaths, pathToNextGrade } from "../src/rating/path.js";
import { GRADES, rate } from "../src/rating/rating.js";
import { LEVERS, NO_CHANGE, applyWhatIf } from "../src/rating/whatif.js";
import { SAMPLES } from "../src/rating/samples.js";
import { CASES } from "../src/learn/cases.js";
import { HAND_CASE } from "./fixtures.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
const COMPANIES = [...SAMPLES, ...CASES];
const sample = (id) => SAMPLES.find((s) => s.id === id);

test("nextGrade steps up one grade and stops at A", () => {
  const grade = (letter) => GRADES.find((g) => g.letter === letter);
  assert.equal(nextGrade(grade("E")).letter, "D");
  assert.equal(nextGrade(grade("B")).letter, "A");
  assert.equal(nextGrade(grade("A")), null);
});

test("points by ratio for the hand case (by hand, General scale)", () => {
  // All eight ratios are available, so each share is weight ÷ 100.
  // Gross margin 40 % on 15/25/35/50 scores 75 + 5/15 × 25 = 83.33: 8.33 points, 1.67 missed;
  // at 41 % it would score 85, so +1 pp adds 1.67 × 0.10 = 0.17 points.
  // Net margin 9.6 % on 0/3/6/10 scores 97.5; at 10.6 % it scores 100: +1 pp adds 2.5 × 0.15 = 0.375.
  // EBITDA margin 20 % is already at "excellent", so +1 pp adds nothing.
  const rows = pointsByRatio(rate(HAND_CASE, "general"));
  const row = (id) => rows.find((r) => r.id === id);
  close(row("grossMargin").points, 8.333333333, "gross margin points");
  close(row("grossMargin").missed, 1.666666667, "gross margin missed");
  close(row("grossMargin").perPp, 0.166666667, "gross margin per pp");
  close(row("netMargin").perPp, 0.375, "net margin per pp");
  assert.equal(row("ebitdaMargin").perPp, 0);
  assert.deepEqual(rows.map((r) => r.id).slice(0, 2), ["grossMargin", "roce"], "biggest missed first");
});

test("points add up to the raw score, and points + missed = 100 × share", () => {
  for (const c of COMPANIES) {
    const rating = rate(c.values, c.industryId);
    const rows = pointsByRatio(rating);
    close(rows.reduce((sum, r) => sum + r.points, 0), rating.rawScore, c.id);
    close(rows.reduce((sum, r) => sum + r.share, 0), 1, `${c.id} shares`);
    for (const r of rows) close(r.points + r.missed, 100 * r.share, `${c.id} ${r.id}`);
    assert.equal(rows.length, rating.coverage.count, `${c.id}: only available ratios`);
  }
});

test("each lever's move is the smallest whole percent that reaches the next grade", () => {
  for (const c of COMPANIES) {
    const base = rate(c.values, c.industryId);
    const target = nextGrade(base.grade);
    if (!target) continue;
    for (const path of leverPaths(c.values, c.industryId, target)) {
      if (path.status !== "ok") continue;
      assert.ok(path.rating.score >= target.min, `${c.id} ${path.id} reaches ${target.letter}`);
      const lever = LEVERS.find((l) => l.id === path.id);
      for (let k = 1; k < Math.abs(path.change); k += 1) {
        for (const change of [k, -k]) {
          if (change > lever.max || change < lever.min) continue;
          const score = rate(applyWhatIf(c.values, { ...NO_CHANGE, [path.id]: change }), c.industryId).score;
          assert.ok(score < target.min, `${c.id} ${path.id}: ${change}% already reaches ${target.letter}`);
        }
      }
    }
  }
});

test("examples: the bakery (B) and the hotel (C) can each reach the next grade with one lever", () => {
  const bakery = pathToNextGrade(sample("bakery").values, "manufacturing");
  assert.equal(bakery.next.letter, "A");
  assert.equal(bakery.gap, 80 - bakery.rating.score);
  assert.ok(bakery.levers.every((l) => l.status === "ok"));
  assert.ok(bakery.levers.find((l) => l.id === "price").change > 0, "prices go up");
  assert.ok(bakery.levers.find((l) => l.id === "opex").change < 0, "overheads go down");

  const hotel = pathToNextGrade(sample("hotel").values, "tourism");
  assert.equal(hotel.next.letter, "B");
  assert.equal(hotel.levers.find((l) => l.id === "unitCost").status, "needs_input", "no COGS, no unit-cost lever");
});

test("a gap too big for one lever is reported, not faked; the top grade has no path", () => {
  const startup = pathToNextGrade(sample("startup").values, "software");
  assert.equal(startup.rating.grade.letter, "E");
  assert.ok(startup.levers.every((l) => l.status === "out_of_range" && l.change === null && l.rating === null));

  const top = pathToNextGrade(HAND_CASE, "general");
  assert.equal(top.rating.grade.letter, "A");
  assert.equal(top.next, null);
  assert.equal(top.levers, null);
  assert.equal(top.points.length, 8);
});
