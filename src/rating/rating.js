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

/** Grades from best to worst; a score at or above `min` earns the grade. */
export const GRADES = [
  { letter: "A", label: "Excellent", min: 80 },
  { letter: "B", label: "Strong", min: 65 },
  { letter: "C", label: "Adequate", min: 50 },
  { letter: "D", label: "Weak", min: 35 },
  { letter: "E", label: "Poor", min: 0 },
];

/** Flag severities, most serious first. */
export const SEVERITIES = ["critical", "serious", "warning", "info"];

/** Below this share of the total weight the rating rests on too few ratios. */
const LOW_COVERAGE_SHARE = 0.6;
/** Interest cover (EBIT ÷ interest) below this is a serious flag. */
const MIN_INTEREST_COVER = 1.5;
/** An equity multiplier above this means leverage drives much of ROE. */
const MAX_EQUITY_MULTIPLIER = 3;
/** D&A above this share of EBITDA means asset wear eats most operating cash profit. */
const MAX_DA_SHARE_OF_EBITDA = 0.5;
/** Prior-year fields and how a sentence names them. */
const PRIOR_YEAR_NAMES = { priorAssets: "total assets", priorEquity: "equity" };

/**
 * The grade for a whole-number score.
 * @param {number} score 0–100
 * @returns {{letter: string, label: string, min: number}}
 */
export function gradeFor(score) {
  return GRADES.find((g) => score >= g.min) ?? GRADES[GRADES.length - 1];
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
  if (errors.length > 0) throw new Error(`Cannot rate these inputs: ${errors.join(" ")}`);

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
    label: `${available.length} of ${ratios.length} ratios`,
  };
  const breakdown = dupont(statement);

  const rating = {
    industry: { id: industry.id, label: industry.label },
    benchmarkSource: BENCHMARK_SOURCE,
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
  const add = (id, severity, title, detail) => flags.push({ id, severity, title, detail });

  if (s.netIncome < 0) {
    add("net_loss", "critical", "Net loss",
      `The company lost money this year: net income is ${formatPct(s.netIncome / s.revenue)} of revenue.`);
  }
  if (s.equity <= 0) {
    add("negative_equity", "critical", "Equity is zero or negative",
      "Liabilities are at least as large as assets: past losses have used up the owners' capital. ROE cannot be measured.");
  }
  if (s.grossProfit !== null && s.grossProfit > 0 && s.ebit < 0) {
    add("operating_loss", "serious", "Operating loss despite a positive gross margin",
      "Sales cover their direct costs, but overheads and depreciation are larger than the gross profit.");
  }
  if (s.interestCover !== null && s.interestCover < MIN_INTEREST_COVER) {
    add("low_interest_cover", "serious", "Low interest cover",
      s.ebit <= 0
        ? "Operating profit (EBIT) is zero or negative, so it does not cover interest at all."
        : `Operating profit covers interest only ${formatMultiple(s.interestCover)} (below ${formatMultiple(MIN_INTEREST_COVER, 1)}): a small fall in profit would leave too little to pay lenders.`);
  }
  if (d.status === "ok" && d.equityMultiplier > MAX_EQUITY_MULTIPLIER) {
    add("leverage_inflated_roe", "warning", "ROE inflated by leverage",
      `Assets are ${formatMultiple(d.equityMultiplier, 1)} equity, so much of ROE comes from debt rather than from operations. Compare ROE with ROA.`);
  }
  if (s.ebitda > 0 && (values.da ?? 0) > MAX_DA_SHARE_OF_EBITDA * s.ebitda) {
    add("high_depreciation", "warning", "Depreciation takes over half of EBITDA",
      `Depreciation and amortisation are ${formatPct(values.da / s.ebitda, 0)} of EBITDA: the business needs heavy reinvestment to keep its assets running.`);
  }
  if (coverage.weightShare < LOW_COVERAGE_SHARE) {
    const left = ratios.filter((r) => r.status !== "ok").map((r) => r.label);
    add("low_coverage", "warning", "Rating based on few ratios",
      `Only ${coverage.label} (${formatPct(coverage.weightShare, 0)} of the weight) could be calculated. Missing or not meaningful: ${left.join(", ")}.`);
  }
  const noPrior = Object.keys(PRIOR_YEAR_NAMES).filter((id) => values[id] === null || values[id] === undefined);
  if (noPrior.length > 0) {
    add("no_prior_year", "info", "No prior-year figures",
      `Without prior-year ${noPrior.map((id) => PRIOR_YEAR_NAMES[id]).join(" and ")}, returns use year-end figures instead of the average over the year.`);
  }
  return flags.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
}

/** "ROE (24.0%, Excellent)". */
const describe = (r) => `${r.shortLabel} (${formatPct(r.value)}, ${r.band.label})`;

/**
 * One plain-language sentence on the result, plus a second one when there
 * are critical or serious flags.
 */
function buildSummary({ grade, score, industry, ratios, flags }) {
  const scored = ratios.filter((r) => r.status === "ok");
  const strongest = scored.reduce((best, r) => (r.score > best.score ? r : best));
  const weakest = scored.reduce((worst, r) => (r.score < worst.score ? r : worst));
  let text = `${grade.label} profitability: grade ${grade.letter} (${score}/100) against rule-of-thumb ${industry.label} benchmarks`;
  text += strongest === weakest
    ? `, based on ${describe(strongest)}.`
    : `; strongest is ${describe(strongest)}, weakest is ${describe(weakest)}.`;
  const serious = flags.filter((f) => f.severity === "critical" || f.severity === "serious");
  if (serious.length > 0) text += ` Watch out: ${serious.map((f) => f.title.toLowerCase()).join("; ")}.`;
  return text;
}
