// Tests for the data generator: determinism and basic data integrity.
// Run with: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mulberry32, generateTraffic, serializeRows, indexAssumptions } from "../scripts/generate-data.mjs";

const assumptionsFile = JSON.parse(readFileSync(new URL("../data/assumptions.json", import.meta.url), "utf8"));
const trafficText = readFileSync(new URL("../data/traffic.json", import.meta.url), "utf8");

test("mulberry32: same seed gives the same sequence", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test("mulberry32: different seeds give different sequences", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const seqA = Array.from({ length: 10 }, a);
  const seqB = Array.from({ length: 10 }, b);
  assert.notDeepEqual(seqA, seqB);
});

test("mulberry32: values are in [0, 1)", () => {
  const rand = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const x = rand();
    assert.ok(x >= 0 && x < 1);
  }
});

test("generateTraffic: two runs produce identical rows", () => {
  assert.deepEqual(generateTraffic(assumptionsFile), generateTraffic(assumptionsFile));
});

test("generateTraffic: a different seed produces different rows", () => {
  const other = { ...assumptionsFile, generator: { ...assumptionsFile.generator, seed: 12345 } };
  assert.notDeepEqual(generateTraffic(other), generateTraffic(assumptionsFile));
});

test("committed traffic.json matches a fresh generation (run the generator after editing assumptions)", () => {
  assert.equal(trafficText, serializeRows(generateTraffic(assumptionsFile)));
});

test("traffic.json stays under 2 MB", () => {
  assert.ok(Buffer.byteLength(trafficText) < 2 * 1024 * 1024);
});

test("every row has positive integer volume, non-negative price and cost, and known dimensions", () => {
  const rows = JSON.parse(trafficText);
  const { dimensions } = assumptionsFile;
  const countries = new Set(dimensions.countries.map((c) => c.code));
  const channels = new Set(dimensions.channels);
  const categories = new Set(dimensions.categories.map((c) => c.id));
  const customers = new Set(assumptionsFile.customers.map((c) => c.id));
  const fields = ["month", "customer_id", "country", "channel", "category", "volume",
    "price_eur", "passthrough_eur", "cost_local", "cost_currency", "platform_cost_eur"];

  for (const row of rows) {
    assert.deepEqual(Object.keys(row), fields);
    assert.ok(Number.isInteger(row.volume) && row.volume > 0);
    assert.ok(row.price_eur >= 0 && row.cost_local >= 0 && row.platform_cost_eur >= 0);
    assert.ok(row.passthrough_eur >= 0 && row.passthrough_eur <= row.price_eur, "pass-through must be part of the price");
    assert.ok(row.month >= 1 && row.month <= 12);
    assert.ok(countries.has(row.country));
    assert.ok(channels.has(row.channel));
    assert.ok(categories.has(row.category));
    assert.ok(customers.has(row.customer_id));
    assert.ok(["EUR", "USD"].includes(row.cost_currency));
  }
});

test("every row's price and cost match an assumption", () => {
  const rows = JSON.parse(trafficText);
  const values = indexAssumptions(assumptionsFile);
  for (const row of rows) {
    const route = `${row.country}_${row.channel}`;
    assert.equal(row.price_eur, values.get(`price_${route}_${row.category}`));
    assert.equal(row.passthrough_eur, values.get(`passthrough_${route}_${row.category}`));
    assert.equal(row.cost_local, values.get(`cost_${route}_${row.category}`));
    assert.equal(row.cost_currency, values.get(`cost_currency_${route}`));
    assert.equal(row.platform_cost_eur, values.get(`platform_cost_${row.channel}`));
  }
});

test("assumptions: unique ids, valid status, and no source on placeholders", () => {
  const ids = new Set();
  for (const a of assumptionsFile.assumptions) {
    assert.ok(!ids.has(a.id), `duplicate id ${a.id}`);
    ids.add(a.id);
    assert.ok(["placeholder", "sourced", "estimated"].includes(a.status), `bad status on ${a.id}`);
    if (a.status === "placeholder") assert.equal(a.source, "", `placeholder ${a.id} must not have a source`);
    if (a.status === "sourced") assert.match(a.source, /^https:\/\//, `sourced ${a.id} needs a source URL`);
    if (a.status === "estimated") assert.notEqual(a.note, "", `estimated ${a.id} needs its reasoning in note`);
  }
});

test("every customer's discount tier is a defined assumption", () => {
  const values = indexAssumptions(assumptionsFile);
  for (const c of assumptionsFile.customers) {
    assert.ok(values.has(c.discount_tier), `${c.id} has unknown tier ${c.discount_tier}`);
  }
});
