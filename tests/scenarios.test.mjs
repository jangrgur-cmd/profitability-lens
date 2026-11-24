// Unit tests for js/scenarios.js.
// Run with: node --test tests/
//
// Fixture (EUR/USD 1.25, so 1 USD = 0.80 EUR; customer A 10 % discount, B none):
// | row | customer | route          | volume | price | pass-through | cost      | platform |
// | s1  | A        | DE SMS mkt     | 1,000  | 0.10  | 0            | 0.06 EUR  | 0.001    |
// | s2  | B        | US SMS auth    | 2,000  | 0.02  | 0.004        | 0.01 USD  | 0.001    |
// | w1  | A        | DE WhatsApp mkt|   100  | 0.12  | 0.11         | 0.1375 USD| 0.001    |

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCalcContext, summarize, routeProfitability, filterRows } from "../js/calc.js";
import {
  DEFAULT_SCENARIO, makeScenario, isDefaultScenario, applyVolumeChange, applyMigration, applyPriceChange,
  applyCostChange, applyFxChange, runScenario, marginBridge, mostAffected, PRESETS,
} from "../js/scenarios.js";

const ctx = { eurUsd: 1.25, discountByCustomer: { A: 0.1, B: 0 } };
const s1 = { month: 1, customer_id: "A", country: "DE", channel: "SMS", category: "marketing", volume: 1000, price_eur: 0.1, passthrough_eur: 0, cost_local: 0.06, cost_currency: "EUR", platform_cost_eur: 0.001 };
const s2 = { month: 1, customer_id: "B", country: "US", channel: "SMS", category: "authentication", volume: 2000, price_eur: 0.02, passthrough_eur: 0.004, cost_local: 0.01, cost_currency: "USD", platform_cost_eur: 0.001 };
const w1 = { month: 1, customer_id: "A", country: "DE", channel: "WhatsApp", category: "marketing", volume: 100, price_eur: 0.12, passthrough_eur: 0.11, cost_local: 0.1375, cost_currency: "USD", platform_cost_eur: 0.001 };
const rows = [s1, s2, w1];

// WhatsApp rates for routes that have no WhatsApp row yet (used by migration)
const rates = new Map([
  ["price_US_WhatsApp_authentication", 0.007], ["passthrough_US_WhatsApp_authentication", 0.003],
  ["cost_US_WhatsApp_authentication", 0.00375], ["cost_currency_US_WhatsApp", "USD"], ["platform_cost_WhatsApp", 0.001],
]);

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}
const gp = (r, c = ctx) => summarize(r, c).grossProfit;

// --- Defaults --------------------------------------------------------------------

test("the default scenario reproduces the baseline exactly", () => {
  const states = runScenario(rows, ctx, DEFAULT_SCENARIO, rates);
  const last = states[states.length - 1];
  assert.deepEqual(last.rows, rows);
  assert.deepEqual(last.ctx, ctx);
  assert.ok(isDefaultScenario(makeScenario()));
  assert.ok(!isDefaultScenario(makeScenario({ fxChange: -0.1 })));
});

test("the default scenario reproduces the baseline exactly on the real data", () => {
  const assumptionsFile = JSON.parse(readFileSync(new URL("../data/assumptions.json", import.meta.url), "utf8"));
  const traffic = JSON.parse(readFileSync(new URL("../data/traffic.json", import.meta.url), "utf8"));
  const realCtx = buildCalcContext(assumptionsFile);
  const realRates = new Map(assumptionsFile.assumptions.map((a) => [a.id, a.value]));
  const states = runScenario(traffic, realCtx, makeScenario(), realRates);
  const bridge = marginBridge(states);
  assert.equal(bridge.scenario.grossProfit, bridge.baseline.grossProfit);
  assert.equal(bridge.scenario.revenue, bridge.baseline.revenue);
  assert.ok(bridge.steps.every((st) => st.delta === 0));
});

// --- Step 1: volume ----------------------------------------------------------------

test("volume change multiplies volume, optionally for one category", () => {
  const all = applyVolumeChange(rows, { volumeChange: 0.1, volumeCategory: "all" });
  near(all[0].volume, 1100);
  near(all[1].volume, 2200);
  const mkt = applyVolumeChange(rows, { volumeChange: -0.2, volumeCategory: "marketing" });
  near(mkt[0].volume, 800);
  assert.equal(mkt[1].volume, 2000); // authentication unchanged
});

// --- Step 2: migration -------------------------------------------------------------

test("migration moves SMS volume into the existing WhatsApp row", () => {
  // 25 % of 1,000 marketing SMS → 750 SMS left; WhatsApp 100 + 250 = 350.
  const out = applyMigration(rows, { migration: { marketing: 0.25, utility: 0, authentication: 0 }, conversionRatio: 1 }, rates);
  near(out.find((r) => r.channel === "SMS" && r.country === "DE").volume, 750);
  near(out.find((r) => r.channel === "WhatsApp" && r.country === "DE").volume, 350);
  assert.equal(out.length, 3, "no new row needed");
});

test("migration creates a WhatsApp row at WhatsApp rates when none exists, using the conversion ratio", () => {
  // 50 % of 2,000 US authentication SMS = 1,000 moved; ratio 0.8 → 800 WhatsApp messages.
  const out = applyMigration(rows, { migration: { authentication: 0.5, utility: 0, marketing: 0 }, conversionRatio: 0.8 }, rates);
  const created = out.find((r) => r.channel === "WhatsApp" && r.country === "US");
  near(created.volume, 800);
  assert.equal(created.price_eur, 0.007);
  assert.equal(created.passthrough_eur, 0.003);
  assert.equal(created.cost_currency, "USD");
  near(out.find((r) => r.channel === "SMS" && r.country === "US").volume, 1000);
});

