// sector.js: published sector averages, shown NEXT TO the rule-of-thumb
// benchmarks as a reference. They do not change any score or grade.
//
// Source: Aswath Damodaran (NYU Stern), industry averages for Europe, data
// as of January 2026: marginEurope.xls, roeEurope.xls and EVAEurope.xls from
// https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html
// (downloaded 25 November 2026). Each figure is an aggregate over listed
// companies (sum of profits ÷ sum of revenues or capital), so it describes
// larger, listed firms rather than a typical small company.
//
// The rows below are copied from those files, rounded to two decimals of a
// percent. An industry of this site combines one or more Damodaran
// industries, averaged with each row's number of firms as its weight.
// Damodaran's "ROC" is after-tax operating income ÷ (book equity + debt −
// cash), the same definition as ROIC here. ROA and ROCE are not published.

import { t } from "../shared/i18n.js";

/** The source, for the page and the docs. */
export const SECTOR_SOURCE = {
  author: "Aswath Damodaran, NYU Stern",
  url: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html",
  files: ["marginEurope.xls", "roeEurope.xls", "EVAEurope.xls"],
  dataAsOf: "2026-01",
  get label() { return t("rating.sector.source"); },
};

/**
 * Damodaran's European industry rows:
 * [firms (margins), gross margin, EBITDA/sales, pre-tax unadjusted operating
 *  margin, net margin, firms (ROE), ROE (unadjusted), firms (EVA), ROC], in %.
 */
export const DAMODARAN_EUROPE = {
  "Total Market (without financials)": [5757, 34.67, 15.7, 12.05, 6.43, 5757, 11.52, 5757, 13.01],
  "Retail (General)": [31, 24.87, 5.52, 4.31, 10.17, 31, 23.26, 31, 6.45],
  "Retail (Grocery and Food)": [34, 19.62, 4.88, 3.55, 1.81, 34, 11.18, 34, 10.04],
  "Retail (Distributors)": [117, 30.68, 10.19, 8.48, 5.17, 117, 13.64, 117, 10.22],
  "Retail (Special Lines)": [105, 42.08, 9.08, 7.92, 4.48, 105, 19.23, 105, 21.14],
  "Retail (Building Supply)": [26, 39.68, 6.1, 5.41, 1.65, 26, 4.73, 26, 9.55],
  "Retail (Automotive)": [22, 16.1, 3.44, 2.44, 1.16, 22, 6.33, 22, 8.67],
  "Food Wholesalers": [11, 16.9, 1.9, 1.05, -0.07, 11, -0.95, 11, 6.11],
  "Machinery": [210, 44.68, 12.97, 11.71, 7.6, 210, 15.76, 210, 18.34],
  "Electrical Equipment": [146, 31.68, 12.01, 11.25, 7.59, 146, 18.15, 146, 28.29],
  "Electronics (General)": [142, 41.76, 17.35, 12.78, 6.37, 142, 8.51, 142, 12.49],
  "Building Materials": [84, 36.09, 14.1, 12.36, 8.51, 84, 16.82, 84, 21.97],
  "Food Processing": [173, 32.94, 11.43, 9.37, 5.63, 173, 15.52, 173, 14.74],
  "Chemical (Specialty)": [92, 33.21, 15.52, 10.83, 7.6, 92, 10.18, 92, 10.72],
  "Packaging & Container": [42, 24.38, 11.59, 7.4, 3.37, 42, 7.12, 42, 9.61],
  "Furn/Home Furnishings": [53, 25.06, 6.42, 3.62, -1.24, 53, -4.55, 53, 5.81],
  "Auto Parts": [58, 20.71, 8.26, 4.83, 0.17, 58, 0.77, 58, 9.17],
  "Steel": [57, 13.37, 5.65, 1.59, 1.61, 57, 2.55, 57, 2.05],
  "Paper/Forest Products": [36, 32.2, 13.84, 6.21, 3, 36, 2.78, 36, 4.25],
  "Apparel": [109, 65.04, 20.64, 18.75, 9.43, 109, 17.15, 109, 21.59],
  "Household Products": [65, 54.36, 17.82, 17.59, 9.91, 65, 20.2, 65, 25.35],
  "Software (System & Application)": [290, 65.21, 17.23, 19.33, 14.14, 290, 15.77, 290, 23.18],
  "Software (Internet)": [23, 52.22, 21.69, 13.42, 4.74, 23, 18.2, 23, 19.18],
  "Telecom. Services": [62, 46.88, 27.33, 16.2, 5.86, 62, 9.73, 62, 9.9],
  "Telecom (Wireless)": [11, 39.08, 24.34, 13, -3.2, 11, -2.63, 11, 6.28],
  "Business & Consumer Services": [176, 32.36, 10.33, 8.58, 4.32, 176, 17.11, 176, 29.06],
  "Computer Services": [210, 22.97, 9.61, 8.46, 5.97, 210, 20.74, 210, 35.32],
  "Information Services": [6, 29.21, 11.83, 9.36, 3.83, 6, 12.29, 6, 25],
  "Advertising": [83, 35.48, 13.12, 11.26, 4.45, 83, 9.18, 83, 50.9],
  "Hotel/Gaming": [103, 40.29, 16.84, 14.13, 8.59, 103, 24.16, 103, 20.54],
  "Restaurant/Dining": [38, 40.5, 6.92, 5.55, 2.38, 38, 13.12, 38, 18.01],
};

