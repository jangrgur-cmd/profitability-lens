// rating.js: rates a company's profitability from its input values.
//
//   rate(values, industryId) → score 0–100, grade A–E, the eight ratios with
//   benchmark bands, DuPont, key figures, red flags and a one-sentence summary.
//
// Method (also in "How the rating works" in the UI):
// 1. Each available ratio is scored 0–100 against the industry's thresholds
//    (see scoreAgainstThresholds in src/shared/margin.js).
// 2. The overall score is the weighted average of the available ratios, with
//    the weights renormalised so missing ratios neither help nor hurt.
// 3. The grade follows from the score rounded to a whole number.

import { bandFor, scoreAgainstThresholds } from "../shared/margin.js";
import { formatMultiple, formatPct } from "../shared/format.js";
import { validateValues } from "./fields.js";
import { RATIOS, computeRatios, deriveStatement, dupont } from "./ratios.js";
import { BENCHMARK_SOURCE, DEFAULT_INDUSTRY_ID, getIndustry } from "./benchmarks.js";
import { t } from "../shared/i18n.js";

/** Grades from best to worst; a score at or above `min` earns the grade. */
export const GRADES = [["A", 80], ["B", 65], ["C", 50], ["D", 35], ["E", 0]].map(([letter, min]) => ({
  letter,
  min,
  get label() { return t(`rating.grades.${letter}`); },
}));

/** Flag severities, most serious first. */
export const SEVERITIES = ["critical", "serious", "warning", "info"];

/**
 * The limits behind the red flags (also printed on the cheat sheet).
 *   lowCoverageShare     below this share of the total weight the rating rests on too few ratios
 *   minInterestCover     interest cover (EBIT ÷ interest) below this is a serious flag
 *   maxEquityMultiplier  above this, leverage drives much of ROE
 *   maxDaShareOfEbitda   D&A above this share of EBITDA: asset wear eats most operating cash profit
 */
export const FLAG_LIMITS = Object.freeze({
  lowCoverageShare: 0.6,
  minInterestCover: 1.5,
  maxEquityMultiplier: 3,
  maxDaShareOfEbitda: 0.5,
});
const {
  lowCoverageShare: LOW_COVERAGE_SHARE, minInterestCover: MIN_INTEREST_COVER,
  maxEquityMultiplier: MAX_EQUITY_MULTIPLIER, maxDaShareOfEbitda: MAX_DA_SHARE_OF_EBITDA,
} = FLAG_LIMITS;
/** Prior-year fields; a sentence names them with rating.flags.noPriorYear.<id>. */
const PRIOR_YEAR_FIELDS = ["priorAssets", "priorEquity"];

/**
 * The grade for a whole-number score.
 * @param {number} score 0–100
 * @returns {{letter: string, label: string, min: number}}
 */
export function gradeFor(score) {
  return GRADES.find((g) => score >= g.min) ?? GRADES[GRADES.length - 1];
}

/**
 * The grade scale in words: "A 80+ (Excellent), B 65+ (Strong), …, E below 35 (Poor)".
 * @returns {string}
 */
export function gradeScaleText() {
  return GRADES.map((g, i) => (g.min > 0
    ? t("rating.page.gradeFrom", { letter: g.letter, min: g.min, label: g.label })
    : t("rating.page.gradeBelow", { letter: g.letter, min: GRADES[i - 1].min, label: g.label }))).join(t("common.listSeparator"));
}

/**
 * Rates a company.
 * @param {Record<string, number|null>} values validated input values (see fields.js)
 * @param {string} [industryId] one of INDUSTRIES; defaults to "general"
 * @returns {object} the full rating, see the return statement for its shape
 * @throws {Error} when the values do not pass validation
 */
export function rate(values, industryId = DEFAULT_INDUSTRY_ID) {
  const errors = Object.values(validateValues(values));
  if (errors.length > 0) throw new Error(t("rating.validation.cannotRate", { errors: errors.join(" ") }));

  const industry = getIndustry(industryId);
  const statement = deriveStatement(values);
  const results = computeRatios(statement);

  const ratios = RATIOS.map((def) => {
    const result = results[def.id];
    const thresholds = industry.thresholds[def.id];
    const scored = result.status === "ok"
      ? { score: scoreAgainstThresholds(result.value * 100, thresholds), band: bandFor(result.value * 100, thresholds) }
      : { score: null, band: null };
    const { compute, ...text } = def;
    return { ...text, ...result, ...scored, thresholds };
  });

  const available = ratios.filter((r) => r.status === "ok");
  const availableWeight = available.reduce((sum, r) => sum + r.weight, 0);
  const totalWeight = ratios.reduce((sum, r) => sum + r.weight, 0);
  const rawScore = available.reduce((sum, r) => sum + r.score * r.weight, 0) / availableWeight;
  const score = Math.round(rawScore);
  const grade = gradeFor(score);
  const coverage = {
    count: available.length,
    total: ratios.length,
    weightShare: availableWeight / totalWeight,
    label: t("rating.coverage", { count: available.length, total: ratios.length }),
  };
  const breakdown = dupont(statement);

  const rating = {
    industry: { id: industry.id, label: industry.label },
    benchmarkSource: { kind: BENCHMARK_SOURCE.kind, label: BENCHMARK_SOURCE.label, inlineLabel: BENCHMARK_SOURCE.inlineLabel, note: BENCHMARK_SOURCE.note },
    statement,
    keyFigures: {
      revenue: statement.revenue,
      grossProfit: statement.grossProfit,
      ebitda: statement.ebitda,
      ebit: statement.ebit,
      netIncome: statement.netIncome,
      interestCover: statement.interestCover,
    },
    ratios,
    dupont: breakdown,
    rawScore,
    score,
    grade,
    coverage,
  };
  rating.flags = buildFlags(values, rating);
  rating.summary = buildSummary(rating);
  return rating;
}

