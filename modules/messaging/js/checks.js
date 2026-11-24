// checks.js: automatic sanity checks shown on the Data checks tab.
//
// Each check is a pure function that returns
//   { id, label, scope, pass, detail }
// where `scope` says whether it ran on the current filtered selection or on
// all data, and `detail` explains the result in plain English.

import { summarize, groupAndSummarize } from "./calc.js";
import { runScenario, marginBridge, makeScenario } from "./scenarios.js";
import { formatEur, formatInteger, formatPct } from "../../../src/shared/format.js";

/** Two money totals are "equal" if they differ by less than one hundredth of a cent. */
const TOLERANCE_EUR = 0.0001;

/** Total revenue equals the sum of revenue over the groups made by keyFn. */
function reconcile(id, label, [singular, plural], rows, ctx, keyFn) {
  const total = summarize(rows, ctx).revenue;
  const groups = [...groupAndSummarize(rows, ctx, keyFn).values()];
  const sum = groups.reduce((s, g) => s + g.revenue, 0);
  const diff = Math.abs(total - sum);
  return {
    id,
    label,
    scope: "selection",
    pass: diff < TOLERANCE_EUR,
    detail: `Total ${formatEur(total)}; sum over ${groups.length} ${groups.length === 1 ? singular : plural} ${formatEur(sum)}; difference €${diff.toFixed(6)}.`,
  };
}

/** No row has a negative volume, price, pass-through, cost or platform cost. */
function checkNoNegatives(rows) {
  const fields = ["volume", "price_eur", "passthrough_eur", "cost_local", "platform_cost_eur"];
  const bad = rows.filter((r) => fields.some((f) => !(r[f] >= 0)));
  return {
    id: "no-negatives",
    label: "No negative volumes, prices or costs",
    scope: "all",
    pass: bad.length === 0,
    detail: bad.length === 0
      ? `All ${formatInteger(rows.length)} rows have volume, price, pass-through, cost and platform cost of zero or more.`
      : `${bad.length} rows have a negative or missing value (first: ${JSON.stringify(bad[0])}).`,
  };
}

/** The pass-through part of a price can never be larger than the price itself. */
function checkPassthrough(rows) {
  const bad = rows.filter((r) => r.passthrough_eur > r.price_eur + 1e-12);
  return {
    id: "passthrough-within-price",
    label: "Pass-through fees never exceed the price",
    scope: "all",
    pass: bad.length === 0,
    detail: bad.length === 0
      ? "In every row, the third-party fee passed on at cost is part of the list price."
      : `${bad.length} rows have a pass-through fee above the list price.`,
  };
}

/**
 * Every row's price, pass-through, cost, cost currency and platform cost equal
 * the assumption they came from, and its customer and discount tier exist.
 */
function checkAssumptionsResolve(rows, rates, customersById) {
  const problems = [];
  for (const r of rows) {
    const route = `${r.country}_${r.channel}`;
    const expected = {
      price_eur: rates.get(`price_${route}_${r.category}`),
      passthrough_eur: rates.get(`passthrough_${route}_${r.category}`),
      cost_local: rates.get(`cost_${route}_${r.category}`),
      cost_currency: rates.get(`cost_currency_${route}`),
      platform_cost_eur: rates.get(`platform_cost_${r.channel}`),
    };
    for (const [field, value] of Object.entries(expected)) {
      if (value === undefined || r[field] !== value) problems.push(`${route}_${r.category}: ${field}`);
    }
    const customer = customersById[r.customer_id];
    if (!customer) problems.push(`unknown customer ${r.customer_id}`);
    else if (!rates.has(customer.discount_tier)) problems.push(`unknown discount tier ${customer.discount_tier}`);
    if (problems.length > 5) break;
  }
  return {
    id: "assumptions-resolve",
    label: "Every row's assumptions resolve",
    scope: "all",
    pass: problems.length === 0,
    detail: problems.length === 0
      ? `Each row's price, pass-through, cost, cost currency, platform cost, customer and discount tier match assumptions.json (${formatInteger(rows.length)} rows).`
      : `Mismatches, e.g. ${problems.slice(0, 3).join("; ")}.`,
  };
}

