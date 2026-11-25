// years.js: two to five financial years of one company.
//
// The user enters the latest year and up to four earlier ones, newest first.
// Each year is rated on its own; the balance sheet of the year before gives
// the averages (ROA, ROE) that the single-year form takes from the "prior
// year" fields. Only the oldest year can still use those fields.
//
// Pure functions: values in, ratings and year-on-year changes out.

import { FIELDS, validateValues } from "./fields.js";
import { rate } from "./rating.js";
import { RATIOS } from "./ratios.js";
import { KEY_FIGURES } from "./report.js";
import { safeDivide } from "../shared/margin.js";
import { formatPp, formatSignedPct } from "../shared/format.js";
import { t } from "../shared/i18n.js";

/** At most this many years (the latest plus four earlier ones). */
export const MAX_YEARS = 5;

/** Fields of one year's statements; the prior-year fields come from the year before. */
export const YEAR_FIELD_IDS = FIELDS.filter((f) => f.group !== "prior").map((f) => f.id);

/** Fields only the oldest year uses: its own prior-year balance sheet. */
export const PRIOR_FIELD_IDS = FIELDS.filter((f) => f.group === "prior").map((f) => f.id);

/**
 * @typedef {object} YearInput
 * @property {number} year financial year, e.g. 2025
 * @property {Record<string, number|null>} values the year's input values
 */

/**
 * Gives each year the balance sheet of the year before as its prior year.
 * The oldest year keeps its own prior-year fields (or none).
 * @param {YearInput[]} years newest first
 * @returns {Record<string, number|null>[]} values per year, newest first, ready for rate()
 */
export function chainYears(years) {
  return years.map(({ values }, i) => {
    const older = years[i + 1];
    if (!older) return { ...values };
    return { ...values, priorAssets: older.values.assets ?? null, priorEquity: older.values.equity ?? null };
  });
}

/**
 * Checks every year. Errors are keyed by year index, then field id.
 * @param {YearInput[]} years newest first
 * @returns {Record<number, Record<string, string>>} empty when all years are valid
 */
export function validateYears(years) {
  const chained = chainYears(years);
  const errors = {};
  chained.forEach((values, i) => {
    const own = validateValues(values);
    // A prior-year problem in a chained year is the older year's own error, reported there.
    if (i < years.length - 1) for (const id of PRIOR_FIELD_IDS) delete own[id];
    if (Object.keys(own).length > 0) errors[i] = own;
  });
  return errors;
}

/** Relative change, or null when the earlier value is zero or negative (a % change of a loss has no meaning). */
export function relativeChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return safeDivide(current - previous, previous);
}

/**
 * Rates every year and works out the trend.
 * @param {YearInput[]} years newest first, 1 to MAX_YEARS entries, valid (see validateYears)
 * @param {string} industryId
 * @returns {{
 *   years: {year: number, values: object, rating: object}[],
 *   series: {score: number[], ratios: Record<string, (number|null)[]>, keyFigures: Record<string, (number|null)[]>},
 *   yoy: null | {year: number, previousYear: number, score: number, gradeChanged: boolean,
 *                ratios: Record<string, number|null>, keyFigures: Record<string, number|null>},
 * }} series run oldest → newest (for sparklines); yoy compares the latest year with the one before
 */
export function rateYears(years, industryId) {
  if (years.length === 0 || years.length > MAX_YEARS) throw new Error(`Between 1 and ${MAX_YEARS} years are needed, got ${years.length}`);
  const chained = chainYears(years);
  const rated = years.map((y, i) => ({ year: y.year, values: chained[i], rating: rate(chained[i], industryId) }));
  const oldestFirst = [...rated].reverse();

  const ratioValue = (rating, id) => rating.ratios.find((r) => r.id === id).value;
  const series = {
    score: oldestFirst.map((y) => y.rating.score),
    ratios: Object.fromEntries(RATIOS.map((r) => [r.id, oldestFirst.map((y) => ratioValue(y.rating, r.id))])),
    keyFigures: Object.fromEntries(KEY_FIGURES.map((k) => [k.id, oldestFirst.map((y) => y.rating.keyFigures[k.id])])),
  };

  let yoy = null;
  if (rated.length > 1) {
    const [latest, previous] = rated;
    const diff = (a, b) => (a === null || b === null ? null : a - b);
    yoy = {
      year: latest.year,
      previousYear: previous.year,
      score: latest.rating.score - previous.rating.score,
      gradeChanged: latest.rating.grade.letter !== previous.rating.grade.letter,
      ratios: Object.fromEntries(RATIOS.map((r) => [r.id, diff(ratioValue(latest.rating, r.id), ratioValue(previous.rating, r.id))])),
      keyFigures: Object.fromEntries(KEY_FIGURES.map((k) => [k.id, k.kind === "eur"
        ? relativeChange(latest.rating.keyFigures[k.id], previous.rating.keyFigures[k.id])
        : diff(latest.rating.keyFigures[k.id], previous.rating.keyFigures[k.id])])),
    };
  }
  return { years: rated, series, yoy };
}

/**
 * One or two sentences on the trend, for the page and the text summary:
 * "Score up 6 points on 2024 (grade B → A). Biggest improvement: net margin (+2.1 pp); biggest fall: ROCE (−1.4 pp)."
 * @param {ReturnType<typeof rateYears>} trend
 * @returns {string|null} null with only one year
 */
export function trendSentence(trend) {
  if (!trend.yoy) return null;
  const { yoy } = trend;
  const [latest, previous] = trend.years;
  const grade = yoy.gradeChanged ? t("rating.trend.gradeChange", { from: previous.rating.grade.letter, to: latest.rating.grade.letter }) : "";
  const params = { count: Math.abs(yoy.score), year: yoy.previousYear, grade };
  let text = t(yoy.score === 0 ? "rating.trend.scoreSame" : yoy.score > 0 ? "rating.trend.scoreUp" : "rating.trend.scoreDown", params);

  const moves = RATIOS.map((r) => ({ ratio: r, change: yoy.ratios[r.id] })).filter((m) => m.change !== null && Math.abs(m.change) >= 0.0005);
  const up = moves.filter((m) => m.change > 0).sort((a, b) => b.change - a.change)[0];
  const down = moves.filter((m) => m.change < 0).sort((a, b) => a.change - b.change)[0];
  const name = (m) => m.ratio.shortLabel;
  if (up && down) text += t("rating.trend.movesBoth", { up: name(up), upBy: formatPp(up.change), down: name(down), downBy: formatPp(down.change) });
  else if (up) text += t("rating.trend.movesUp", { up: name(up), upBy: formatPp(up.change) });
  else if (down) text += t("rating.trend.movesDown", { down: name(down), downBy: formatPp(down.change) });

  const growth = yoy.keyFigures.revenue;
  if (growth !== null) text += t("rating.trend.revenue", { change: formatSignedPct(growth), year: yoy.year });
  return text;
}
