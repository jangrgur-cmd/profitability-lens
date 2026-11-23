// Unit tests for js/calc.js.
// Run with: node --test tests/
//
// The small fixture below is designed to be checked by hand.
// EUR/USD = 1.25, so 1 USD = 0.80 EUR. Customer A has a 10 % discount, B has none.
//
// | row | customer | route       | volume | price | cost        | platform | revenue | delivery | platform | profit |
// |-----|----------|-------------|--------|-------|-------------|----------|---------|----------|----------|--------|
// | r1  | A        | HR SMS      | 1,000  | 0.05  | 0.03 EUR    | 0.001    | 45.0    | 30.0     | 1.0      | 14.0   |
// | r2  | B        | US SMS      | 2,000  | 0.02  | 0.01 USD    | 0.001    | 40.0    | 16.0     | 2.0      | 22.0   |
// | r3  | B        | NG SMS      |   500  | 0.04  | 0.05 EUR    | 0.001    | 20.0    | 25.0     | 0.5      | -5.5   |
// | r4  | A        | HR WhatsApp |   100  | 0.10  | 0.05 USD    | 0.002    |  9.0    |  4.0     | 0.2      | 4.8    |
// | total                          | 3,600  |       |             |          | 114.0   | 75.0     | 3.7      | 35.3   |

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCalcContext, fxToEur, rowRevenue, rowDeliveryCost, rowPlatformCost, rowMetrics,
  grossMarginPct, summarize, groupAndSummarize, monthlyTotals, channelTotals,
  routeProfitability, customerProfitability, whaleCurve, filterRows,
} from "../js/calc.js";

const ctx = { eurUsd: 1.25, discountByCustomer: { A: 0.1, B: 0 } };
const r1 = { month: 1, customer_id: "A", country: "HR", channel: "SMS", category: "authentication", volume: 1000, price_eur: 0.05, cost_local: 0.03, cost_currency: "EUR", platform_cost_eur: 0.001 };
const r2 = { month: 1, customer_id: "B", country: "US", channel: "SMS", category: "marketing", volume: 2000, price_eur: 0.02, cost_local: 0.01, cost_currency: "USD", platform_cost_eur: 0.001 };
const r3 = { month: 2, customer_id: "B", country: "NG", channel: "SMS", category: "utility", volume: 500, price_eur: 0.04, cost_local: 0.05, cost_currency: "EUR", platform_cost_eur: 0.001 };
const r4 = { month: 2, customer_id: "A", country: "HR", channel: "WhatsApp", category: "marketing", volume: 100, price_eur: 0.1, cost_local: 0.05, cost_currency: "USD", platform_cost_eur: 0.002 };
const rows = [r1, r2, r3, r4];

/** Floating-point comparison: sums of decimals are not always exact. */
function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

// --- Row-level formulas ------------------------------------------------------

test("fxToEur: EUR is 1, USD is 1 / EURUSD", () => {
  assert.equal(fxToEur("EUR", 1.25), 1);
  near(fxToEur("USD", 1.25), 0.8);
  assert.throws(() => fxToEur("GBP", 1.25));
});

test("rowRevenue applies the customer discount", () => {
  near(rowRevenue(r1, ctx), 45); // 1000 × 0.05 × (1 − 0.10)
  near(rowRevenue(r2, ctx), 40); // 2000 × 0.02 × (1 − 0)
});

test("rowRevenue treats an unknown customer as no discount", () => {
  near(rowRevenue({ ...r1, customer_id: "Z" }, ctx), 50);
});

test("rowDeliveryCost converts USD costs to EUR", () => {
  near(rowDeliveryCost(r1, ctx), 30); // 1000 × 0.03 × 1
  near(rowDeliveryCost(r2, ctx), 16); // 2000 × 0.01 × 0.8
});

test("rowPlatformCost is volume × platform cost per message", () => {
  near(rowPlatformCost(r1), 1);
  near(rowPlatformCost(r4), 0.2);
});

test("rowMetrics: gross profit = revenue − delivery − platform", () => {
  const m = rowMetrics(r3, ctx);
  near(m.revenue, 20);
  near(m.deliveryCost, 25);
  near(m.platformCost, 0.5);
  near(m.grossProfit, -5.5);
});

test("grossMarginPct is profit / revenue, and null on zero revenue", () => {
  near(grossMarginPct(14, 45), 14 / 45);
  assert.equal(grossMarginPct(0, 0), null);
  assert.equal(grossMarginPct(-3, 0), null);
});

// --- Totals --------------------------------------------------------------------

test("summarize adds up the fixture", () => {
  const t = summarize(rows, ctx);
  assert.equal(t.volume, 3600);
  near(t.revenue, 114);
  near(t.deliveryCost, 75);
  near(t.platformCost, 3.7);
  near(t.totalCost, 78.7);
  near(t.grossProfit, 35.3);
  near(t.grossMarginPct, 35.3 / 114);
  near(t.revenuePerMessage, 114 / 3600);
  near(t.costPerMessage, 78.7 / 3600);
  assert.equal(t.lossMaking, false);
});

test("summarize of no rows is all zeros with null ratios", () => {
  const t = summarize([], ctx);
  assert.equal(t.revenue, 0);
  assert.equal(t.grossMarginPct, null);
  assert.equal(t.revenuePerMessage, null);
  assert.equal(t.costPerMessage, null);
});

test("groupAndSummarize by country", () => {
  const byCountry = groupAndSummarize(rows, ctx, (r) => r.country);
  near(byCountry.get("HR").revenue, 54);
  near(byCountry.get("HR").grossProfit, 18.8);
  near(byCountry.get("US").grossProfit, 22);
  near(byCountry.get("NG").grossProfit, -5.5);
  assert.equal(byCountry.get("NG").lossMaking, true);
});

