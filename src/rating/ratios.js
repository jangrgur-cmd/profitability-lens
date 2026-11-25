// ratios.js: the derived income statement, the eight profitability ratios
// and the DuPont breakdown of ROE.
//
// Pure functions: values in, numbers out. A ratio is never faked: each one
// comes back as "ok" with a value, "missing" naming the blank input it needs,
// or "not_meaningful" with the reason (for example negative equity).
// Ratio values are shares (0.15 for 15%).

import { safeDivide, margin } from "../shared/margin.js";
import { t } from "../shared/i18n.js";

/** Income tax rates above this are treated as one-offs and capped for NOPAT. */
const MAX_TAX_RATE = 0.5;

/**
 * @typedef {object} Statement
 * @property {number} revenue
 * @property {number|null} grossProfit null when COGS is blank
 * @property {number} ebitda
 * @property {number} ebit
 * @property {number} ebt
 * @property {number} netIncome
 * @property {number} taxRate effective tax rate used for NOPAT, 0–0.5
 * @property {number} nopat
 * @property {number} avgAssets
 * @property {number} avgEquity
 * @property {number} equity year-end equity
 * @property {number|null} capitalEmployed null when current liabilities are blank
 * @property {number|null} investedCapital null when debt is blank
 * @property {number|null} interestCover EBIT ÷ interest; null without interest expense
 */

/**
 * Builds the derived statement from validated input values.
 *
 *   GrossProfit = Revenue − COGS
 *   EBITDA      = Revenue − COGS − Opex   (COGS counts as 0 when blank)
 *   EBIT        = EBITDA − D&A
 *   EBT         = EBIT + OtherIncome − Interest
 *   NetIncome   = EBT − Tax
 *   TaxRate     = Tax ÷ EBT if EBT > 0 (clamped 0–50%), else 0
 *   NOPAT       = EBIT × (1 − TaxRate)
 *   AvgAssets   = (Assets + PriorAssets) ÷ 2, or Assets without a prior year (same for equity)
 *   CapitalEmployed = TotalAssets − CurrentLiabilities
 *   InvestedCapital = Debt + Equity − Cash   (cash counts as 0 when blank)
 *
 * Blank optional amounts count as 0, except the three that a ratio needs:
 * COGS, current liabilities and debt, which stay null.
 * @param {Record<string, number|null>} values
 * @returns {Statement}
 */
export function deriveStatement(values) {
  const n = (id) => values[id] ?? 0;
  const given = (id) => values[id] !== null && values[id] !== undefined;

  const revenue = values.revenue;
  const ebitda = revenue - n("cogs") - n("opex");
  const ebit = ebitda - n("da");
  const ebt = ebit + n("otherIncome") - n("interest");
  const netIncome = ebt - n("tax");
  const taxRate = ebt > 0 ? Math.min(Math.max(n("tax") / ebt, 0), MAX_TAX_RATE) : 0;
  const average = (end, prior) => (given(prior) ? (values[end] + values[prior]) / 2 : values[end]);

  return {
    revenue,
    grossProfit: given("cogs") ? revenue - values.cogs : null,
    ebitda,
    ebit,
    ebt,
    netIncome,
    taxRate,
    nopat: ebit * (1 - taxRate),
    avgAssets: average("assets", "priorAssets"),
    avgEquity: average("equity", "priorEquity"),
    equity: values.equity,
    capitalEmployed: given("currentLiabilities") ? values.assets - values.currentLiabilities : null,
    investedCapital: given("debt") ? values.debt + values.equity - n("cash") : null,
    interestCover: n("interest") > 0 ? ebit / values.interest : null,
  };
}

/**
 * @typedef {object} RatioResult
 * @property {"ok"|"missing"|"not_meaningful"} status
 * @property {number|null} value share, e.g. 0.15; null unless status is "ok"
 * @property {number|null} numerator
 * @property {number|null} denominator
 * @property {string[]} [missing] field ids of the blank inputs (status "missing")
 * @property {string} [reason] why the ratio has no meaning (status "not_meaningful")
 */

const ok = (numerator, denominator) => ({ status: "ok", value: safeDivide(numerator, denominator), numerator, denominator });
const missing = (...fields) => ({ status: "missing", value: null, numerator: null, denominator: null, missing: fields });
const notMeaningful = (reason, numerator, denominator) => ({ status: "not_meaningful", value: null, numerator, denominator, reason });

