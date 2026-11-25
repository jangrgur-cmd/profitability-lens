// path.js: what would move the grade, for the Company rating.
//
// Two views of the same score:
//
// 1. Points by ratio. The score is the weighted average of the ratio scores,
//    so each available ratio earns score × weight share points and misses
//    (100 − score) × weight share. The earned points add up to the score.
//    "Per +1 pp" is how many points one more percentage point of the ratio
//    would add, with every other ratio unchanged: where the score is most
//    sensitive. (No single ratio can usually close a gap on its own: the
//    largest weight is 15 % of the total.)
//
// 2. One lever at a time. The smallest whole-percent move of each What if…
//    lever (src/rating/whatif.js) that reaches the next grade, within the
//    lever's range. A lever moves several ratios together, as a real change
//    would, and the result is the full rating of the changed figures.
//
// Pure functions; ratio values are shares (0.096 for 9.6 %).

import { scoreAgainstThresholds } from "../shared/margin.js";
import { GRADES, rate } from "./rating.js";
import { LEVERS, NO_CHANGE, applyWhatIf } from "./whatif.js";

/** One percentage point, as a share. */
const ONE_PP = 0.01;

/**
 * The grade above a grade, or null for the top grade.
 * @param {{letter: string}} grade
 * @returns {{letter: string, min: number, label: string}|null}
 */
export function nextGrade(grade) {
  const i = GRADES.findIndex((g) => g.letter === grade.letter);
  return i > 0 ? GRADES[i - 1] : null;
}

/**
 * Points earned and missed by each available ratio.
 * @param {object} rating from rate()
 * @returns {{id: string, label: string, weight: number, share: number, score: number,
 *            points: number, missed: number, perPp: number}[]} biggest missed first;
 *   share: the ratio's share of the available weight; points add up to rating.rawScore;
 *   perPp: points added to the score by +1 percentage point of this ratio alone
 */
export function pointsByRatio(rating) {
  const available = rating.ratios.filter((r) => r.status === "ok");
  const total = available.reduce((sum, r) => sum + r.weight, 0);
  return available
    .map((r) => {
      const share = r.weight / total;
      const up = scoreAgainstThresholds((r.value + ONE_PP) * 100, r.thresholds);
      return {
        id: r.id, label: r.label, weight: r.weight, share, score: r.score,
        points: r.score * share, missed: (100 - r.score) * share, perPp: (up - r.score) * share,
      };
    })
    .sort((a, b) => b.missed - a.missed || b.weight - a.weight);
}

/**
 * The smallest whole-percent move of each lever that reaches a target grade,
 * trying both directions; the smaller move wins, a rise before a fall.
 * @param {Record<string, number|null>} values validated input values
 * @param {string} industryId
 * @param {{min: number}} target the grade to reach
 * @param {{base?: Record<string, number>, only?: string[]|null}} [options]
 *   base: lever positions that stay as they are (a "Fix the company" challenge
 *   can fix one, e.g. prices −3 %); only: the levers to try (default: all)
 * @returns {{id: string, label: string, status: "ok"|"out_of_range"|"needs_input",
 *            change: number|null, rating: object|null, min: number, max: number}[]}
 *   change in percent (−4 for −4 %), with the full rating it gives
 */
export function leverPaths(values, industryId, target, { base: start = NO_CHANGE, only = null } = {}) {
  return LEVERS.filter((lever) => !only || only.includes(lever.id)).map((lever) => {
    const base = { id: lever.id, label: lever.label, min: lever.min, max: lever.max, change: null, rating: null };
    if (lever.needs !== null && (values[lever.needs] === null || values[lever.needs] === undefined)) {
      return { ...base, status: "needs_input" };
    }
    const limit = Math.max(lever.max, -lever.min);
    for (let step = lever.step; step <= limit; step += lever.step) {
      for (const change of [step, -step]) {
        if (change > lever.max || change < lever.min) continue;
        const rating = rate(applyWhatIf(values, { ...NO_CHANGE, ...start, [lever.id]: change }), industryId);
        if (rating.score >= target.min) return { ...base, status: "ok", change, rating };
      }
    }
    return { ...base, status: "out_of_range" };
  });
}

/**
 * Everything the "path to the next grade" block shows.
 * @param {Record<string, number|null>} values validated input values (the latest year)
 * @param {string} industryId
 * @returns {{rating: object, next: object|null, gap: number|null,
 *            points: ReturnType<typeof pointsByRatio>, levers: ReturnType<typeof leverPaths>|null}}
 *   next, gap (points from the score to the next grade's minimum) and levers are null for the top grade
 */
export function pathToNextGrade(values, industryId) {
  const rating = rate(values, industryId);
  const next = nextGrade(rating.grade);
  const points = pointsByRatio(rating);
  if (!next) return { rating, next: null, gap: null, points, levers: null };
  return { rating, next, gap: next.min - rating.score, points, levers: leverPaths(values, industryId, next) };
}