/**
 * Red flags: automatic warnings, most serious first.
 * @returns {{id: string, severity: string, title: string, detail: string}[]}
 */
function buildFlags(values, { statement: s, ratios, dupont: d, coverage }) {
  const flags = [];
  const add = (id, key, severity, detail) => flags.push({ id, severity, title: t(`rating.flags.${key}.title`), detail });
  const detail = (key, params) => t(`rating.flags.${key}.detail`, params);

  if (s.netIncome < 0) {
    add("net_loss", "netLoss", "critical", detail("netLoss", { pct: formatPct(s.netIncome / s.revenue) }));
  }
  if (s.equity <= 0) {
    add("negative_equity", "negativeEquity", "critical", detail("negativeEquity"));
  }
  if (s.grossProfit !== null && s.grossProfit > 0 && s.ebit < 0) {
    add("operating_loss", "operatingLoss", "serious", detail("operatingLoss"));
  }
  if (s.interestCover !== null && s.interestCover < MIN_INTEREST_COVER) {
    add("low_interest_cover", "lowInterestCover", "serious", s.ebit <= 0
      ? t("rating.flags.lowInterestCover.detailNoEbit")
      : detail("lowInterestCover", { cover: formatMultiple(s.interestCover), min: formatMultiple(MIN_INTEREST_COVER, 1) }));
  }
  if (d.status === "ok" && d.equityMultiplier > MAX_EQUITY_MULTIPLIER) {
    add("leverage_inflated_roe", "leverage", "warning", detail("leverage", { multiplier: formatMultiple(d.equityMultiplier, 1) }));
  }
  if (s.ebitda > 0 && (values.da ?? 0) > MAX_DA_SHARE_OF_EBITDA * s.ebitda) {
    add("high_depreciation", "highDepreciation", "warning", detail("highDepreciation", { pct: formatPct(values.da / s.ebitda, 0) }));
  }
  if (coverage.weightShare < LOW_COVERAGE_SHARE) {
    const left = ratios.filter((r) => r.status !== "ok").map((r) => r.label);
    add("low_coverage", "lowCoverage", "warning", detail("lowCoverage", {
      coverage: coverage.label, share: formatPct(coverage.weightShare, 0), list: left.join(t("common.listSeparator")),
    }));
  }
  const noPrior = PRIOR_YEAR_FIELDS.filter((id) => values[id] === null || values[id] === undefined);
  if (noPrior.length > 0) {
    add("no_prior_year", "noPriorYear", "info", detail("noPriorYear", {
      names: noPrior.map((id) => t(`rating.flags.noPriorYear.${id}`)).join(t("common.and")),
    }));
  }
  return flags.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
}

/** "ROE (24.0%, Excellent)". */
const describe = (r) => t("rating.summary.ratio", { name: r.shortLabel, value: formatPct(r.value), band: r.band.label });

/**
 * One plain-language sentence on the result, plus a second one when there
 * are critical or serious flags.
 */
function buildSummary({ grade, score, industry, ratios, flags }) {
  const scored = ratios.filter((r) => r.status === "ok");
  const strongest = scored.reduce((best, r) => (r.score > best.score ? r : best));
  const weakest = scored.reduce((worst, r) => (r.score < worst.score ? r : worst));
  let text = t("rating.summary.lead", { grade: grade.label, letter: grade.letter, score, industry: industry.label });
  text += strongest === weakest
    ? t("rating.summary.single", { ratio: describe(strongest) })
    : t("rating.summary.range", { best: describe(strongest), worst: describe(weakest) });
  const serious = flags.filter((f) => f.severity === "critical" || f.severity === "serious");
  if (serious.length > 0) text += t("rating.summary.watch", { flags: serious.map((f) => f.title.toLowerCase()).join("; ") });
  return text;
}
