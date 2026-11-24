// snapshot.mjs: computes every number the dashboard shows from the real data,
// so tests/golden.test.mjs can prove a refactor changed none of them.
//
// The snapshot covers the baseline totals, every grouping the tabs use
// (country, channel, category, customer, month, route), the whale curve, a
// filtered selection, the three presets plus one scenario that uses every
// step, the data checks and the number formatting.
//
// Regenerate the expected values only when a change to the numbers is
// intended: node scripts/update-golden.mjs

import { readFileSync } from "node:fs";
import {
  summarize,
  groupAndSummarize,
  monthlyTotals,
  channelTotals,
  routeProfitability,
  customerProfitability,
  whaleCurve,
  filterRows,
  availableFilterValues,
} from "../../js/calc.js";
import { runScenario, marginBridge, mostAffected, makeScenario, PRESETS } from "../../js/scenarios.js";
import { buildModel } from "../../js/data.js";
import { runDataChecks } from "../../js/checks.js";
import { formatEur, formatPct, formatPerMessage, formatCount, formatInteger } from "../../js/format.js";

/** A scenario that moves every lever at once, so each step is exercised. */
const ALL_STEPS_SCENARIO = {
  volumeChange: 0.1,
  volumeCategory: "marketing",
  migration: { authentication: 0.1, utility: 0.2, marketing: 0.3 },
  conversionRatio: 1.5,
  priceChange: -0.05,
  priceChannel: "SMS",
  costChange: 0.2,
  costChannel: "all",
  costCountries: ["DE", "US"],
  fxChange: 0.08,
};

/** A filter selection that uses every filter in the bar. */
const SAMPLE_FILTERS = { monthFrom: 3, monthTo: 8, country: "HR", channel: "all", category: "all", industry: "Banking" };

const FORMAT_SAMPLES = [-15244, -0.5, 0, 0.0123456, 0.2214, 512, 45300, 1234567, 821584062, 2.5e9, null, Number.NaN];

const byKey = (map) => Object.fromEntries([...map].map(([k, v]) => [String(k), v]));
const routeKey = (r) => `${r.country}|${r.channel}`;

/** Loads the module's real data files. */
export function loadRealData() {
  const read = (file) => JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), "utf8"));
  return { assumptionsFile: read("assumptions.json"), traffic: read("traffic.json") };
}

/** Bridge, end totals and most-affected routes and customers for one scenario. */
function scenarioSnapshot(model, scenario) {
  const states = runScenario(model.rows, model.ctx, makeScenario(scenario), model.rates);
  const last = states[states.length - 1];
  return {
    bridge: marginBridge(states),
    stepTotals: states.map((st) => ({ key: st.key, ...summarize(st.rows, st.ctx) })),
    rowCount: last.rows.length,
    eurUsd: last.ctx.eurUsd,
    mostAffectedRoutes: mostAffected(model.rows, model.ctx, last.rows, last.ctx, routeKey),
    mostAffectedCustomers: mostAffected(model.rows, model.ctx, last.rows, last.ctx, (r) => r.customer_id),
  };
}

/**
 * Computes the full snapshot. Returns plain JSON-safe data.
 * @param {{assumptionsFile: object, traffic: object[]}} data
 */
export function takeSnapshot({ assumptionsFile, traffic }) {
  const model = buildModel(assumptionsFile, traffic);
  const { rows, ctx, customersById } = model;
  const filtered = filterRows(rows, SAMPLE_FILTERS, customersById);
  const available = availableFilterValues(rows, { country: "HR" }, customersById);
  const customers = customerProfitability(rows, ctx);
  const whale = whaleCurve(customers);

  const snapshot = {
    rowCount: rows.length,
    total: summarize(rows, ctx),
    byCountry: byKey(groupAndSummarize(rows, ctx, (r) => r.country)),
    byChannel: channelTotals(rows, ctx),
    byCategory: byKey(groupAndSummarize(rows, ctx, (r) => r.category)),
    byMonth: monthlyTotals(rows, ctx),
    routes: routeProfitability(rows, ctx),
    customers,
    whale: { peak: whale.peak, totalGrossProfit: whale.totalGrossProfit, profitShares: whale.points.map((p) => p.profitSharePct) },
    filtered: { rowCount: filtered.length, total: summarize(filtered, ctx), routes: routeProfitability(filtered, ctx) },
    availableWhenCroatia: Object.fromEntries(Object.entries(available).map(([k, set]) => [k, [...set].sort()])),
    presets: Object.fromEntries(PRESETS.map((p) => [p.id, scenarioSnapshot(model, p.scenario)])),
    allSteps: scenarioSnapshot(model, ALL_STEPS_SCENARIO),
    checks: runDataChecks(model, rows).map(({ id, pass }) => ({ id, pass })),
    format: FORMAT_SAMPLES.map((v) => ({
      value: Number.isNaN(v) ? "NaN" : v,
      eur: formatEur(v),
      pct: formatPct(v),
      perMessage: formatPerMessage(v),
      count: formatCount(v),
      integer: formatInteger(v),
    })),
  };
  // Round-trip through JSON so the live snapshot has exactly the shape of the stored one.
  return JSON.parse(JSON.stringify(snapshot));
}
