// report.js: the words around a rating — "Show the math", the DuPont
// sentences and the plain-text summary for "Copy summary".
//
// Pure functions: a rating from rate() in, strings out, in the current
// interface language (texts in src/shared/lang/, under rating.math,
// rating.dupont, rating.keyFigures and rating.text). The page (app.js) only
// places these strings.

import { formatEurFull, formatMultiple, formatNumber, formatPct, formatPerEuro } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { FIELD_BY_ID } from "./fields.js";

const eur = formatEurFull;
const given = (x) => x !== null && x !== undefined;

/** How each building block of a ratio is worked out, with the user's numbers. Keyed by rating.terms id. */
const DERIVATIONS = {
  grossProfit: (s, v) => t("rating.math.grossProfit", { revenue: eur(v.revenue), cogs: eur(v.cogs), result: eur(s.grossProfit) }),
  ebitda: (s, v) => (given(v.cogs)
    ? t("rating.math.ebitda", { revenue: eur(v.revenue), cogs: eur(v.cogs), opex: eur(v.opex ?? 0), result: eur(s.ebitda) })
    : t("rating.math.ebitdaNoCogs", { revenue: eur(v.revenue), opex: eur(v.opex ?? 0), result: eur(s.ebitda) })),
  ebit: (s, v) => t("rating.math.ebit", { ebitda: eur(s.ebitda), da: eur(v.da ?? 0), result: eur(s.ebit) }),
  netIncome: (s, v) => t("rating.math.netIncome", {
    ebit: eur(s.ebit), other: eur(v.otherIncome ?? 0), interest: eur(v.interest ?? 0), tax: eur(v.tax ?? 0), result: eur(s.netIncome),
  }),
  nopat: (s) => t("rating.math.nopat", { ebit: eur(s.ebit), rate: formatPct(s.taxRate), result: eur(s.nopat) }),
  avgAssets: (s, v) => (given(v.priorAssets)
    ? t("rating.math.avgAssets", { end: eur(v.assets), prior: eur(v.priorAssets), result: eur(s.avgAssets) })
    : t("rating.math.avgAssetsNoPrior", { end: eur(v.assets) })),
  avgEquity: (s, v) => (given(v.priorEquity)
    ? t("rating.math.avgEquity", { end: eur(v.equity), prior: eur(v.priorEquity), result: eur(s.avgEquity) })
    : t("rating.math.avgEquityNoPrior", { end: eur(v.equity) })),
  capitalEmployed: (s, v) => t("rating.math.capitalEmployed", {
    assets: eur(v.assets), currentLiabilities: eur(v.currentLiabilities), result: eur(s.capitalEmployed),
  }),
  investedCapital: (s, v) => t("rating.math.investedCapital", {
    debt: eur(v.debt), equity: eur(v.equity), cash: eur(v.cash ?? 0), result: eur(s.investedCapital),
  }),
};

/**
 * One line on a ratio's status for text and screen readers:
 * "40.0%", "Missing input: Cost of goods sold" or "Not meaningful: …".
 * @param {object} ratio one entry of rating.ratios
 * @returns {string}
 */
export function ratioStatusText(ratio) {
  if (ratio.status === "ok") return formatPct(ratio.value);
  if (ratio.status === "missing") {
    const fields = ratio.missing.map((id) => FIELD_BY_ID[id]?.label ?? id).join(t("common.listSeparator"));
    return t("rating.math.missing", { fields });
  }
  return t("rating.math.notMeaningful", { reason: ratio.reason });
}

/**
 * "Show the math" for one ratio: the formula, the formula with the user's
 * numbers, the result, and how each building block was worked out.
 * @param {object} ratio one entry of rating.ratios
 * @param {object} statement rating.statement
 * @param {Record<string, number|null>} values the input values that were rated
 * @returns {{formula: string, substituted: string|null, result: string, where: string[]}}
 */
export function explainRatio(ratio, statement, values) {
  if (ratio.status === "missing") {
    return { formula: ratio.formula, substituted: null, result: ratioStatusText(ratio), where: [] };
  }
  const where = [ratio.numeratorTerm, ratio.denominatorTerm]
    .map((term) => DERIVATIONS[term])
    .filter(Boolean)
    .map((derive) => derive(statement, values));
  return {
    formula: ratio.formula,
    substituted: t("rating.math.substituted", { numerator: eur(ratio.numerator), denominator: eur(ratio.denominator) }),
    result: ratio.status === "ok" ? t("rating.math.result", { value: formatPct(ratio.value) }) : ratioStatusText(ratio),
    where,
  };
}

