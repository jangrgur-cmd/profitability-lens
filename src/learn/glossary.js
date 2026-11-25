// glossary.js: the terms behind both modules, in English and Croatian.
//
// An entry names its term by a language key. Terms the engines already use
// (ratio names, field labels, derived figures) point at those same keys, so
// the glossary can never call a ratio something the rating page does not.
// The term in the other language is the same key read in that language
// (textIn), so the Croatian name shown in the English glossary is exactly the
// one the Croatian interface uses. Ratio formulas come from the ratio
// definitions (src/rating/ratios.js); other formulas from learn.formulas,
// which the cheat sheet uses too. Pure module: no DOM.

import { RATIOS } from "../rating/ratios.js";
import { t, textIn, otherLanguage, getLang } from "../shared/i18n.js";

/** Glossary sections, in display order. Labels under learn.glossary.categories. */
export const CATEGORIES = ["statements", "profit", "ratios", "analysis", "segments"].map((id) => ({
  id,
  get label() { return t(`learn.glossary.categories.${id}`); },
}));

const RATIO_BY_ID = Object.fromEntries(RATIOS.map((r) => [r.id, r]));

/**
 * @typedef {object} GlossaryEntry
 * @property {string} id also the anchor on the page (#term-<id>)
 * @property {string} category
 * @property {string} termKey language key of the term's name
 * @property {string|null} formulaKey language key of its formula, if it has one
 * @property {string[]} related ids of related entries
 * @property {string} term the name in the interface language
 * @property {string} alt the name in the other language
 * @property {string} altLang that other language ("en" or "hr")
 * @property {string|null} formula
 * @property {string} definition
 */

/**
 * Builds an entry. Options:
 *   term     the key of its name (default learn.glossary.terms.<id>)
 *   formula  the key of its formula (a ratio's formula when `ratio` is given)
 *   ratio    a ratio id: the name and formula come from that ratio
 * @returns {GlossaryEntry}
 */
function entry(id, category, related, { term, formula, ratio } = {}) {
  if (ratio && !RATIO_BY_ID[ratio]) throw new Error(`Unknown ratio: ${ratio}`);
  const termKey = ratio ? `rating.ratios.${ratio}.label` : term ?? `learn.glossary.terms.${id}`;
  const formulaKey = ratio ? `rating.ratios.${ratio}.formula` : formula ?? null;
  return {
    id, category, termKey, formulaKey, related,
    get term() { return t(termKey); },
    get alt() { return textIn(otherLanguage(), termKey); },
    get altLang() { return otherLanguage(); },
    get formula() { return formulaKey ? t(formulaKey) : null; },
    get definition() { return t(`learn.glossary.defs.${id}`); },
  };
}

const field = (id) => `rating.fields.${id}.label`;
const termOf = (id) => `rating.terms.${id}`;
const formulaOf = (id) => `learn.formulas.${id}`;

