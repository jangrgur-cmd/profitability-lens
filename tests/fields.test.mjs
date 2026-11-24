// Tests for src/rating/fields.js: the input schema, validation and JSON round trip.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FIELDS, GROUPS, validateValues, parseForm, exportJson, importJson } from "../src/rating/fields.js";

const blankValues = () => Object.fromEntries(FIELDS.map((f) => [f.id, null]));

test("every field is complete and has a Croatian term", () => {
  const ids = new Set();
  for (const f of FIELDS) {
    assert.ok(!ids.has(f.id), `duplicate id ${f.id}`);
    ids.add(f.id);
    assert.ok(f.label && f.help && f.hr, `${f.id} needs label, help and hr`);
    assert.ok(GROUPS.some((g) => g.id === f.group), `${f.id} has unknown group ${f.group}`);
    assert.ok(["positive", "nonNegative", "any"].includes(f.sign), `${f.id} has unknown sign rule`);
  }
  assert.deepEqual(FIELDS.filter((f) => f.required).map((f) => f.id), ["revenue", "assets", "equity"]);
});

test("required fields must be given", () => {
  const errors = validateValues(blankValues());
  assert.deepEqual(Object.keys(errors).sort(), ["assets", "equity", "revenue"]);
});

test("sign rules: revenue and assets positive, costs not negative, equity and tax may be negative", () => {
  const values = { ...blankValues(), revenue: 0, assets: -1, equity: -500, tax: -20, otherIncome: -5, cogs: -1, priorAssets: 0 };
  const errors = validateValues(values);
  assert.match(errors.revenue, /greater than zero/);
  assert.match(errors.assets, /greater than zero/);
  assert.match(errors.cogs, /cannot be negative/);
  assert.match(errors.priorAssets, /greater than zero/);
  assert.equal(errors.equity, undefined);
  assert.equal(errors.tax, undefined);
  assert.equal(errors.otherIncome, undefined);
});

test("parseForm parses typed text and reports which field is wrong", () => {
  const { values, errors } = parseForm({ revenue: "1.234.567,89", assets: "2 000 000", equity: "(50.000)", cogs: "abc" });
  assert.equal(values.revenue, 1234567.89);
  assert.equal(values.assets, 2000000);
  assert.equal(values.equity, -50000);
  assert.equal(values.cogs, null);
  assert.equal(values.opex, null, "missing keys are blank");
  assert.deepEqual(Object.keys(errors), ["cogs"]);
  assert.match(errors.cogs, /^Cost of goods sold: Not a number/);
});

test("exportJson and importJson round-trip values, industry and name", () => {
  const values = { ...blankValues(), revenue: 1000, cogs: 600, assets: 1200, equity: -50, otherIncome: -3.5 };
  const text = exportJson(values, { industryId: "retail", companyName: "Fictional d.o.o." });
  const back = importJson(text);
  assert.deepEqual(back.values, values);
  assert.deepEqual(back.errors, {});
  assert.equal(back.industryId, "retail");
  assert.equal(back.companyName, "Fictional d.o.o.");
});

test("importJson accepts typed text and rejects files that are not rating exports", () => {
  const typed = JSON.stringify({ kind: "profitability-lens/company-rating", version: 1, inputs: { revenue: "1.000", assets: "2.000", equity: "500" } });
  const result = importJson(typed);
  assert.equal(result.values.revenue, 1000);
  assert.equal(result.industryId, null);
  assert.throws(() => importJson("{not json"), /not valid JSON/);
  assert.throws(() => importJson(JSON.stringify({ revenue: 1 })), /not a Profitability Lens/);
  assert.throws(() => importJson(JSON.stringify({ kind: "profitability-lens/company-rating", version: 99, inputs: {} })), /newer version/);
});
