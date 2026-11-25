// samples.js: three FICTIONAL example companies for "Load example".
//
// The companies, names and figures are invented for learning. Any resemblance
// to a real business is a coincidence. Each one shows a different situation:
// a healthy manufacturer, a leveraged hotel that reports costs by nature
// (no COGS), and a loss-making software start-up without prior-year figures.

/**
 * @typedef {object} Sample
 * @property {string} id
 * @property {string} name
 * @property {string} description one sentence on what the example teaches
 * @property {string} industryId
 * @property {true} fictional
 * @property {Record<string, number|null>} values in EUR
 */

import { t, textIn, LANGUAGES } from "../shared/i18n.js";

/** @type {Sample[]} */
export const SAMPLES = [
  {
    id: "bakery",
    name: "Pekara Lastavica d.o.o.",
    get description() { return t("rating.samples.bakery"); },
    industryId: "manufacturing",
    fictional: true,
    values: {
      revenue: 2_400_000,
      cogs: 1_450_000,
      opex: 680_000,
      da: 120_000,
      otherIncome: -5_000,
      interest: 30_000,
      tax: 21_000,
      assets: 1_900_000,
      equity: 1_050_000,
      currentLiabilities: 420_000,
      debt: 380_000,
      cash: 160_000,
      priorAssets: 1_750_000,
      priorEquity: 940_000,
    },
  },
  {
    id: "hotel",
    name: "Hotel Borovina d.d.",
    get description() { return t("rating.samples.hotel"); },
    industryId: "tourism",
    fictional: true,
    values: {
      revenue: 3_200_000,
      cogs: null,
      opex: 2_300_000,
      da: 520_000,
      otherIncome: 0,
      interest: 260_000,
      tax: 22_000,
      assets: 9_800_000,
      equity: 2_600_000,
      currentLiabilities: 1_100_000,
      debt: 6_200_000,
      cash: 350_000,
      priorAssets: 9_500_000,
      priorEquity: 2_480_000,
    },
  },
  {
    id: "startup",
    name: "Oblak Software d.o.o.",
    get description() { return t("rating.samples.startup"); },
    industryId: "software",
    fictional: true,
    values: {
      revenue: 850_000,
      cogs: 170_000,
      opex: 980_000,
      da: 60_000,
      otherIncome: 4_000,
      interest: 0,
      tax: 0,
      assets: 1_400_000,
      equity: 900_000,
      currentLiabilities: 380_000,
      debt: 0,
      cash: 700_000,
      priorAssets: null,
      priorEquity: null,
    },
  },
];

/**
 * The name the page gives a fictional example, in the current language, when
 * `name` is that name in any language: a name saved in Croatian
 * ("Pekara Lastavica d.o.o. (izmišljeno)") reads "… (fictional)" after a
 * switch to English. Other names give null.
 * @param {string} name a company name as saved
 * @param {{name: string}[]} [more] other fictional companies (the practice cases)
 * @returns {string|null}
 */
export function fictionalName(name, more = []) {
  for (const company of [...SAMPLES, ...more]) {
    const known = LANGUAGES.some(({ id }) => name === textIn(id, "rating.samples.nameFictional", { name: company.name }));
    if (known) return t("rating.samples.nameFictional", { name: company.name });
  }
  return null;
}
