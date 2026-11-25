// Tests for the learning materials (src/learn/): the five practice cases and
// "Guess the grade", the glossary and the formula cheat sheet.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CASES, CASE_BY_ID, caseHash, caseFromHash } from "../src/learn/cases.js";
import { GRADE_LETTERS, rateCase, judgeGuess, quizScore, cleanAnswers } from "../src/learn/quiz.js";
import { GLOSSARY, GLOSSARY_BY_ID, CATEGORIES, searchGlossary } from "../src/learn/glossary.js";
import { cheatSheet, cheatSheetText, SHEET_INDUSTRY_ID } from "../src/learn/cheatsheet.js";
import { rate, GRADES, FLAG_LIMITS } from "../src/rating/rating.js";
import { RATIOS } from "../src/rating/ratios.js";
import { INDUSTRY_BY_ID } from "../src/rating/benchmarks.js";
import { validateValues } from "../src/rating/fields.js";
import { SCORE_ANCHORS, scoreAgainstThresholds } from "../src/shared/margin.js";
import { t, textIn, useLanguage } from "../src/shared/i18n.js";

afterEach(() => useLanguage("en"));

// ---------------------------------------------------------------------------
// Practice cases
// ---------------------------------------------------------------------------

/** The grade each case is written to teach. If a benchmark change moves one, retune the case and re-read its story and lesson. */
const EXPECTED = { saas: "B", supermarket: "A", bistro: "E", metalworks: "C", reseller: "D" };

test("the five practice cases are valid, fictional and earn the grades A to E once each", () => {
  assert.equal(CASES.length, 5);
  for (const c of CASES) {
    assert.equal(c.fictional, true, c.id);
    assert.deepEqual(validateValues(c.values), {}, c.id);
    assert.ok(INDUSTRY_BY_ID[c.industryId], c.id);
    assert.equal(rateCase(c).grade.letter, EXPECTED[c.id], `${c.id}: score ${rateCase(c).score}`);
  }
  assert.deepEqual(CASES.map((c) => rateCase(c).grade.letter).sort(), ["A", "B", "C", "D", "E"]);
  assert.notDeepEqual(CASES.map((c) => EXPECTED[c.id]), ["A", "B", "C", "D", "E"], "the quiz order should not give the answers away");
});

test("each case shows what its lesson says", () => {
  const r = (id) => rateCase(CASE_BY_ID[id]);
  const ratio = (rating, id) => rating.ratios.find((x) => x.id === id);

  // SaaS: a net margin above 12% is only B for software, but A on General benchmarks.
  const saas = r("saas");
  assert.ok(ratio(saas, "netMargin").value > 0.12);
  assert.equal(ratio(saas, "grossMargin").band.id, "fair");
  assert.equal(ratio(saas, "roce").band.id, "fair");
  assert.equal(rate(CASE_BY_ID.saas.values, "general").grade.letter, "A");

  // Supermarket: under 4% net margin, about 2× asset turnover, excellent ROA.
  const shop = r("supermarket");
  assert.ok(ratio(shop, "netMargin").value < 0.04);
  assert.ok(Math.abs(shop.dupont.assetTurnover - 2) < 0.1);
  assert.equal(ratio(shop, "roa").band.id, "excellent");

  // Bistro: good gross margin, operating loss, net loss.
  const bistro = r("bistro");
  assert.equal(ratio(bistro, "grossMargin").band.id, "good");
  assert.ok(bistro.statement.ebit < 0 && bistro.statement.netIncome < 0);
  assert.ok(bistro.flags.some((f) => f.id === "operating_loss"));

  // Metalworks: no COGS (7 of 8 ratios), ROE good thanks to leverage of about 4×, margins fair.
  const metal = r("metalworks");
  assert.equal(ratio(metal, "grossMargin").status, "missing");
  assert.equal(metal.coverage.count, 7);
  assert.equal(ratio(metal, "roe").band.id, "good");
  assert.ok(Math.abs(metal.dupont.equityMultiplier - 4) < 0.3);
  assert.ok(metal.flags.some((f) => f.id === "leverage_inflated_roe"));
  for (const id of ["ebitdaMargin", "operatingMargin", "netMargin"]) assert.equal(ratio(metal, id).band.id, "fair", id);

  // Reseller: thin gross margin, interest cover below the 1.5× limit.
  const reseller = r("reseller");
  assert.equal(ratio(reseller, "grossMargin").band.id, "weak");
  assert.ok(reseller.statement.interestCover < FLAG_LIMITS.minInterestCover);
  assert.ok(reseller.flags.some((f) => f.id === "low_interest_cover"));
});