// --- Step 3: price -------------------------------------------------------------------

test("price change applies to our own fee only, not to pass-through fees", () => {
  // WhatsApp: pass-through 0.11 + own fee 0.01 × 1.10 = 0.121
  const out = applyPriceChange(rows, { priceChange: 0.1, priceChannel: "WhatsApp" });
  near(out[2].price_eur, 0.121);
  assert.equal(out[0].price_eur, 0.1, "SMS unchanged when only WhatsApp is selected");
  // All channels: DE SMS 0.10 → 0.11; US SMS 0.004 + 0.016 × 1.1 = 0.0216
  const all = applyPriceChange(rows, { priceChange: 0.1, priceChannel: "all" });
  near(all[0].price_eur, 0.11);
  near(all[1].price_eur, 0.0216);
});

// --- Step 4: cost --------------------------------------------------------------------

test("cost change applies to the chosen channel and countries", () => {
  const out = applyCostChange(rows, { costChange: 0.15, costChannel: "SMS", costCountries: ["DE"] });
  near(out[0].cost_local, 0.069); // DE SMS 0.06 × 1.15
  assert.equal(out[1].cost_local, 0.01, "US not selected");
  assert.equal(out[2].cost_local, 0.1375, "WhatsApp not selected");
  // Gross profit falls by exactly the extra cost: 1,000 × 0.009 = 9
  near(gp(rows) - gp(out), 9);
});

// --- Step 5: FX ----------------------------------------------------------------------

test("a stronger dollar raises the EUR cost of USD lines only", () => {
  const strong = applyFxChange(ctx, { fxChange: -0.2 }); // 1.25 → 1.00, so 1 USD = 1 EUR
  near(strong.eurUsd, 1);
  // USD delivery cost before: s2 2,000 × 0.01 × 0.8 = 16; w1 100 × 0.1375 × 0.8 = 11 → 27
  // after: 20 + 13.75 = 33.75 → gross profit falls by 6.75
  near(gp(rows) - gp(rows, strong), 6.75);
  assert.equal(ctx.eurUsd, 1.25, "baseline context unchanged");
});

// --- Bridge --------------------------------------------------------------------------

test("bridge steps add up exactly to the total change in gross profit", () => {
  const scenario = makeScenario({
    volumeChange: 0.1, migration: { marketing: 0.25 }, priceChange: 0.05, costChange: 0.15, costChannel: "SMS", fxChange: -0.1,
  });
  const bridge = marginBridge(runScenario(rows, ctx, scenario, rates));
  const sum = bridge.steps.reduce((s, st) => s + st.delta, 0);
  near(sum, bridge.scenario.grossProfit - bridge.baseline.grossProfit);
  assert.deepEqual(bridge.steps.map((s) => s.key), ["volume", "migration", "price", "cost", "fx"]);
  assert.ok(bridge.steps.find((s) => s.key === "fx").delta < 0, "a stronger dollar lowers profit");
});

test("mostAffected ranks groups by absolute change in gross profit", () => {
  const states = runScenario(rows, ctx, makeScenario({ costChange: 0.5, costChannel: "SMS" }), rates);
  const last = states[states.length - 1];
  const top = mostAffected(rows, ctx, last.rows, last.ctx, (r) => `${r.country} ${r.channel}`);
  // DE SMS extra cost 1,000 × 0.03 = 30; US SMS 2,000 × 0.005 × 0.8 = 8; WhatsApp unchanged (left out)
  assert.deepEqual(top.map((t) => t.key), ["DE SMS", "US SMS"]);
  near(top[0].delta, -30);
});

test("scenarios never change the input rows", () => {
  const frozen = Object.freeze(rows.map((r) => Object.freeze({ ...r })));
  assert.doesNotThrow(() => runScenario(frozen, Object.freeze({ ...ctx }), makeScenario({
    volumeChange: 0.2, migration: { authentication: 0.5, marketing: 0.5 }, priceChange: -0.1, costChange: 0.3, fxChange: 0.1,
  }), rates));
});

test("presets use only valid parameters", () => {
  for (const preset of PRESETS) {
    const s = makeScenario(preset.scenario);
    assert.ok(!isDefaultScenario(s), `${preset.id} must change something`);
    assert.ok(preset.description.length > 0);
  }
});

test("raising a route's delivery cost by its headroom brings its gross profit to zero (real data)", () => {
  const assumptionsFile = JSON.parse(readFileSync(new URL("../data/assumptions.json", import.meta.url), "utf8"));
  const traffic = JSON.parse(readFileSync(new URL("../data/traffic.json", import.meta.url), "utf8"));
  const realCtx = buildCalcContext(assumptionsFile);
  const realRates = new Map(assumptionsFile.assumptions.map((a) => [a.id, a.value]));
  for (const route of routeProfitability(traffic, realCtx)) {
    const scenario = makeScenario({ costChange: route.costHeadroom, costChannel: route.channel, costCountries: [route.country] });
    const states = runScenario(traffic, realCtx, scenario, realRates);
    const last = states[states.length - 1];
    const routeRows = filterRows(last.rows, { country: route.country, channel: route.channel });
    near(summarize(routeRows, last.ctx).grossProfit, 0, 1e-6);
  }
});
