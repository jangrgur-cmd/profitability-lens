// Tests for src/rating/report.js: "Show the math", the DuPont sentences and
// the text summary, on the hand-checkable case from CLAUDE.md §4.5.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rate } from "../src/rating/rating.js";
import { explainRatio, dupontSentences, textSummary, ratioStatusText, keyFigureText, KEY_FIGURES } from "../src/rating/report.js";
import { SAMPLES } from "../src/rating/samples.js";
import { MINUS } from "../src/shared/format.js";
import { HAND_CASE } from "./fixtures.mjs";

const rating = rate(HAND_CASE, "general");
const ratio = (r, id) => r.ratios.find((x) => x.id === id);

test("show the math: formula, the user's numbers, the result and the building blocks", () => {
  assert.deepEqual(explainRatio(ratio(rating, "grossMargin"), rating.statement, HAND_CASE), {
    formula: "Gross profit ÷ Revenue",
    substituted: "= €400 ÷ €1,000",
    result: "= 40.0%",
    where: ["Gross profit = Revenue − Cost of goods sold = €1,000 − €600 = €400"],
  });
  const roe = explainRatio(ratio(rating, "roe"), rating.statement, HAND_CASE);
  assert.equal(roe.substituted, "= €96 ÷ €400");
  assert.equal(roe.result, "= 24.0%");
  assert.deepEqual(roe.where, [
    "Net income = EBIT + Other financial income − Interest − Tax = €150 + €0 − €30 − €24 = €96",
    "Average equity = (year end + prior year) ÷ 2 = (€500 + €300) ÷ 2 = €400",
  ]);
  const roic = explainRatio(ratio(rating, "roic"), rating.statement, HAND_CASE);
  assert.deepEqual(roic.where, [
    "NOPAT = EBIT × (1 − tax rate) = €150 × (1 − 20.0%) = €120",
    "Invested capital = Debt + Equity − Cash = €400 + €500 − €100 = €800",
  ]);
  assert.equal(roic.result, "= 15.0%");
});

test("show the math without COGS, without prior year, and for missing or meaningless ratios", () => {
  const values = { ...HAND_CASE, cogs: null, priorAssets: null, debt: null };
  const r = rate(values, "general");
  const gross = explainRatio(ratio(r, "grossMargin"), r.statement, values);
  assert.equal(gross.substituted, null);
  assert.equal(gross.result, "Missing input: Cost of goods sold");
  assert.match(explainRatio(ratio(r, "ebitdaMargin"), r.statement, values).where[0], /^EBITDA = Revenue − Operating expenses = €1,000 − €200 = €800$/);
  assert.match(explainRatio(ratio(r, "roa"), r.statement, values).where[1], /year-end total assets \(no prior year given\) = €1,200/);
  assert.equal(ratioStatusText(ratio(r, "roic")), "Missing input: Interest-bearing debt");

  const negative = { ...HAND_CASE, equity: -100, priorEquity: null };
  const n = rate(negative, "general");
  const roe = explainRatio(ratio(n, "roe"), n.statement, negative);
  assert.match(roe.result, /^Not meaningful: Equity is zero or negative/);
  assert.equal(roe.substituted, `= €96 ÷ ${MINUS}€100`);
});

test("DuPont in plain language matches CLAUDE.md: 9.6% × 1.00 × 2.50 = 24%", () => {
  assert.deepEqual(dupontSentences(rating.dupont), [
    "Each €1 of sales leaves €0.10 of net profit (net margin 9.6%).",
    "Each €1 of assets brings in €1.00 of sales a year (asset turnover 1.00×).",
    "Each €1 of the owners' equity carries €2.50 of assets; the rest is financed by debt and other liabilities (equity multiplier 2.50×).",
    "Together: 9.6% × 1.00 × 2.50 = 24.0%, so each €1 of equity earns €0.24 of profit a year (ROE).",
  ]);
  const loss = rate({ ...HAND_CASE, equity: -100, priorEquity: null, tax: 300 }, "general");
  const lines = dupontSentences(loss.dupont);
  assert.equal(lines.length, 3);
  assert.match(lines[0], new RegExp(`leaves ${MINUS}€0\\.18 of net profit`));
  assert.match(lines[2], /cannot be measured/);
});

test("key figures show n/a with a reason rather than a fake value", () => {
  assert.deepEqual(KEY_FIGURES.map((k) => keyFigureText(k.id, rating).text), ["€1,000", "€400", "€200", "€150", "€96", "5.0×"]);
  const hotel = SAMPLES.find((s) => s.id === "hotel");
  const r = rate(hotel.values, hotel.industryId);
  assert.deepEqual(keyFigureText("grossProfit", r), { text: "n/a", note: "No cost of goods sold given" });
  const noInterest = rate({ ...HAND_CASE, interest: 0 }, "general");
  assert.deepEqual(keyFigureText("interestCover", noInterest), { text: "n/a", note: "No interest expense" });
});

test("text summary carries the grade, every ratio, DuPont, flags and the benchmark caveat", () => {
  const text = textSummary(rating, { companyName: "  Hand case  " });
  assert.ok(text.startsWith("Profitability Lens: company rating\nCompany: Hand case\n"));
  assert.match(text, /rule-of-thumb thresholds, not official statistics/);
  assert.match(text, /Grade A \(96\/100\), Excellent\. Based on 8 of 8 ratios\./);
  assert.match(text, /Return on equity \(ROE\): 24\.0% \(Excellent\)/);
  assert.match(text, /DuPont: ROE 24\.0% = net margin 9\.6% × asset turnover 1\.00× × equity multiplier 2\.50×/);
  assert.ok(!text.includes("\nFlags\n"), "the hand case raises no flags");
  const startup = SAMPLES.find((s) => s.id === "startup");
  const s = textSummary(rate(startup.values, startup.industryId));
  assert.ok(!s.includes("Company:"), "no company line without a name");
  assert.match(s, /\[Critical\] Net loss:/);
  assert.match(s, /\[Info\] No prior-year figures:/);
  assert.ok(s.endsWith("no data was sent anywhere.\n"));
});
