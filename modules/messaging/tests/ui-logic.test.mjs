// Tests for the pure UI helpers: number formatting and URL hash state.
// Run with: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatEur, formatPct, formatPerMessage, formatCount, formatInteger } from "../js/format.js";
import { parseHash, serializeHash, defaultState, filtersAreDefault } from "../js/state.js";
import { toCsv } from "../js/export.js";
import { sortRows } from "../js/tables.js";
import { heatColor } from "../js/routes-view.js";

// --- CSV export -------------------------------------------------------------------

test("toCsv writes a header and raw values, quoting where needed", () => {
  const columns = [
    { label: "customer", key: "name" },
    { label: "revenue_eur", key: "revenue" },
    { label: "loss_making", csv: (r) => (r.gp < 0 ? "yes" : "no") },
  ];
  const rows = [
    { name: "Harbor & Pine, Travel", revenue: 1234.5, gp: 10 },
    { name: 'Say "hi"', revenue: 0.1 + 0.2, gp: -1 },
    { name: "Empty", revenue: null, gp: 0 },
  ];
  assert.equal(
    toCsv(columns, rows),
    'customer,revenue_eur,loss_making\r\n"Harbor & Pine, Travel",1234.5,no\r\n"Say ""hi""",0.3,yes\r\nEmpty,,no\r\n',
  );
});

// --- Table sorting -------------------------------------------------------------------

test("sortRows sorts numbers and text, puts nulls last and is stable", () => {
  const rows = [
    { id: "a", v: 3, t: "Germany" },
    { id: "b", v: null, t: "Croatia" },
    { id: "c", v: 1, t: "France" },
    { id: "d", v: 3, t: "United States" },
  ];
  const num = { key: "v", type: "number" };
  assert.deepEqual(sortRows(rows, num, "asc").map((r) => r.id), ["c", "a", "d", "b"]);
  assert.deepEqual(sortRows(rows, num, "desc").map((r) => r.id), ["a", "d", "c", "b"]);
  assert.deepEqual(sortRows(rows, { key: "t", type: "text" }, "asc").map((r) => r.id), ["b", "c", "a", "d"]);
  assert.deepEqual(rows.map((r) => r.id), ["a", "b", "c", "d"], "input must not be changed");
});

// --- Heatmap colours -------------------------------------------------------------------

test("heatColor uses the loss colour below zero and the profit colour above", () => {
  assert.match(heatColor(-0.05), /var\(--loss\)/);
  assert.match(heatColor(0.2), /var\(--profit\)/);
  assert.equal(heatColor(null), "transparent");
  // Stronger margins get a deeper tint, capped at the top of the scale.
  const strength = (css) => Number(css.match(/(\d+)%/)[1]);
  assert.ok(strength(heatColor(0.3)) > strength(heatColor(0.1)));
  assert.equal(strength(heatColor(0.5)), strength(heatColor(0.9)));
});

const { dimensions } = JSON.parse(readFileSync(new URL("../data/assumptions.json", import.meta.url), "utf8"));
const MINUS = "−⁠"; // minus sign + word joiner (no line break after the sign)

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
    filters: { monthFrom: 3, monthTo: 8, country: "HR", channel: "SMS", category: "marketing", industry: "Banking" },
    scenario: defaultState().scenario,
  };
  const hash = serializeHash(state);
  assert.equal(hash, "#tab=routes&from=3&to=8&country=HR&channel=SMS&category=marketing&industry=Banking");
  assert.deepEqual(parseHash(hash, dimensions), state);
});

test("scenario settings survive a round trip through the hash", () => {
  const state = defaultState();
  state.tab = "scenarios";
  state.scenario = {
    ...state.scenario,
    volumeChange: -0.05, volumeCategory: "marketing", migration: { authentication: 0, utility: 0.25, marketing: 0.25 },
    conversionRatio: 1.5, priceChange: 0.03, priceChannel: "WhatsApp", costChange: 0.15, costChannel: "SMS",
    costCountries: ["HR", "DE"], fxChange: -0.1,
  };
  const hash = serializeHash(state);
  assert.equal(hash, "#tab=scenarios&sv=-5&sp=3&sc=15&fx=-10&mu=25&mm=25&cr=1.5&svc=marketing&spc=WhatsApp&scc=SMS&sco=HR%2CDE");
  assert.deepEqual(parseHash(hash, dimensions), state);
});

test("out-of-range scenario values are ignored", () => {
  const state = parseHash("#sc=90&fx=-50&mm=80&cr=9&sco=XX,HR", dimensions);
  assert.equal(state.scenario.costChange, 0);
  assert.equal(state.scenario.fxChange, 0);
  assert.equal(state.scenario.migration.marketing, 0);
  assert.equal(state.scenario.conversionRatio, 1);
  assert.deepEqual(state.scenario.costCountries, ["HR"]);
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