test("case links: #case=<id> opens a case; anything else is ignored", () => {
  assert.equal(caseHash("saas"), "#case=saas");
  assert.equal(caseFromHash("#case=bistro"), CASE_BY_ID.bistro);
  assert.equal(caseFromHash("#case=nope"), null);
  assert.equal(caseFromHash("#from=segments&revenue=1&cogs=0"), null);
  assert.equal(caseFromHash(""), null);
  assert.throws(() => caseHash("nope"), /Unknown practice case/);
});

test("case stories and lessons exist in both languages", () => {
  for (const lang of ["en", "hr"]) {
    useLanguage(lang);
    for (const c of CASES) assert.ok(c.story.length > 40 && c.lesson.length > 80, `${lang} ${c.id}`);
  }
});

// ---------------------------------------------------------------------------
// Guess the grade
// ---------------------------------------------------------------------------

test("judgeGuess: exact, too optimistic and too strict, with plural forms", () => {
  assert.deepEqual(GRADE_LETTERS, ["A", "B", "C", "D", "E"]);
  assert.deepEqual(judgeGuess("C", "C"), { correct: true, steps: 0, direction: "exact", text: "Spot on: grade C." });
  const high = judgeGuess("A", "C");
  assert.equal(high.direction, "tooHigh");
  assert.equal(high.steps, 2);
  assert.equal(high.text, "2 grades too optimistic: you said A, the rating is C.");
  assert.equal(judgeGuess("E", "D").text, "One grade too strict: you said E, the rating is D.");
  assert.throws(() => judgeGuess("F", "A"), /Unknown grade/);

  useLanguage("hr");
  assert.equal(judgeGuess("B", "A").text, "Jedna ocjena prestrogo: rekli ste B, ocjena je A.");
  assert.equal(judgeGuess("A", "D").text, "3 ocjene preoptimistično: rekli ste A, ocjena je D.");
});

test("quizScore counts answered and right guesses; cleanAnswers drops junk", () => {
  const gradeOf = (c) => EXPECTED[c.id];
  assert.deepEqual(quizScore({}, CASES, gradeOf), { answered: 0, correct: 0, total: 5 });
  assert.deepEqual(quizScore({ saas: "B", bistro: "D", supermarket: "A" }, CASES, gradeOf), { answered: 3, correct: 2, total: 5 });
  assert.deepEqual(cleanAnswers({ saas: "B", bistro: "Z", other: "A", reseller: 3 }, CASES), { saas: "B" });
  assert.deepEqual(cleanAnswers(null, CASES), {});
  assert.deepEqual(cleanAnswers("x", CASES), {});
});

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------

test("every glossary entry has a name in both languages, a definition, a known section and valid links", () => {
  const ids = new Set();
  for (const e of GLOSSARY) {
    assert.ok(!ids.has(e.id), `duplicate ${e.id}`);
    ids.add(e.id);
    assert.ok(CATEGORIES.some((c) => c.id === e.category), e.id);
    for (const id of e.related) assert.ok(GLOSSARY_BY_ID[id], `${e.id} links to unknown ${id}`);
    for (const lang of ["en", "hr"]) {
      useLanguage(lang);
      assert.ok(e.term && e.alt && e.definition.length > 30, `${lang} ${e.id}`);
    }
  }
  assert.ok(GLOSSARY.length >= 50, `only ${GLOSSARY.length} entries`);
  for (const c of CATEGORIES) assert.ok(GLOSSARY.some((e) => e.category === c.id), c.id);
});

test("the glossary covers every ratio, with the engine's own name and formula", () => {
  for (const r of RATIOS) {
    const e = GLOSSARY_BY_ID[r.id];
    assert.ok(e, r.id);
    assert.equal(e.term, r.label);
    assert.equal(e.formula, r.formula);
  }
});

test("the other-language name is exactly the term the other interface uses", () => {
  const roe = GLOSSARY_BY_ID.roe;
  assert.equal(roe.alt, "Rentabilnost vlastitog kapitala (ROE)");
  assert.equal(roe.altLang, "hr");
  assert.equal(GLOSSARY_BY_ID.equity.alt, "Kapital i rezerve");
  useLanguage("hr");
  assert.equal(roe.term, "Rentabilnost vlastitog kapitala (ROE)");
  assert.equal(roe.alt, "Return on equity (ROE)");
  assert.equal(roe.altLang, "en");
  for (const e of GLOSSARY) assert.equal(e.alt, textIn("en", e.termKey), e.id);
});

test("textIn reads another language without changing the current one", () => {
  assert.equal(textIn("hr", "rating.grades.A"), "Izvrsna");
  assert.equal(t("rating.grades.A"), "Excellent");
});

