// ratios.js: the derived income statement, the eight profitability ratios
// and the DuPont breakdown of ROE.
//
// Pure functions: values in, numbers out. A ratio is never faked: each one
// comes back as "ok" with a value, "missing" naming the blank input it needs,
// or "not_meaningful" with the reason (for example negative equity).
// Ratio values are shares (0.15 for 15%).

import { safeDivide, margin } from "../shared/margin.js";

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
  if (s.equity <= 0) return "Equity is zero or negative, so a return on it has no meaning.";
  if (s.avgEquity <= 0) return "Average equity is zero or negative, so a return on it has no meaning.";
  return null;
}

/**
 * The eight ratios, in display order. Weights add up to 100.
 * `shortLabel` is the name inside a sentence; `formula` names the parts; `compute` returns a RatioResult from a Statement.
 */
export const RATIOS = [
  {
    id: "grossMargin", label: "Gross margin", shortLabel: "gross margin", group: "margins", weight: 10,
    formula: "Gross profit ÷ Revenue", numeratorLabel: "Gross profit", denominatorLabel: "Revenue",
    meaning: "How much of each sale is left after the direct cost of what was sold. It reflects pricing power and purchasing or production efficiency.",
    improve: "Raise prices or move the mix towards higher-margin products; negotiate supplier prices; cut waste in production.",
    compute: (s) => (s.grossProfit === null ? missing("cogs") : ok(s.grossProfit, s.revenue)),
  },
  {
    id: "ebitdaMargin", label: "EBITDA margin", shortLabel: "EBITDA margin", group: "margins", weight: 10,
    formula: "EBITDA ÷ Revenue", numeratorLabel: "EBITDA", denominatorLabel: "Revenue",
    meaning: "Operating profit before depreciation and amortisation: the cash-like profit the day-to-day business generates from each sale.",
    improve: "Grow revenue faster than fixed costs; review staff, rent and service contracts; automate repetitive work.",
    compute: (s) => ok(s.ebitda, s.revenue),
  },
  {
    id: "operatingMargin", label: "Operating margin (EBIT)", shortLabel: "operating margin", group: "margins", weight: 15,
    formula: "EBIT ÷ Revenue", numeratorLabel: "EBIT", denominatorLabel: "Revenue",
    meaning: "Profit from operations after all operating costs, including the wear of assets, before interest and tax.",
    improve: "Everything that lifts EBITDA margin, plus using assets longer or selling idle ones to lower depreciation.",
    compute: (s) => ok(s.ebit, s.revenue),
  },
  {
    id: "netMargin", label: "Net margin", shortLabel: "net margin", group: "margins", weight: 15,
    formula: "Net income ÷ Revenue", numeratorLabel: "Net income", denominatorLabel: "Revenue",
    meaning: "What is left for the owners from each sale after every cost, interest and tax.",
    improve: "Improve operating margin; refinance expensive debt; use legitimate tax reliefs.",
    compute: (s) => ok(s.netIncome, s.revenue),
  },
  {
    id: "roa", label: "Return on assets (ROA)", shortLabel: "ROA", group: "returns", weight: 15,
    formula: "Net income ÷ Average total assets", numeratorLabel: "Net income", denominatorLabel: "Average total assets",
    meaning: "How much profit the company earns on everything it owns, however that is financed.",
    improve: "Raise margins, or sell more with the same assets: collect receivables faster, hold less stock, dispose of idle assets.",
    compute: (s) => ok(s.netIncome, s.avgAssets),
  },
  {
    id: "roe", label: "Return on equity (ROE)", shortLabel: "ROE", group: "returns", weight: 15,
    formula: "Net income ÷ Average equity", numeratorLabel: "Net income", denominatorLabel: "Average equity",
    meaning: "The return the owners earn on the capital they have in the business. Debt raises it, but also raises risk: see the DuPont breakdown.",
    improve: "Raise margins and asset turnover. More debt lifts ROE too, but only safely while interest is well covered.",
    compute: (s) => {
      const problem = equityProblem(s);
      return problem ? notMeaningful(problem, s.netIncome, s.avgEquity) : ok(s.netIncome, s.avgEquity);
    },
  },
  {
    id: "roce", label: "Return on capital employed (ROCE)", shortLabel: "ROCE", group: "returns", weight: 10,
    formula: "EBIT ÷ (Total assets − Current liabilities)", numeratorLabel: "EBIT", denominatorLabel: "Capital employed",
    meaning: "Operating profit earned on the long-term capital in the business, from owners and lenders alike. Compare it with the cost of borrowing.",
    improve: "Raise operating margin; release capital tied up in stock, receivables or idle assets.",
    compute: (s) => {
      if (s.capitalEmployed === null) return missing("currentLiabilities");
      if (s.capitalEmployed <= 0) return notMeaningful("Current liabilities are at least as large as total assets, so capital employed is zero or negative.", s.ebit, s.capitalEmployed);
      return ok(s.ebit, s.capitalEmployed);
    },
  },
  {
    id: "roic", label: "Return on invested capital (ROIC)", shortLabel: "ROIC", group: "returns", weight: 10,
    formula: "NOPAT ÷ (Debt + Equity − Cash)", numeratorLabel: "NOPAT", denominatorLabel: "Invested capital",
    meaning: "After-tax operating profit on the money invested in operations. A business creates value when ROIC is above its cost of capital.",
    improve: "Raise operating margin; invest only in projects that earn more than the cost of capital; avoid holding more cash than needed while also borrowing.",
    compute: (s) => {
      if (s.investedCapital === null) return missing("debt");
      if (s.investedCapital <= 0) return notMeaningful("Cash exceeds debt plus equity, so invested capital is zero or negative.", s.nopat, s.investedCapital);
      return ok(s.nopat, s.investedCapital);
    },
  },
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
