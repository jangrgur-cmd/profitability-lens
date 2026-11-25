// Tests for src/shared/paste.js and src/rating/paste.js: tables pasted from
// Excel or CSV, and statement lines matched to the rating's fields.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGrid, normalizeLabel, detectDelimiter } from "../src/shared/paste.js";
import { matchLabel, readStatementPaste, pasteToYears } from "../src/rating/paste.js";
import { rate } from "../src/rating/rating.js";
import { HAND_CASE } from "./fixtures.mjs";

const TAB = "\t";
const rowsOf = (lines) => lines.map((cells) => cells.join(TAB)).join("\n");

test("parseGrid splits on tabs, then semicolons, then commas, and honours quotes", () => {
  assert.deepEqual(parseGrid("a\t1\t2\r\n\r\nb\t3"), [["a", "1", "2"], ["b", "3"]]);
  assert.deepEqual(parseGrid('"Prihodi; ukupno";"1.234,56"\nx;2'), [["Prihodi; ukupno", "1.234,56"], ["x", "2"]]);
  assert.deepEqual(parseGrid('Revenue,"1,234"'), [["Revenue", "1,234"]]);
  assert.deepEqual(parseGrid("Revenue 1.234.567\nTotal assets (12.500)"), [["Revenue", "1.234.567"], ["Total assets", "(12.500)"]]);
  assert.equal(detectDelimiter(["a b"]), null);
});

test("normalizeLabel drops case, diacritics, numbering and punctuation", () => {
  assert.equal(normalizeLabel("IV. NOVAC U BANCI I BLAGAJNI"), "novac u banci i blagajni");
  assert.equal(normalizeLabel("D) KRATKOROČNE OBVEZE"), "kratkorocne obveze");
  assert.equal(normalizeLabel("4. Obveze prema bankama"), "obveze prema bankama");
  assert.equal(normalizeLabel("Shareholders' equity"), "shareholders equity");
  assert.equal(normalizeLabel("Depreciation & amortisation"), "depreciation and amortisation");
  assert.equal(normalizeLabel("Vrijednosna usklađenja"), "vrijednosna uskladenja");
});

test("matchLabel: English and Croatian labels, specific before broad, no false friends", () => {
  const field = (label) => matchLabel(label)?.fieldId ?? null;
  assert.equal(field("Revenue"), "revenue");
  assert.equal(field("2. Prihodi od prodaje (izvan grupe)"), "revenue");
  assert.equal(matchLabel("I. POSLOVNI PRIHODI").tier, 1, "operating revenue is a broader tier than sales");
  assert.equal(field("Cost of sales"), "cogs");
  assert.equal(field("Troškovi osoblja"), "opex");
  assert.equal(field("Amortizacija"), "da");
  assert.equal(field("Rashodi s osnove kamata i slični rashodi"), "interest");
  assert.equal(field("XII. POREZ NA DOBIT"), "tax");
  assert.equal(field("UKUPNO AKTIVA"), "assets");
  assert.equal(field("A) KAPITAL I REZERVE"), "equity");
  assert.equal(field("Novac i novčani ekvivalenti"), "cash");
  assert.equal(field("Prihodi od kamata"), null, "interest income is not revenue");
  assert.equal(field("Kapitalni dobitak"), null);
  assert.equal(field("Dugoročne obveze"), null, "long-term liabilities are not all debt");
});

/** A GFI-POD style paste: label, AOP code, prior year, current year. Costs by nature. */
const GFI = rowsOf([
  ["Naziv pozicije", "AOP", "Prethodna godina", "Tekuća godina"],
  ["RAČUN DOBITI I GUBITKA"],
  ["I. POSLOVNI PRIHODI", "125", "1.300.000", "1.390.000"],
  ["1. Prihodi od prodaje s poduzetnicima unutar grupe", "126", "100.000", "120.000"],
  ["2. Prihodi od prodaje (izvan grupe)", "127", "1.150.000", "1.230.000"],
  ["II. POSLOVNI RASHODI", "131", "1.200.000", "1.250.000"],
  ["2. Materijalni troškovi", "133", "600.000", "620.000"],
  ["3. Troškovi osoblja", "137", "350.000", "360.000"],
  ["4. Amortizacija", "141", "80.000", "90.000"],
  ["5. Ostali troškovi", "142", "60.000", "65.000"],
  ["III. FINANCIJSKI PRIHODI", "154", "5.000", "4.000"],
  ["IV. FINANCIJSKI RASHODI", "165", "30.000", "28.000"],
  ["1. Rashodi s osnove kamata i slični rashodi", "168", "25.000", "24.000"],
  ["XII. POREZ NA DOBIT", "179", "20.000", "25.000"],
  ["UKUPNO AKTIVA", "063", "2.000.000", "2.200.000"],
  ["A) KAPITAL I REZERVE", "067", "900.000", "1.000.000"],
  ["D) KRATKOROČNE OBVEZE", "109", "400.000", "420.000"],
  ["4. Obveze prema bankama i drugim financijskim institucijama", "098", "300.000", "280.000"],
  ["4. Obveze prema bankama i drugim financijskim institucijama", "113", "50.000", "60.000"],
  ["IV. NOVAC U BANCI I BLAGAJNI", "062", "120.000", "150.000"],
]);