test("glossary search ignores case and accents, matches both languages and puts name matches first", () => {
  const terms = (q, o) => searchGlossary(q, o).map((e) => e.id);
  assert.deepEqual(terms("roic"), ["roic", ...terms("roic").slice(1)]);
  assert.ok(terms("ROE").includes("roe"));
  assert.ok(terms("kapital").includes("equity"), "Croatian name found from the English interface");
  assert.ok(terms("whale curve").includes("whaleCurve"));
  assert.equal(terms("zzzz").length, 0);
  assert.equal(terms("").length, GLOSSARY.length);
  assert.ok(terms("", { category: "segments" }).every((id) => GLOSSARY_BY_ID[id].category === "segments"));
  const margin = terms("margin");
  const firstDefinitionOnly = margin.findIndex((id) => !/margin/i.test(`${GLOSSARY_BY_ID[id].term} ${GLOSSARY_BY_ID[id].alt}`));
  assert.ok(firstDefinitionOnly > 0, "entries named 'margin' come before those that only mention it");
  assert.ok(margin.slice(firstDefinitionOnly).every((id) => !/margin/i.test(GLOSSARY_BY_ID[id].term)));

  useLanguage("hr");
  assert.ok(terms("trosak").includes("cogs"), "trosak finds Trošak");
  assert.ok(terms("equity").includes("equity"), "English name found from the Croatian interface");
});

test("glossary listing is alphabetical in the interface language", () => {
  const names = searchGlossary("").map((e) => e.term);
  assert.deepEqual(names, [...names].sort(new Intl.Collator("en").compare));
  useLanguage("hr");
  const hr = searchGlossary("").map((e) => e.term);
  assert.deepEqual(hr, [...hr].sort(new Intl.Collator("hr").compare));
});

// ---------------------------------------------------------------------------
// Cheat sheet
// ---------------------------------------------------------------------------

test("the cheat sheet prints the engine's own ratios, weights, score points, grades, limits and thresholds", () => {
  const sheet = cheatSheet();
  const section = (id) => sheet.sections.find((s) => s.id === id);
  assert.deepEqual(section("ratios").ratios, RATIOS.map((r) => ({ label: r.label, formula: r.formula, weight: r.weight })));
  assert.equal(section("ratios").ratios.reduce((sum, r) => sum + r.weight, 0), 100);

  const [floor, poor, fair, good, excellent] = SCORE_ANCHORS;
  assert.equal(section("scoring").lines[0],
    `Each ratio scores ${floor} at the floor (poor − (fair − poor)), ${poor} at poor, ${fair} at fair, ${good} at good and ${excellent} at excellent, in straight lines between.`);
  // The anchors on the sheet are the ones the scoring uses.
  const scale = [0, 10, 20, 30];
  assert.deepEqual([-10, 0, 10, 20, 30].map((x) => scoreAgainstThresholds(x, scale)), SCORE_ANCHORS);

  assert.equal(section("scoring").lines[2], `Grade: ${GRADES.map((g, i) => (g.min > 0 ? `${g.letter} ${g.min}+ (${g.label})` : `${g.letter} below ${GRADES[i - 1].min} (${g.label})`)).join(", ")}.`);
  assert.ok(section("flags").lines.includes("Interest cover below 1.5×: serious."));
  assert.ok(section("flags").lines.includes("Equity multiplier above 3.0×: ROE inflated by leverage."));
  assert.ok(section("flags").lines.includes("Depreciation & amortisation above 50% of EBITDA: warning."));

  const general = INDUSTRY_BY_ID[SHEET_INDUSTRY_ID];
  const table = section("thresholds").table;
  assert.equal(table.rows.length, RATIOS.length);
  assert.equal(table.rows[0].label, "Gross margin");
  assert.deepEqual(table.rows[0].cells, general.thresholds.grossMargin.map((x) => `${x}%`));
  assert.match(section("thresholds").note, /^Rule-of-thumb thresholds\./);
});

test("the cheat sheet text download has every section, in both languages", () => {
  const text = cheatSheetText();
  assert.ok(text.startsWith("Profitability Lens · Formula cheat sheet\n"));
  for (const s of cheatSheet().sections) assert.ok(text.includes(s.title.toUpperCase()), s.id);
  for (const r of RATIOS) assert.ok(text.includes(`${r.label}: ${r.formula}  (weight ${r.weight})`), r.id);
  assert.ok(text.endsWith("not official statistics.\n"));
  assert.ok(!/\{\w+\}/.test(text), "no unfilled placeholders");

  useLanguage("hr");
  const hr = cheatSheetText();
  const nb = " ";
  assert.ok(hr.startsWith("Profitability Lens · Podsjetnik s formulama\n"));
  assert.ok(hr.includes("Pokriće kamata ispod 1,5×: ozbiljno."));
  assert.ok(hr.includes(`Amortizacija veća od 50${nb}% EBITDA-e: upozorenje.`));
  assert.ok(hr.includes(`Bruto marža | 15${nb}% | 25${nb}% | 35${nb}% | 50${nb}%`));
  assert.ok(!/\{\w+\}/.test(hr), "no unfilled placeholders");
});
