// Tests for js/checks.js: every check passes on the real data, and fails when
// the data is deliberately broken (so a check can never pass by accident).
// Run with: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildModel } from "../js/data.js";
import { runDataChecks } from "../js/checks.js";

const assumptionsFile = JSON.parse(readFileSync(new URL("../data/assumptions.json", import.meta.url), "utf8"));
const traffic = JSON.parse(readFileSync(new URL("../data/traffic.json", import.meta.url), "utf8"));
const model = buildModel(assumptionsFile, traffic);
const byId = (results) => Object.fromEntries(results.map((r) => [r.id, r]));

test("all data checks pass on the real data", () => {
  const results = runDataChecks(model, model.rows);
  for (const r of results) assert.ok(r.pass, `${r.label}: ${r.detail}`);
  assert.equal(results.length, 9);
});

test("a negative volume fails the negatives check", () => {
  const rows = [{ ...model.rows[0], volume: -5 }, ...model.rows.slice(1)];
  const results = byId(runDataChecks({ ...model, rows }, rows));
  assert.equal(results["no-negatives"].pass, false);
});

test("a price that does not match its assumption fails the resolve check", () => {
  const rows = [{ ...model.rows[0], price_eur: model.rows[0].price_eur + 0.01 }, ...model.rows.slice(1)];
  const results = byId(runDataChecks({ ...model, rows }, rows));
  assert.equal(results["assumptions-resolve"].pass, false);
});

test("a pass-through fee above the price fails the pass-through check", () => {
  const rows = [{ ...model.rows[0], passthrough_eur: model.rows[0].price_eur * 2 }, ...model.rows.slice(1)];
  const results = byId(runDataChecks({ ...model, rows }, rows));
  assert.equal(results["passthrough-within-price"].pass, false);
});

test("a sourced assumption without a URL fails the sourcing check", () => {
  const assumptions = model.assumptions.map((a, i) => (i === 0 ? { ...a, status: "sourced", source: "" } : a));
  const results = byId(runDataChecks({ ...model, assumptions }, model.rows));
  assert.equal(results.sourcing.pass, false);
});

test("reconciliation checks run on the filtered selection", () => {
  const selection = model.rows.filter((r) => r.country === "HR");
  const results = byId(runDataChecks(model, selection));
  assert.ok(results["sum-by-country"].pass);
  assert.match(results["sum-by-country"].detail, /over 1 country/);
});