/** The Damodaran industries behind each industry of this site. */
export const SECTOR_ROWS = {
  general: ["Total Market (without financials)"],
  retail: ["Retail (General)", "Retail (Grocery and Food)", "Retail (Distributors)", "Retail (Special Lines)", "Retail (Building Supply)", "Retail (Automotive)", "Food Wholesalers"],
  manufacturing: ["Machinery", "Electrical Equipment", "Electronics (General)", "Building Materials", "Food Processing", "Chemical (Specialty)", "Packaging & Container", "Furn/Home Furnishings", "Auto Parts", "Steel", "Paper/Forest Products", "Apparel", "Household Products"],
  software: ["Software (System & Application)", "Software (Internet)"],
  telecom: ["Telecom. Services", "Telecom (Wireless)"],
  professional: ["Business & Consumer Services", "Computer Services", "Information Services", "Advertising"],
  tourism: ["Hotel/Gaming", "Restaurant/Dining"],
};

/** Where each ratio is in a row: [firms column, value column]; null when not published. */
const COLUMNS = {
  grossMargin: [0, 1],
  ebitdaMargin: [0, 2],
  operatingMargin: [0, 3],
  netMargin: [0, 4],
  roa: null,
  roe: [5, 6],
  roce: null,
  roic: [7, 8],
};

/**
 * The published average for each ratio of an industry.
 * @param {string} industryId
 * @returns {Record<string, {value: number|null, firms: number, reason: "notPublished"|"inconsistent"|null}>}
 *   value as a share (0.063 for 6.3 %); null with a reason when there is none:
 *   notPublished (ROA, ROCE) or inconsistent (EBITDA margin below operating
 *   margin, which cannot happen, so the published figure is not shown)
 */
export function sectorReference(industryId) {
  const rows = (SECTOR_ROWS[industryId] ?? []).map((name) => DAMODARAN_EUROPE[name]);
  const average = (cols) => {
    if (!cols || rows.length === 0) return { value: null, firms: 0 };
    const [f, c] = cols;
    const firms = rows.reduce((sum, r) => sum + r[f], 0);
    return { value: rows.reduce((sum, r) => sum + r[f] * r[c], 0) / firms / 100, firms };
  };
  const out = {};
  for (const [id, cols] of Object.entries(COLUMNS)) {
    const a = average(cols);
    out[id] = { ...a, reason: a.value === null ? "notPublished" : null };
  }
  if (out.ebitdaMargin.value !== null && out.ebitdaMargin.value < out.operatingMargin.value) {
    out.ebitdaMargin = { value: null, firms: out.ebitdaMargin.firms, reason: "inconsistent" };
  }
  return out;
}
