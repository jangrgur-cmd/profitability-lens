// Tests for the pure UI helpers: number formatting and URL hash state.
// Run with: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatEur, formatPct, formatPerMessage, formatCount, formatInteger } from "../js/format.js";
import { parseHash, serializeHash, defaultState, filtersAreDefault } from "../js/state.js";

const { dimensions } = JSON.parse(readFileSync(new URL("../data/assumptions.json", import.meta.url), "utf8"));
const MINUS = "−";

// --- Formatting ---------------------------------------------------------------

test("formatEur abbreviates to one decimal", () => {
  assert.equal(formatEur(1_234_567), "€1.2M");
  assert.equal(formatEur(45_300), "€45.3k");
  assert.equal(formatEur(512.4), "€512");
  assert.equal(formatEur(2_500_000_000), "€2.5B");
  assert.equal(formatEur(-15_244), `${MINUS}€15.2k`);
  assert.equal(formatEur(null), "n/a");
});

test("formatPct uses one decimal and n/a for null", () => {
  assert.equal(formatPct(0.2214), "22.1%");
  assert.equal(formatPct(-0.062), `${MINUS}6.2%`);
  assert.equal(formatPct(0), "0.0%");
  assert.equal(formatPct(null), "n/a");
});

test("formatPerMessage uses four decimals", () => {
  assert.equal(formatPerMessage(0.012345), "0.0123 €/msg");
  assert.equal(formatPerMessage(null), "n/a");
});

test("formatCount and formatInteger", () => {
  assert.equal(formatCount(821_584_062), "821.6M");
  assert.equal(formatCount(950), "950");
  assert.equal(formatInteger(1_234_567), "1,234,567");
});

// --- URL hash state -------------------------------------------------------------

test("default state serializes to an empty hash", () => {
  assert.equal(serializeHash(defaultState()), "");
  assert.deepEqual(parseHash("", dimensions), defaultState());
});

test("state survives a round trip through the hash", () => {
  const state = {
    tab: "routes",
    filters: { monthFrom: 3, monthTo: 8, country: "NG", channel: "SMS", category: "marketing", industry: "Banking" },
  };
  const hash = serializeHash(state);
  assert.equal(hash, "#tab=routes&from=3&to=8&country=NG&channel=SMS&category=marketing&industry=Banking");
  assert.deepEqual(parseHash(hash, dimensions), state);
});

test("invalid hash values fall back to defaults", () => {
  const state = parseHash("#tab=nope&from=0&to=13&country=XX&channel=Fax&industry=Mining", dimensions);
  assert.deepEqual(state, defaultState());
});

test("a reversed month range falls back to the full year", () => {
  const state = parseHash("#from=9&to=2", dimensions);
  assert.equal(state.filters.monthFrom, 1);
  assert.equal(state.filters.monthTo, 12);
});

test("filtersAreDefault", () => {
  assert.equal(filtersAreDefault(defaultState().filters), true);
  assert.equal(filtersAreDefault({ ...defaultState().filters, country: "HR" }), false);
});