/** Running the scenario engine with every setting at "no change" returns the baseline exactly. */
function checkDefaultScenario(rows, ctx, rates) {
  const bridge = marginBridge(runScenario(rows, ctx, makeScenario(), rates));
  const same =
    bridge.scenario.revenue === bridge.baseline.revenue &&
    bridge.scenario.grossProfit === bridge.baseline.grossProfit &&
    bridge.scenario.volume === bridge.baseline.volume &&
    bridge.steps.every((s) => s.delta === 0);
  return {
    id: "default-scenario",
    label: "Scenario at default settings equals baseline exactly",
    scope: "all",
    pass: same,
    detail: same
      ? `Baseline and default scenario both give ${formatEur(bridge.baseline.grossProfit)} gross profit on ${formatEur(bridge.baseline.revenue)} revenue, with every bridge step at exactly zero.`
      : `Default scenario gives ${formatEur(bridge.scenario.grossProfit)} gross profit vs baseline ${formatEur(bridge.baseline.grossProfit)}.`,
  };
}

/** Every `sourced` assumption has a source URL; every `estimated` one explains its reasoning. */
function checkSourcing(assumptions) {
  const noUrl = assumptions.filter((a) => a.status === "sourced" && !/^https:\/\//.test(a.source));
  const noNote = assumptions.filter((a) => a.status === "estimated" && !a.note);
  const count = (s) => assumptions.filter((a) => a.status === s).length;
  return {
    id: "sourcing",
    label: "Sourced assumptions link a source; estimates explain their reasoning",
    scope: "all",
    pass: noUrl.length === 0 && noNote.length === 0,
    detail: `${count("sourced")} sourced, ${count("estimated")} estimated, ${count("placeholder")} ${count("placeholder") === 1 ? "placeholder" : "placeholders"}.` +
      (noUrl.length + noNote.length === 0 ? "" : ` Problems: ${[...noUrl, ...noNote].slice(0, 3).map((a) => a.id).join(", ")}.`),
  };
}

/** Baseline blended gross margin lies inside the target range taken from peers. */
function checkTargetMargin(rows, ctx, rates) {
  const margin = summarize(rows, ctx).grossMarginPct;
  const min = rates.get("target_margin_min");
  const max = rates.get("target_margin_max");
  return {
    id: "target-margin",
    label: "Baseline gross margin is inside the target range",
    scope: "all",
    pass: margin !== null && margin >= min && margin <= max,
    detail: `Baseline margin ${formatPct(margin)}; target range ${formatPct(min)} to ${formatPct(max)} (from listed peers' reported margins).`,
  };
}

/**
 * Runs every check.
 * @param {object} model from data.js (rows, ctx, rates, customersById, assumptions)
 * @param {object[]} selectedRows rows after the global filters
 * @returns {object[]} check results, in display order
 */
export function runDataChecks(model, selectedRows) {
  const { rows, ctx, rates, customersById, assumptions } = model;
  return [
    reconcile("sum-by-country", "Total revenue equals the sum by country", ["country", "countries"], selectedRows, ctx, (r) => r.country),
    reconcile("sum-by-channel", "Total revenue equals the sum by channel", ["channel", "channels"], selectedRows, ctx, (r) => r.channel),
    reconcile("sum-by-customer", "Total revenue equals the sum by customer", ["customer", "customers"], selectedRows, ctx, (r) => r.customer_id),
    checkNoNegatives(rows),
    checkPassthrough(rows),
    checkAssumptionsResolve(rows, rates, customersById),
    checkDefaultScenario(rows, ctx, rates),
    checkSourcing(assumptions),
    checkTargetMargin(rows, ctx, rates),
  ];
}