/** @type {GlossaryEntry[]} */
export const GLOSSARY = [
  // Statements and their lines
  entry("incomeStatement", "statements", ["revenue", "netIncome", "balanceSheet"]),
  entry("balanceSheet", "statements", ["assets", "equity", "incomeStatement"]),
  entry("revenue", "statements", ["grossMargin", "cogs"], { term: field("revenue") }),
  entry("cogs", "statements", ["grossProfit", "costsByNature"], { term: field("cogs") }),
  entry("opex", "statements", ["ebitda", "costsByNature"], { term: field("opex") }),
  entry("costsByNature", "statements", ["cogs", "opex"]),
  entry("da", "statements", ["ebitda", "ebit"], { term: field("da") }),
  entry("interest", "statements", ["interestCover", "debt"], { term: field("interest") }),
  entry("tax", "statements", ["effectiveTaxRate", "netIncome"], { term: field("tax") }),
  entry("assets", "statements", ["roa", "assetTurnover"], { term: field("assets") }),
  entry("equity", "statements", ["roe", "equityMultiplier"], { term: field("equity") }),
  entry("currentLiabilities", "statements", ["capitalEmployed"], { term: field("currentLiabilities") }),
  entry("debt", "statements", ["investedCapital", "leverage"], { term: field("debt") }),
  entry("cash", "statements", ["investedCapital"], { term: field("cash") }),

  // Profit at each level and the capital it is compared with
  entry("grossProfit", "profit", ["grossMargin", "cogs"], { term: termOf("grossProfit"), formula: formulaOf("grossProfit") }),
  entry("ebitda", "profit", ["ebitdaMargin", "da"], { term: termOf("ebitda"), formula: formulaOf("ebitda") }),
  entry("ebit", "profit", ["operatingMargin", "interestCover"], { term: termOf("ebit"), formula: formulaOf("ebit") }),
  entry("ebt", "profit", ["tax", "effectiveTaxRate"], { formula: formulaOf("ebt") }),
  entry("netIncome", "profit", ["netMargin", "roe"], { term: termOf("netIncome"), formula: formulaOf("netIncome") }),
  entry("effectiveTaxRate", "profit", ["nopat", "tax"], { formula: formulaOf("taxRate") }),
  entry("nopat", "profit", ["roic", "effectiveTaxRate"], { term: termOf("nopat"), formula: formulaOf("nopat") }),
  entry("averageBalance", "profit", ["roa", "roe"], { formula: formulaOf("average") }),
  entry("capitalEmployed", "profit", ["roce", "currentLiabilities"], { term: termOf("capitalEmployed"), formula: formulaOf("capitalEmployed") }),
  entry("investedCapital", "profit", ["roic", "debt", "cash"], { term: termOf("investedCapital"), formula: formulaOf("investedCapital") }),

  // The eight ratios and their companions
  entry("grossMargin", "ratios", ["grossProfit", "ebitdaMargin"], { ratio: "grossMargin" }),
  entry("ebitdaMargin", "ratios", ["ebitda", "operatingMargin"], { ratio: "ebitdaMargin" }),
  entry("operatingMargin", "ratios", ["ebit", "netMargin"], { ratio: "operatingMargin" }),
  entry("netMargin", "ratios", ["netIncome", "dupont"], { ratio: "netMargin" }),
  entry("roa", "ratios", ["assetTurnover", "roe"], { ratio: "roa" }),
  entry("roe", "ratios", ["dupont", "equityMultiplier", "leverage"], { ratio: "roe" }),
  entry("roce", "ratios", ["capitalEmployed", "roic"], { ratio: "roce" }),
  entry("roic", "ratios", ["investedCapital", "nopat"], { ratio: "roic" }),
  entry("assetTurnover", "ratios", ["dupont", "roa"], { term: "rating.dupont.assetTurnover", formula: formulaOf("assetTurnover") }),
  entry("equityMultiplier", "ratios", ["dupont", "leverage"], { term: "rating.dupont.equityMultiplier", formula: formulaOf("equityMultiplier") }),
  entry("interestCover", "ratios", ["interest", "ebit"], { term: "rating.keyFigures.interestCover", formula: formulaOf("interestCover") }),

  // Reading the numbers
  entry("dupont", "analysis", ["roe", "netMargin", "assetTurnover", "equityMultiplier"], { formula: formulaOf("dupont") }),
  entry("benchmark", "analysis", ["score", "grade"]),
  entry("score", "analysis", ["benchmark", "grade", "coverage"]),
  entry("grade", "analysis", ["score"]),
  entry("coverage", "analysis", ["score"]),
  entry("leverage", "analysis", ["equityMultiplier", "debt", "interestCover"]),
  entry("operatingLeverage", "analysis", ["contributionMargin", "opex"]),
  entry("percentagePoint", "analysis", ["grossMargin"], { formula: formulaOf("percentagePoint") }),
  entry("notMeaningful", "analysis", ["roe", "equity"]),

  // Segment profitability
  entry("segment", "segments", ["contributionMargin", "segmentProfit"]),
  entry("variableCosts", "segments", ["contributionMargin", "directFixedCosts"], { term: "segments.columns.variableCosts" }),
  entry("contributionMargin", "segments", ["contributionMarginRatio", "variableCosts", "segmentProfit"], { formula: formulaOf("contributionMargin") }),
  entry("contributionMarginRatio", "segments", ["contributionMargin", "grossMargin"], { formula: formulaOf("cmRatio") }),
  entry("directFixedCosts", "segments", ["segmentProfit", "overheads"], { term: "segments.columns.fixedCosts" }),
  entry("segmentProfit", "segments", ["contributionMargin", "directFixedCosts", "overheads"], { formula: formulaOf("segmentProfit") }),
  entry("overheads", "segments", ["segmentProfit", "directFixedCosts"]),
  entry("whaleCurve", "segments", ["topShare", "segmentProfit"]),
  entry("topShare", "segments", ["whaleCurve"], { formula: formulaOf("topShare") }),
  entry("passThrough", "segments", ["grossMargin", "variableCosts"]),
];

/** Entries by id. */
export const GLOSSARY_BY_ID = Object.fromEntries(GLOSSARY.map((e) => [e.id, e]));

/**
 * Lower case without accents (đ → d), with "&" and "%" kept inside words, so
 * "trosak" finds "Trošak", and "D&A" or "20%" are searched as one word.
 */
function fold(text) {
  return String(text ?? "").toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/s+%/g, "%").replace(/[^a-z0-9&%]+/g, " ").trim();
}

/** Text an entry can be found by: its name in both languages and its definition. */
function searchText(e) {
  return fold([e.term, e.alt, e.definition, e.formula ?? ""].join(" "));
}

/**
 * The entries that match a search, sorted by name in the interface language.
 * Every word of the query must appear (accents and case ignored, so "trosak"
 * finds "Trošak"); entries whose name matches come first.
 * @param {string} query
 * @param {{category?: string|null, entries?: GlossaryEntry[]}} [options] category: only that section
 * @returns {GlossaryEntry[]}
 */
export function searchGlossary(query, { category = null, entries = GLOSSARY } = {}) {
  const words = fold(query).split(" ").filter(Boolean);
  const collator = new Intl.Collator(getLang());
  const inName = (e) => words.every((w) => fold(`${e.term} ${e.alt}`).includes(w));
  return entries
    .filter((e) => !category || e.category === category)
    .filter((e) => words.length === 0 || words.every((w) => searchText(e).includes(w)))
    .sort((a, b) => (words.length > 0 && inName(a) !== inName(b) ? (inName(a) ? -1 : 1) : collator.compare(a.term, b.term)));
}
