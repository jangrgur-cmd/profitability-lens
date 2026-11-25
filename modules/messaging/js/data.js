// data.js: loads the two data files and joins them into one model object.
//
// The model holds the raw traffic rows (never changed after loading), the
// calculation context (FX rate and customer discounts) and lookup tables for
// labels, so the rest of the app never has to read the JSON files itself.

import { buildCalcContext } from "./calc.js";
import { dataLabel } from "./labels.js";

/** Fetches a JSON file and throws a readable error if it fails. */
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  return response.json();
}

/**
 * Joins the parsed assumptions and traffic files into the model object.
 * Kept separate from loading so it can be used without a browser.
 * @param {object} assumptionsFile parsed data/assumptions.json
 * @param {object[]} traffic parsed data/traffic.json
 */
export function buildModel(assumptionsFile, traffic) {
  const { dimensions, customers, assumptions } = assumptionsFile;
  return {
    meta: assumptionsFile.meta,
    dimensions,
    assumptions,
    customers,
    rows: Object.freeze(traffic.map((row) => Object.freeze(row))),
    ctx: buildCalcContext(assumptionsFile),
    // assumption id → value; the scenario engine prices new WhatsApp rows from it
    rates: new Map(assumptions.map((a) => [a.id, a.value])),
    customersById: Object.fromEntries(customers.map((c) => [c.id, c])),
    // Display names in the interface language (see labels.js); ids stay as in the data.
    countryNames: Object.fromEntries(dimensions.countries.map((c) => [c.code, dataLabel("country", c.code, c.name)])),
    categoryLabels: Object.fromEntries(dimensions.categories.map((c) => [c.id, dataLabel("category", c.id, c.label)])),
    monthLabels: dimensions.months.map((m, i) => dataLabel("months", i, m)),
    customerNames: Object.fromEntries(customers.map((c) => [c.id, dataLabel("customer", c.id, c.name)])),
    channelName: (channel) => dataLabel("channel", channel, channel),
    industryName: (industry) => dataLabel("industry", industry, industry),
    sizeName: (tier) => dataLabel("size", tier, tier),
    assumptionGroupName: (group) => dataLabel("assumptionGroup", group, group),
  };
}

/**
 * Loads data/assumptions.json and data/traffic.json and builds the model.
 * @param {string} base path to the site root (default: current folder)
 */
export async function loadModel(base = ".") {
  const [assumptionsFile, traffic] = await Promise.all([
    fetchJson(`${base}/data/assumptions.json`),
    fetchJson(`${base}/data/traffic.json`),
  ]);
  return buildModel(assumptionsFile, traffic);
}