/**
 * The DuPont breakdown in plain language, one sentence per factor.
 * @param {object} d rating.dupont
 * @returns {string[]}
 */
export function dupontSentences(d) {
  const lines = [
    t("rating.dupont.sentenceMargin", { perEuro: formatPerEuro(d.netMargin), margin: formatPct(d.netMargin) }),
    t("rating.dupont.sentenceTurnover", { perEuro: formatPerEuro(d.assetTurnover), turnover: formatMultiple(d.assetTurnover) }),
  ];
  if (d.status !== "ok") {
    lines.push(t("rating.dupont.sentenceNoMultiplier", { reason: d.reason }));
    return lines;
  }
  lines.push(t("rating.dupont.sentenceMultiplier", { perEuro: formatPerEuro(d.equityMultiplier), multiplier: formatMultiple(d.equityMultiplier) }));
  lines.push(t("rating.dupont.sentenceTogether", {
    margin: formatPct(d.netMargin),
    turnover: formatNumber(d.assetTurnover, 2),
    multiplier: formatNumber(d.equityMultiplier, 2),
    roe: formatPct(d.roe),
    perEuro: formatPerEuro(d.roe),
  }));
  return lines;
}

/** Key figures in display order. The label is read in the interface language. */
export const KEY_FIGURES = ["revenue", "grossProfit", "ebitda", "ebit", "netIncome", "interestCover"].map((id) => ({
  id,
  kind: id === "interestCover" ? "multiple" : "eur",
  get label() { return t(`rating.keyFigures.${id}`); },
}));

/**
 * A key figure as text; "n/a" with a reason when it cannot be shown.
 * @returns {{text: string, note: string|null}}
 */
export function keyFigureText(id, rating) {
  const value = rating.keyFigures[id];
  const na = t("format.na");
  if (id === "grossProfit" && value === null) return { text: na, note: t("rating.keyFigures.noCogs") };
  if (id === "interestCover") {
    return value === null
      ? { text: na, note: t("rating.keyFigures.noInterest") }
      : { text: formatMultiple(value, 1), note: t("rating.keyFigures.coverFormula") };
  }
  return { text: eur(value), note: null };
}

/**
 * The plain-text summary for "Copy summary": readable in an email or a chat.
 * @param {object} rating from rate()
 * @param {{companyName?: string, year?: number, trendText?: string|null}} [meta]
 *   year: the financial year rated; trendText: the multi-year sentence (trendSentence in years.js)
 * @returns {string}
 */
export function textSummary(rating, { companyName = "", year = null, trendText = null } = {}) {
  const lines = [t("rating.text.title")];
  if (companyName.trim()) lines.push(t("rating.text.company", { name: companyName.trim() }));
  if (year !== null) lines.push(t("rating.text.year", { year }));
  lines.push(t("rating.text.benchmarks", { industry: rating.industry.label, source: rating.benchmarkSource.inlineLabel }));
  lines.push("", t("rating.text.grade", {
    letter: rating.grade.letter, score: rating.score, label: rating.grade.label, coverage: rating.coverage.label,
  }));
  lines.push(rating.summary);
  if (trendText) lines.push("", t("rating.text.trend", { text: trendText }));
  lines.push("", t("rating.text.keyFigures"));
  for (const k of KEY_FIGURES) lines.push(`  ${k.label}: ${keyFigureText(k.id, rating).text}`);
  lines.push("", t("rating.text.ratios"));
  for (const r of rating.ratios) {
    lines.push(`  ${r.label}: ${ratioStatusText(r)}${r.band ? t("rating.text.ratioBand", { band: r.band.label }) : ""}`);
  }
  const d = rating.dupont;
  lines.push("", d.status === "ok"
    ? t("rating.text.dupont", {
      roe: formatPct(d.roe), margin: formatPct(d.netMargin), turnover: formatMultiple(d.assetTurnover), multiplier: formatMultiple(d.equityMultiplier),
    })
    : t("rating.text.dupontNotMeaningful", { margin: formatPct(d.netMargin), turnover: formatMultiple(d.assetTurnover) }));
  if (rating.flags.length > 0) {
    lines.push("", t("rating.text.flags"));
    for (const f of rating.flags) {
      lines.push(`  ${t("rating.text.flag", { severity: t(`rating.severities.${f.severity}`), title: f.title, detail: f.detail })}`);
    }
  }
  lines.push("", t("rating.text.footer"));
  return `${lines.join("\n")}\n`;
}