test("monthlyTotals returns 12 months, empty months as zero", () => {
  const months = monthlyTotals(rows, ctx);
  assert.equal(months.length, 12);
  assert.equal(months[0].month, 1);
  near(months[0].revenue, 85); // r1 + r2
  near(months[1].revenue, 29); // r3 + r4
  assert.equal(months[2].revenue, 0);
  assert.equal(months[2].grossMarginPct, null);
});

test("channelTotals gives average revenue and cost per message", () => {
  const [sms, whatsapp] = channelTotals(rows, ctx);
  assert.equal(sms.channel, "SMS");
  near(sms.revenuePerMessage, 105 / 3500); // (45 + 40 + 20) / 3500
  near(sms.costPerMessage, 74.5 / 3500); // (30 + 16 + 25 + 1 + 2 + 0.5) / 3500
  assert.equal(whatsapp.channel, "WhatsApp");
  near(whatsapp.revenuePerMessage, 0.09);
  near(whatsapp.costPerMessage, 0.042);
});

// --- Routes and customers ------------------------------------------------------

test("routeProfitability flags loss-making routes and sorts lowest profit first", () => {
  const routes = routeProfitability(rows, ctx);
  assert.deepEqual(routes.map((r) => `${r.country} ${r.channel}`), ["NG SMS", "HR WhatsApp", "HR SMS", "US SMS"]);
  assert.equal(routes[0].lossMaking, true);
  assert.ok(routes.slice(1).every((r) => !r.lossMaking));
});

test("customerProfitability ranks customers by gross profit", () => {
  const customers = customerProfitability(rows, ctx);
  assert.deepEqual(customers.map((c) => [c.customer_id, c.rank]), [["A", 1], ["B", 2]]);
  near(customers[0].grossProfit, 18.8); // 14 + 4.8
  near(customers[1].grossProfit, 16.5); // 22 − 5.5
  assert.equal(customers[0].discount, 0.1);
});

test("whaleCurve rises above 100 % when a customer loses money", () => {
  const { points, peak, totalGrossProfit } = whaleCurve([
    { customer_id: "Z", grossProfit: -10 },
    { customer_id: "X", grossProfit: 60 },
    { customer_id: "Y", grossProfit: 50 },
  ]);
  assert.equal(totalGrossProfit, 100);
  assert.deepEqual(points.map((p) => p.customer_id), ["X", "Y", "Z"]);
  near(points[0].profitSharePct, 0.6);
  near(points[1].profitSharePct, 1.1);
  near(points[2].profitSharePct, 1.0);
  near(points[1].customerSharePct, 2 / 3);
  assert.equal(peak.customer_id, "Y");
  near(peak.profitSharePct, 1.1);
});

test("whaleCurve shares are null when total profit is not positive", () => {
  const { points } = whaleCurve([{ customer_id: "X", grossProfit: 5 }, { customer_id: "Y", grossProfit: -5 }]);
  assert.ok(points.every((p) => p.profitSharePct === null));
});

// --- Filters -------------------------------------------------------------------

test("filterRows by month range, channel and industry", () => {
  const customersById = { A: { industry: "Banking" }, B: { industry: "Retail" } };
  assert.deepEqual(filterRows(rows, { monthFrom: 2, monthTo: 2 }), [r3, r4]);
  assert.deepEqual(filterRows(rows, { channel: "WhatsApp" }), [r4]);
  assert.deepEqual(filterRows(rows, { industry: "Retail" }, customersById), [r2, r3]);
  assert.deepEqual(filterRows(rows, { country: "all", category: "" }), rows);
});

test("calculations never change their input rows", () => {
  const frozen = rows.map((r) => Object.freeze({ ...r }));
  Object.freeze(frozen);
  assert.doesNotThrow(() => {
    summarize(frozen, ctx);
    routeProfitability(frozen, ctx);
    whaleCurve(customerProfitability(frozen, ctx));
    filterRows(frozen, { monthFrom: 2 });
  });
});

// --- Reconciliation on the real generated data ---------------------------------

const assumptionsFile = JSON.parse(readFileSync(new URL("../data/assumptions.json", import.meta.url), "utf8"));
const traffic = JSON.parse(readFileSync(new URL("../data/traffic.json", import.meta.url), "utf8"));
const realCtx = buildCalcContext(assumptionsFile);

test("buildCalcContext reads the FX rate and every customer's discount", () => {
  assert.equal(typeof realCtx.eurUsd, "number");
  assert.equal(Object.keys(realCtx.discountByCustomer).length, assumptionsFile.customers.length);
});

test("total revenue and profit equal the sum by country, by channel and by customer", () => {
  const total = summarize(traffic, realCtx);
  for (const keyFn of [(r) => r.country, (r) => r.channel, (r) => r.customer_id]) {
    const groups = [...groupAndSummarize(traffic, realCtx, keyFn).values()];
    near(groups.reduce((s, g) => s + g.revenue, 0), total.revenue, 1e-6);
    near(groups.reduce((s, g) => s + g.grossProfit, 0), total.grossProfit, 1e-6);
  }
});

test("baseline gross margin is inside the target range in assumptions.json", () => {
  const values = new Map(assumptionsFile.assumptions.map((a) => [a.id, a.value]));
  const margin = summarize(traffic, realCtx).grossMarginPct;
  assert.ok(margin >= values.get("target_margin_min") && margin <= values.get("target_margin_max"),
    `baseline margin ${(margin * 100).toFixed(1)} % is outside the target range`);
});
