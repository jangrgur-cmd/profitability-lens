// challenges.js: "Fix the company" exercises. Each challenge takes one of the
// FICTIONAL practice cases (cases.js), sets a goal grade and says which What
// if… levers the student may move; some fix a lever first (a price war fixes
// prices at −3 %). The grade is worked out live by the Company rating engine
// through applyWhatIf, so a challenge can never disagree with the rating
// page. tests/learn.test.mjs checks that every challenge starts below its
// goal and can be solved with its own levers.
//
// Pure functions; texts are read in the interface language.

import { CASE_BY_ID } from "./cases.js";
import { GRADES, rate } from "../rating/rating.js";
import { LEVERS, NO_CHANGE, applyWhatIf } from "../rating/whatif.js";
import { leverPaths } from "../rating/path.js";
import { t } from "../shared/i18n.js";

/**
 * @typedef {object} Challenge
 * @property {string} id
 * @property {object} practiceCase the case from cases.js
 * @property {{letter: string, min: number, label: string}} goal the grade to reach
 * @property {string[]} levers the lever ids the student may move
 * @property {Record<string, number>} fixed lever positions set by the challenge, in percent
 * @property {string} title
 * @property {string} task what to do, in a sentence or two
 * @property {string} lesson the take-away, shown once the goal is reached
 */

function challenge(id, caseId, goalLetter, levers, fixed = {}) {
  const practiceCase = CASE_BY_ID[caseId];
  if (!practiceCase) throw new Error(`Unknown case: ${caseId}`);
  const goal = GRADES.find((g) => g.letter === goalLetter);
  return {
    id, practiceCase, goal, levers, fixed,
    get title() { return t(`learn.fix.challenges.${id}.title`); },
    get task() { return t(`learn.fix.challenges.${id}.task`); },
    get lesson() { return t(`learn.fix.challenges.${id}.lesson`); },
  };
}

/** @type {Challenge[]} easiest first */
export const CHALLENGES = [
  challenge("growth", "saas", "A", ["volume"]),
  challenge("overheads", "metalworks", "A", ["opex"]),
  challenge("noPriceRise", "reseller", "C", ["volume", "opex"]),
  challenge("priceWar", "supermarket", "A", ["volume", "unitCost", "opex"], { price: -3 }),
  challenge("turnaround", "bistro", "D", ["volume", "price", "opex"]),
];

/** Challenges by id. */
export const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

/** The lever definitions a challenge lets the student move. */
export function challengeLevers(ch) {
  return LEVERS.filter((l) => ch.levers.includes(l.id));
}

/**
 * Rates a challenge's company with the student's lever positions; the
 * challenge's fixed levers always apply and other levers stay at zero.
 * @param {Challenge} ch
 * @param {Record<string, number>} [levers] lever id → percent
 * @returns {{rating: object, reached: boolean}}
 */
export function tryChallenge(ch, levers = {}) {
  const allowed = Object.fromEntries(ch.levers.map((id) => [id, levers[id] ?? 0]));
  const rating = rate(applyWhatIf(ch.practiceCase.values, { ...NO_CHANGE, ...allowed, ...ch.fixed }), ch.practiceCase.industryId);
  return { rating, reached: rating.score >= ch.goal.min };
}

/**
 * One way to solve a challenge: the smallest single move of an allowed
 * lever that reaches the goal, or null when only a combination does.
 * @param {Challenge} ch
 * @returns {{id: string, label: string, change: number, rating: object}|null}
 */
export function challengeSolution(ch) {
  const paths = leverPaths(ch.practiceCase.values, ch.practiceCase.industryId, ch.goal, { base: ch.fixed, only: ch.levers })
    .filter((p) => p.status === "ok")
    .sort((a, b) => Math.abs(a.change) - Math.abs(b.change));
  return paths[0] ?? null;
}

/**
 * Keeps only stored solved ids that still name a challenge.
 * @param {unknown} ids
 * @returns {string[]}
 */
export function cleanSolved(ids) {
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && CHALLENGE_BY_ID[id]) : [];
}