/** ROE (and DuPont) need positive equity at year end and on average. */
function equityProblem(s) {
  if (s.equity <= 0) return t("rating.reasons.equity");
  if (s.avgEquity <= 0) return t("rating.reasons.avgEquity");
  return null;
}

/**
 * A ratio definition. `numeratorTerm` and `denominatorTerm` name its building blocks
 * (keys of rating.terms in the language files). Texts are getters, read in the
 * current interface language: `label`, `shortLabel` (the name inside a
 * sentence), `formula`, `numeratorLabel`, `denominatorLabel`, `meaning`
 * and `improve`. `compute` returns a RatioResult from a Statement.
 */
function ratio(id, group, weight, numeratorTerm, denominatorTerm, compute) {
  const text = (field) => t(`rating.ratios.${id}.${field}`);
  return {
    id, group, weight, numeratorTerm, denominatorTerm, compute,
    get label() { return text("label"); },
    get shortLabel() { return text("short"); },
    get formula() { return text("formula"); },
    get numeratorLabel() { return t(`rating.terms.${numeratorTerm}`); },
    get denominatorLabel() { return t(`rating.terms.${denominatorTerm}`); },
    get meaning() { return text("meaning"); },
    get improve() { return text("improve"); },
  };
}

/** The eight ratios, in display order. Weights add up to 100. */
export const RATIOS = [
  ratio("grossMargin", "margins", 10, "grossProfit", "revenue",
    (s) => (s.grossProfit === null ? missing("cogs") : ok(s.grossProfit, s.revenue))),
  ratio("ebitdaMargin", "margins", 10, "ebitda", "revenue",
    (s) => ok(s.ebitda, s.revenue)),
  ratio("operatingMargin", "margins", 15, "ebit", "revenue",
    (s) => ok(s.ebit, s.revenue)),
  ratio("netMargin", "margins", 15, "netIncome", "revenue",
    (s) => ok(s.netIncome, s.revenue)),
  ratio("roa", "returns", 15, "netIncome", "avgAssets",
    (s) => ok(s.netIncome, s.avgAssets)),
  ratio("roe", "returns", 15, "netIncome", "avgEquity",
    (s) => {
      const problem = equityProblem(s);
      return problem ? notMeaningful(problem, s.netIncome, s.avgEquity) : ok(s.netIncome, s.avgEquity);
    }),
  ratio("roce", "returns", 10, "ebit", "capitalEmployed",
    (s) => {
      if (s.capitalEmployed === null) return missing("currentLiabilities");
      if (s.capitalEmployed <= 0) return notMeaningful(t("rating.reasons.capitalEmployed"), s.ebit, s.capitalEmployed);
      return ok(s.ebit, s.capitalEmployed);
    }),
  ratio("roic", "returns", 10, "nopat", "investedCapital",
    (s) => {
      if (s.investedCapital === null) return missing("debt");
      if (s.investedCapital <= 0) return notMeaningful(t("rating.reasons.investedCapital"), s.nopat, s.investedCapital);
      return ok(s.nopat, s.investedCapital);
    }),
];

/**
 * Computes every ratio for a statement.
 * @param {Statement} statement
 * @returns {Record<string, RatioResult>} ratio id → result
 */
export function computeRatios(statement) {
  return Object.fromEntries(RATIOS.map((r) => [r.id, r.compute(statement)]));
}

/**
 * DuPont breakdown: ROE = Net margin × Asset turnover × Equity multiplier.
 *
 *   Net margin        = Net income ÷ Revenue
 *   Asset turnover    = Revenue ÷ Average total assets
 *   Equity multiplier = Average total assets ÷ Average equity
 *
 * Net margin and asset turnover are always available; the equity multiplier
 * and ROE are not meaningful when equity is zero or negative.
 * @param {Statement} s
 * @returns {{status: "ok"|"not_meaningful", netMargin: number, assetTurnover: number,
 *            equityMultiplier: number|null, roe: number|null, reason?: string}}
 */
export function dupont(s) {
  const netMargin = margin(s.netIncome, s.revenue);
  const assetTurnover = safeDivide(s.revenue, s.avgAssets);
  const problem = equityProblem(s);
  if (problem) return { status: "not_meaningful", netMargin, assetTurnover, equityMultiplier: null, roe: null, reason: problem };
  const equityMultiplier = safeDivide(s.avgAssets, s.avgEquity);
  return { status: "ok", netMargin, assetTurnover, equityMultiplier, roe: netMargin * assetTurnover * equityMultiplier };
}
