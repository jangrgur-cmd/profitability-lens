// quiz.js: "Guess the grade". Pure functions: a practice case and a guess
// in, the verdict out. The right answer always comes from rate(), the same
// engine as the Company rating page.

import { rate, GRADES } from "../rating/rating.js";
import { t } from "../shared/i18n.js";

/** The grade letters, best first: A, B, C, D, E. */
export const GRADE_LETTERS = GRADES.map((g) => g.letter);

/**
 * Rates a practice case with the Company rating engine.
 * @param {{values: Record<string, number|null>, industryId: string}} practiceCase
 * @returns {object} the rating from rate()
 */
export function rateCase(practiceCase) {
  return rate(practiceCase.values, practiceCase.industryId);
}

/**
 * Compares a guess with the grade.
 * @param {string} guess a grade letter
 * @param {string} actual the grade letter rate() gave
 * @returns {{correct: boolean, steps: number, direction: "exact"|"tooHigh"|"tooLow", text: string}}
 *   steps: how many grades apart; tooHigh: the guess was better than the grade
 */
export function judgeGuess(guess, actual) {
  const g = GRADE_LETTERS.indexOf(guess);
  const a = GRADE_LETTERS.indexOf(actual);
  if (g < 0 || a < 0) throw new Error(`Unknown grade: ${g < 0 ? guess : actual}`);
  const steps = Math.abs(a - g);
  const direction = steps === 0 ? "exact" : g < a ? "tooHigh" : "tooLow";
  const text = steps === 0
    ? t("learn.quiz.exact", { letter: actual })
    : t(`learn.quiz.${direction}`, { count: steps, guess, letter: actual });
  return { correct: steps === 0, steps, direction, text };
}

/**
 * The running score over the answered cases.
 * @param {Record<string, string>} answers case id → guessed letter
 * @param {{id: string}[]} cases
 * @param {(practiceCase: object) => string} gradeOf the grade letter of a case
 * @returns {{answered: number, correct: number, total: number}}
 */
export function quizScore(answers, cases, gradeOf) {
  const answered = cases.filter((c) => GRADE_LETTERS.includes(answers[c.id]));
  return {
    answered: answered.length,
    correct: answered.filter((c) => answers[c.id] === gradeOf(c)).length,
    total: cases.length,
  };
}

/**
 * Keeps only valid answers from stored data (an old or edited localStorage entry).
 * @param {unknown} stored
 * @param {{id: string}[]} cases
 * @returns {Record<string, string>}
 */
export function cleanAnswers(stored, cases) {
  if (!stored || typeof stored !== "object") return {};
  const out = {};
  for (const c of cases) if (GRADE_LETTERS.includes(stored[c.id])) out[c.id] = stored[c.id];
  return out;
}
