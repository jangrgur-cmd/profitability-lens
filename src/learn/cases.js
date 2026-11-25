// cases.js: five FICTIONAL practice cases for "Guess the grade".
//
// The companies, names and figures are invented for learning; any resemblance
// to a real business is a coincidence. The grade is never stored here: it is
// worked out by rate() each time, so a case can never disagree with the
// Company rating. tests/learn.test.mjs checks that the five cases still earn
// the grades A to E once each; if a benchmark change moves a case, retune its
// figures and re-read its story and lesson.
//
// Each case teaches one thing (its `lesson`, shown after the guess):
//   saas         a 12 % net margin is only "strong" in software
//   supermarket  a 4 % net margin can be excellent when assets turn fast
//   bistro       a good gross margin does not survive fixed costs and debt
//   metalworks   costs by nature (no COGS) and ROE lifted by leverage
//   reseller     a wholesale messaging reseller with thin margins and heavy interest

import { t } from "../shared/i18n.js";

/**
 * @typedef {object} PracticeCase
 * @property {string} id
 * @property {string} name fictional company name
 * @property {string} industryId one of INDUSTRIES (src/rating/benchmarks.js)
 * @property {true} fictional
 * @property {string} story what the company does, before the guess (interface language)
 * @property {string} lesson the take-away, after the guess (interface language)
 * @property {Record<string, number|null>} values in EUR, as in src/rating/fields.js
 */

/** Builds a case; the texts are read in the current language each time. */
function practiceCase(id, name, industryId, values) {
  return {
    id, name, industryId, fictional: true, values,
    get story() { return t(`learn.cases.${id}.story`); },
    get lesson() { return t(`learn.cases.${id}.lesson`); },
  };
}

/** @type {PracticeCase[]} in quiz order (not in grade order) */
export const CASES = [
  practiceCase("saas", "Lanterna Soft d.o.o.", "software", {
    revenue: 3_200_000, cogs: 900_000, opex: 1_700_000, da: 140_000, otherIncome: 5_000, interest: 12_000, tax: 66_000,
    assets: 3_600_000, equity: 2_400_000, currentLiabilities: 700_000, debt: 300_000, cash: 900_000,
    priorAssets: 3_200_000, priorEquity: 2_100_000,
  }),
  practiceCase("supermarket", "Košarica Market d.o.o.", "retail", {
    revenue: 12_000_000, cogs: 8_900_000, opex: 2_250_000, da: 210_000, otherIncome: 0, interest: 70_000, tax: 105_000,
    assets: 6_000_000, equity: 2_700_000, currentLiabilities: 2_600_000, debt: 1_400_000, cash: 350_000,
    priorAssets: 5_600_000, priorEquity: 2_500_000,
  }),
  practiceCase("bistro", "Bistro Lavanda d.o.o.", "tourism", {
    revenue: 900_000, cogs: 300_000, opex: 560_000, da: 90_000, otherIncome: 0, interest: 45_000, tax: 0,
    assets: 1_300_000, equity: 250_000, currentLiabilities: 350_000, debt: 800_000, cash: 40_000,
    priorAssets: null, priorEquity: null,
  }),
  practiceCase("metalworks", "Žica i Vijak d.o.o.", "manufacturing", {
    revenue: 5_000_000, cogs: null, opex: 4_500_000, da: 180_000, otherIncome: -10_000, interest: 120_000, tax: 35_000,
    assets: 4_600_000, equity: 1_150_000, currentLiabilities: 1_600_000, debt: 2_300_000, cash: 150_000,
    priorAssets: 4_400_000, priorEquity: 1_000_000,
  }),
  practiceCase("reseller", "Poruka Plus d.o.o.", "telecom", {
    revenue: 6_000_000, cogs: 5_100_000, opex: 620_000, da: 110_000, otherIncome: 0, interest: 120_000, tax: 8_000,
    assets: 3_800_000, equity: 900_000, currentLiabilities: 1_500_000, debt: 1_600_000, cash: 120_000,
    priorAssets: 3_600_000, priorEquity: 880_000,
  }),
];

/** Cases by id. */
export const CASE_BY_ID = Object.fromEntries(CASES.map((c) => [c.id, c]));

/**
 * The link that opens a case in the Company rating: index.html#case=<id>.
 * @param {string} id
 * @returns {string} the hash, e.g. "#case=saas"
 */
export function caseHash(id) {
  if (!CASE_BY_ID[id]) throw new Error(`Unknown practice case: ${id}`);
  return `#${new URLSearchParams({ case: id })}`;
}

/**
 * Reads a case link. Anything else gives null.
 * @param {string} hash location.hash
 * @returns {PracticeCase|null}
 */
export function caseFromHash(hash) {
  const id = new URLSearchParams(String(hash ?? "").replace(/^#/, "")).get("case");
  return (id && CASE_BY_ID[id]) || null;
}