test("a GFI-POD paste: AOP column ignored, columns ordered by their headers, lines added up per field", () => {
  const read = readStatementPaste(GFI);
  assert.equal(read.columns.length, 2);
  assert.deepEqual(read.columns.map((c) => c.relative), [-1, 0]);
  assert.equal(read.newestFirst, false);
  assert.equal(read.latestYear, null);
  const status = Object.fromEntries(read.rows.map((r) => [r.label, r.status]));
  assert.equal(status["I. POSLOVNI PRIHODI"], "also", "sales lines win over operating revenue");
  assert.equal(status["IV. FINANCIJSKI RASHODI"], "also", "interest lines win over financial expenses");
  assert.equal(status["II. POSLOVNI RASHODI"], "unknown", "the total would double count the lines below it");

  const [current, prior] = pasteToYears(read.rows, 2, { newestFirst: false, latestYear: 2025 });
  assert.equal(current.year, 2025);
  assert.equal(prior.year, 2024);
  assert.deepEqual(
    [current.values.revenue, current.values.opex, current.values.da, current.values.otherIncome, current.values.interest,
      current.values.tax, current.values.assets, current.values.equity, current.values.currentLiabilities, current.values.debt, current.values.cash],
    [1_350_000, 1_045_000, 90_000, 4_000, 24_000, 25_000, 2_200_000, 1_000_000, 420_000, 340_000, 150_000]);
  assert.equal(current.values.cogs, null, "costs by nature: no COGS");
  assert.equal(prior.values.revenue, 1_250_000);
  assert.equal(prior.values.priorAssets, null);
});

test("an English paste with year headers, newest first, rates like the hand case", () => {
  const text = rowsOf([
    ["", "2025", "2024"],
    ["Revenue", "1,000", "900"], ["Cost of goods sold", "(600)", "540"], ["Operating expenses", "200", "190"],
    ["Depreciation and amortisation", "50", "45"], ["Interest expense", "30", "30"], ["Income tax", "24", "18"],
    ["Total assets", "1,200", "800"], ["Total equity", "500", "300"], ["Current liabilities", "200", "150"],
    ["Interest-bearing debt", "400", "350"], ["Cash and cash equivalents", "100", "50"],
  ]);
  const read = readStatementPaste(text);
  assert.equal(read.newestFirst, true);
  assert.equal(read.latestYear, 2025);
  assert.ok(read.rows.every((r) => r.status === "matched"));
  const years = pasteToYears(read.rows, read.columns.length, read);
  assert.equal(years[0].values.cogs, 600, "a bracketed cost is still a cost");
  const values = { ...years[0].values, priorAssets: 800, priorEquity: 300 };
  assert.equal(rate(values, "general").score, rate(HAND_CASE, "general").score);
});

test("without headers there is no order; a lone amount column is one year; extra columns are counted", () => {
  const one = readStatementPaste("Revenue\t1000\nTotal assets\t1200\nTotal equity\t500");
  assert.equal(one.columns.length, 1);
  assert.equal(one.newestFirst, null);
  const six = readStatementPaste(rowsOf([["Revenue", "1000", "2000", "3000", "4000", "5000", "6000", "7000"]]));
  assert.equal(six.columns.length, 5);
  assert.equal(six.extraColumns, 2);
  assert.deepEqual(readStatementPaste("").rows, []);
  const codes = readStatementPaste(rowsOf([["Revenue", "001", "1.000"], ["Total assets", "063", "2.000"], ["Total equity", "067", "900"]]));
  assert.deepEqual(codes.columns.map((c) => c.index), [2], "a column of three-digit codes before the amounts is left out");
});

test("other operating income is matched in English and Croatian, apart from sales", () => {
  assert.deepEqual(matchLabel("Ostali poslovni prihodi"), { fieldId: "otherOpIncome", tier: 0 });
  assert.deepEqual(matchLabel("Ostali poslovni prihodi izvan grupe"), { fieldId: "otherOpIncome", tier: 0 });
  assert.deepEqual(matchLabel("Prihodi na temelju upotrebe vlastitih proizvoda, robe i usluga"), { fieldId: "otherOpIncome", tier: 0 });
  assert.deepEqual(matchLabel("Other operating income"), { fieldId: "otherOpIncome", tier: 0 });
  assert.deepEqual(matchLabel("Other income"), { fieldId: "otherOpIncome", tier: 1 });
  assert.equal(matchLabel("Other financial income").fieldId, "otherIncome");

  // A GFI-POD style statement: the total "Poslovni prihodi" is not counted on top of its parts.
  const read = readStatementPaste(rowsOf([
    ["", "2025"],
    ["Poslovni prihodi", "1.050.000"],
    ["Prihodi od prodaje", "1.000.000"],
    ["Ostali poslovni prihodi", "50.000"],
    ["Ukupna aktiva", "1.200.000"],
    ["Kapital i rezerve", "500.000"],
  ]));
  const [year] = pasteToYears(read.rows, read.columns.length, { newestFirst: true, latestYear: 2025 });
  assert.equal(year.values.revenue, 1_000_000);
  assert.equal(year.values.otherOpIncome, 50_000);
});
