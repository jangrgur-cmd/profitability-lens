// benchmarks.js: industry thresholds for the eight ratios.
//
// RULE-OF-THUMB VALUES. These thresholds are judgement-based starting points
// for a learning tool, not official statistics and not calibrated against
// published sector data. Roadmap: calibrate against published datasets (for
// example Damodaran's industry margin and return tables), recording the
// source and year of each value here.
//
// Each ratio has four thresholds in percent, [poor, fair, good, excellent],
// strictly ascending. A value at or above "excellent" is Excellent, at or
// above "good" is Good, and so on; below "poor" is Poor.

import { assertThresholds } from "../shared/margin.js";
import { RATIOS } from "./ratios.js";

/** Where the thresholds come from, shown next to every benchmark in the UI. */
export const BENCHMARK_SOURCE = {
  kind: "rule-of-thumb",
  label: "Rule-of-thumb thresholds",
  note: "Judgement-based starting points for learning, not official statistics. They will be calibrated against published sector data.",
};

/** The industry used when none is chosen. */
export const DEFAULT_INDUSTRY_ID = "general";

/**
 * @typedef {object} Industry
 * @property {string} id
 * @property {string} label
 * @property {string} note what is typical for the sector, in one sentence
 * @property {Record<string, number[]>} thresholds ratio id → [poor, fair, good, excellent] in %
 */

/** @type {Industry[]} */
export const INDUSTRIES = [
  {
    id: "general",
    label: "General",
    note: "A middle-of-the-road scale for businesses that fit no sector below.",
    thresholds: {
      grossMargin: [15, 25, 35, 50],
      ebitdaMargin: [3, 8, 12, 20],
      operatingMargin: [1, 5, 8, 15],
      netMargin: [0, 3, 6, 10],
      roa: [0, 3, 6, 10],
      roe: [0, 8, 12, 20],
      roce: [2, 8, 12, 20],
      roic: [2, 6, 10, 15],
    },
  },
  {
    id: "retail",
    label: "Retail & wholesale",
    note: "Thin margins earned many times over: high asset turnover makes up for low profit per sale.",
    thresholds: {
      grossMargin: [10, 20, 28, 40],
      ebitdaMargin: [2, 4, 7, 10],
      operatingMargin: [1, 2.5, 5, 8],
      netMargin: [0, 1.5, 3, 5],
      roa: [0, 3, 5, 8],
      roe: [0, 8, 14, 20],
      roce: [3, 10, 15, 22],
      roic: [3, 7, 10, 15],
    },
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    note: "Moderate margins with heavy fixed assets, so depreciation and capital returns matter.",
    thresholds: {
      grossMargin: [12, 20, 30, 40],
      ebitdaMargin: [4, 8, 12, 18],
      operatingMargin: [2, 5, 8, 12],
      netMargin: [0, 3, 6, 9],
      roa: [0, 3, 6, 9],
      roe: [0, 7, 12, 18],
      roce: [3, 8, 12, 18],
      roic: [2, 6, 10, 14],
    },
  },
  {
    id: "software",
    label: "Software & SaaS",
    note: "Very high gross margins; growth-stage companies often accept operating losses to win customers.",
    thresholds: {
      grossMargin: [50, 65, 75, 82],
      ebitdaMargin: [0, 10, 20, 30],
      operatingMargin: [-5, 5, 15, 25],
      netMargin: [-5, 3, 12, 20],
      roa: [-2, 3, 8, 15],
      roe: [0, 8, 15, 25],
      roce: [0, 10, 20, 30],
      roic: [0, 8, 15, 25],
    },
  },
  {
    id: "telecom",
    label: "Telecom & CPaaS / messaging",
    note: "Messaging resellers pass much of the price on to operators, so gross margins are modest; network operators earn more but carry heavy assets.",
    thresholds: {
      grossMargin: [15, 25, 35, 50],
      ebitdaMargin: [3, 8, 15, 25],
      operatingMargin: [0, 4, 8, 15],
      netMargin: [0, 2, 5, 10],
      roa: [0, 2, 5, 8],
      roe: [0, 6, 10, 15],
      roce: [2, 6, 10, 15],
      roic: [2, 5, 8, 12],
    },
  },
  {
    id: "professional",
    label: "Professional services",
    note: "People-based businesses with few assets, so returns on capital can be high.",
    thresholds: {
      grossMargin: [20, 30, 40, 55],
      ebitdaMargin: [5, 10, 15, 22],
      operatingMargin: [3, 8, 12, 18],
      netMargin: [2, 5, 9, 14],
      roa: [2, 6, 10, 15],
      roe: [5, 12, 20, 30],
      roce: [5, 15, 25, 35],
      roic: [4, 10, 18, 25],
    },
  },
  {
    id: "tourism",
    label: "Tourism & hospitality",
    note: "Seasonal, asset-heavy businesses: healthy EBITDA margins, but property and depreciation weigh on returns.",
    thresholds: {
      grossMargin: [40, 55, 65, 75],
      ebitdaMargin: [5, 15, 25, 35],
      operatingMargin: [0, 6, 12, 20],
      netMargin: [0, 4, 8, 14],
      roa: [0, 2, 5, 8],
      roe: [0, 6, 10, 15],
      roce: [0, 5, 9, 13],
      roic: [0, 4, 7, 10],
    },
  },
];

/** Industries by id. */
export const INDUSTRY_BY_ID = Object.fromEntries(INDUSTRIES.map((i) => [i.id, i]));

/**
 * Looks up an industry.
 * @param {string} id
 * @returns {Industry}
 * @throws {Error} for an unknown id
 */
export function getIndustry(id) {
  const industry = INDUSTRY_BY_ID[id];
  if (!industry) throw new Error(`Unknown industry: ${id}`);
  return industry;
}

/**
 * Checks that every industry has a valid scale for every ratio.
 * Run by the tests; throws on the first problem.
 */
export function assertBenchmarksComplete() {
  for (const industry of INDUSTRIES) {
    for (const ratio of RATIOS) {
      const thresholds = industry.thresholds[ratio.id];
      if (!thresholds) throw new Error(`${industry.label} has no thresholds for ${ratio.label}`);
      assertThresholds(thresholds);
    }
    const extra = Object.keys(industry.thresholds).filter((id) => !RATIOS.some((r) => r.id === id));
    if (extra.length > 0) throw new Error(`${industry.label} has thresholds for unknown ratios: ${extra.join(", ")}`);
  }
}
