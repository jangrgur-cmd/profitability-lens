// checks.js: automatic sanity checks shown on the Data checks tab.
//
// Each check is a pure function that returns
//   { id, label, scope, pass, detail }
// where `scope` says whether it ran on the current filtered selection or on
// all data, and `detail` explains the result in plain language (texts under
// seg.checks in the language files).

import { summarize, groupAndSummarize } from "./calc.js";
import { runScenario, marginBridge, makeScenario } from "./scenarios.js";
import { formatEur, formatInteger, formatNumber, formatPct } from "../../../src/shared/format.js";
import { t } from "../../../src/shared/i18n.js";

/** Two money totals are "equal" if they differ by less than one hundredth of a cent. */
const TOLERANCE_EUR = 0.0001;

/** Total revenue equals the sum of revenue over the groups made by keyFn. */
function reconcile(id, label, groupKey, rows, ctx, keyFn) {
  const total = summarize(rows, ctx).revenue;
  const groups = [...groupAndSummarize(rows, ctx, keyFn).values()];
  const sum = groups.reduce((s, g) => s + g.revenue, 0);
  const diff = Math.abs(total - sum);
  return {
    id,
    label,
    scope: "selection",
    pass: diff < TOLERANCE_EUR,
    detail: t("seg.checks.reconcileDetail", {
      total: formatEur(total), count: groups.length, groups: t(groupKey, { count: groups.length }), sum: formatEur(sum), diff: formatNumber(diff, 6),
    }),
  };
}

/** No row has a negative volume, price, pass-through, cost or platform cost. */
function checkNoNegatives(rows) {
  const fields = ["volume", "price_eur", "passthrough_eur", "cost_local", "platform_cost_eur"];
  const bad = rows.filter((r) => fields.some((f) => !(r[f] >= 0)));
  return {
    id: "no-negatives",
    label: t("seg.checks.noNegatives"),
    scope: "all",
    pass: bad.length === 0,
    detail: bad.length === 0
      ? t("seg.checks.noNegativesPass", { count: formatInteger(rows.length) })
      : t("seg.checks.noNegativesFail", { count: bad.length, first: JSON.stringify(bad[0]) }),
  };
}

/** The pass-through part of a price can never be larger than the price itself. */
function checkPassthrough(rows) {
  const bad = rows.filter((r) => r.passthrough_eur > r.price_eur + 1e-12);
  return {
    id: "passthrough-within-price",
    label: t("seg.checks.passthrough"),
    scope: "all",
    pass: bad.length === 0,
    detail: bad.length === 0
      ? t("seg.checks.passthroughPass")
      : t("seg.checks.passthroughFail", { count: bad.length }),
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
    if (!customer) problems.push(t("seg.checks.unknownCustomer", { id: r.customer_id }));
    else if (!rates.has(customer.discount_tier)) problems.push(t("seg.checks.unknownTier", { id: customer.discount_tier }));
    if (problems.length > 5) break;
  }
  return {
    id: "assumptions-resolve",
    label: t("seg.checks.resolve"),
    scope: "all",
    pass: problems.length === 0,
    detail: problems.length === 0
      ? t("seg.checks.resolvePass", { count: formatInteger(rows.length) })
      : t("seg.checks.resolveFail", { examples: problems.slice(0, 3).join("; ") }),
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
    label: t("seg.checks.defaultScenario"),
    scope: "all",
    pass: same,
    detail: same
      ? t("seg.checks.defaultScenarioPass", { profit: formatEur(bridge.baseline.grossProfit), revenue: formatEur(bridge.baseline.revenue) })
      : t("seg.checks.defaultScenarioFail", { scenario: formatEur(bridge.scenario.grossProfit), baseline: formatEur(bridge.baseline.grossProfit) }),
  };
}

/** Every `sourced` assumption has a source URL; every `estimated` one explains its reasoning. */
function checkSourcing(assumptions) {
  const noUrl = assumptions.filter((a) => a.status === "sourced" && !/^https:\/\//.test(a.source));
  const noNote = assumptions.filter((a) => a.status === "estimated" && !a.note);
  const count = (s) => assumptions.filter((a) => a.status === s).length;
  return {
    id: "sourcing",
    label: t("seg.checks.sourcing"),
    scope: "all",
    pass: noUrl.length === 0 && noNote.length === 0,
    detail: t("seg.checks.sourcingDetail", {
      sourced: count("sourced"), estimated: count("estimated"), placeholders: t("seg.checks.placeholders", { count: count("placeholder") }),
    }) + (noUrl.length + noNote.length === 0 ? "" : t("seg.checks.sourcingProblems", { ids: [...noUrl, ...noNote].slice(0, 3).map((a) => a.id).join(", ") })),
  };
}

/** Baseline blended gross margin lies inside the target range taken from peers. */
function checkTargetMargin(rows, ctx, rates) {
  const margin = summarize(rows, ctx).grossMarginPct;
  const min = rates.get("target_margin_min");
  const max = rates.get("target_margin_max");
  return {
    id: "target-margin",
    label: t("seg.checks.targetMargin"),
    scope: "all",
    pass: margin !== null && margin >= min && margin <= max,
    detail: t("seg.checks.targetMarginDetail", { margin: formatPct(margin), min: formatPct(min), max: formatPct(max) }),
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
    reconcile("sum-by-country", t("seg.checks.sumByCountry"), "seg.checks.groupCountry", selectedRows, ctx, (r) => r.country),
    reconcile("sum-by-channel", t("seg.checks.sumByChannel"), "seg.checks.groupChannel", selectedRows, ctx, (r) => r.channel),
    reconcile("sum-by-customer", t("seg.checks.sumByCustomer"), "seg.checks.groupCustomer", selectedRows, ctx, (r) => r.customer_id),
    checkNoNegatives(rows),
    checkPassthrough(rows),
    checkAssumptionsResolve(rows, rates, customersById),
    checkDefaultScenario(rows, ctx, rates),
    checkSourcing(assumptions),
    checkTargetMargin(rows, ctx, rates),
  ];
}
