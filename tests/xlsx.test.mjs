// Tests for src/shared/zip.js, src/shared/xlsx.js and the two Excel
// templates: a file opened on the page must read exactly like the same
// table pasted from Excel.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crc32, readZip, writeZip } from "../src/shared/zip.js";
import { readWorkbook, writeWorkbook, pickSheet, gridToText, numberText } from "../src/shared/xlsx.js";
import { readStatementPaste, pasteToYears } from "../src/rating/paste.js";
import { rateYears } from "../src/rating/years.js";
import { YEAR_FIELD_IDS } from "../src/rating/years.js";
import { SAMPLES } from "../src/rating/samples.js";
import { ratingTemplate, TEMPLATE_YEARS } from "../src/rating/template.js";
import { segmentTemplate } from "../src/segments/template.js";
import { readSegmentPaste, COLUMNS } from "../src/segments/segments.js";
import { SEGMENT_SAMPLES } from "../src/segments/samples.js";
import { useLanguage } from "../src/shared/i18n.js";
import { HAND_CASE } from "./fixtures.mjs";

afterEach(() => useLanguage("en"));

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, `${msg}: ${a} vs ${b}`);

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("a written ZIP reads back entry for entry", async () => {
  const zip = writeZip([["a.txt", "hello"], ["dir/b.xml", "<x>Ž</x>"]]);
  const entries = await readZip(zip);
  assert.deepEqual([...entries.keys()], ["a.txt", "dir/b.xml"]);
  assert.equal(new TextDecoder().decode(entries.get("dir/b.xml")), "<x>Ž</x>");
  await assert.rejects(readZip(new Uint8Array(100)), /Not a ZIP/);
});

test("numbers become text the paste parser cannot misread", () => {
  assert.equal(numberText("2780000"), "2780000");
  assert.equal(numberText("-12500"), "-12500");
  assert.equal(numberText("0.5"), "0.5");
  assert.equal(numberText("1234.567"), "1234.5670", "three decimals would read as thousands");
  assert.equal(numberText("24.000000000000004"), "24", "floating-point noise from a formula");
});

test("a workbook saved by Excel reads like the same lines pasted (hand case)", async () => {
  // tests/fixtures/excel-saved.xlsx was saved by Microsoft Excel: shared strings, compressed
  // entries, a formula (income tax) with its saved value, a blank row, and the data on the
  // first of two sheets with Croatian names.
  const sheets = await readWorkbook(new Uint8Array(readFileSync(new URL("./fixtures/excel-saved.xlsx", import.meta.url))));
  assert.deepEqual(sheets.map((s) => s.name), ["Račun & bilanca", "Bilješke"]);
  const sheet = pickSheet(sheets);
  assert.equal(sheet.name, "Račun & bilanca");
  assert.deepEqual(sheet.rows[6], ["Income tax", "24", "14"]);
  assert.deepEqual(sheet.rows.at(-1), ["Napomena: iznosi < 0 & > 0"]);

  const read = readStatementPaste(gridToText(sheet.rows));
  const years = pasteToYears(read.rows, read.columns.length, { newestFirst: read.newestFirst, latestYear: read.latestYear });
  assert.equal(years[0].year, 2025);
  const ratios = Object.fromEntries(rateYears(years, "general").years[0].rating.ratios.map((r) => [r.id, r.value]));
  // CLAUDE.md §4.5: the 2024 column supplies the prior-year assets (800) and equity (300).
  near(ratios.grossMargin, 0.4, "gross");
  near(ratios.netMargin, 0.096, "net");
  near(ratios.roa, 0.096, "ROA");
  near(ratios.roe, 0.24, "ROE");
  near(ratios.roce, 0.15, "ROCE");
  near(ratios.roic, 0.15, "ROIC");
  assert.deepEqual({ ...years[0].values, priorAssets: 800, priorEquity: 300 }, { ...HAND_CASE, otherOpIncome: null, otherIncome: null, opex: 200 });
});

test("a written workbook reads back cell for cell", async () => {
  const bytes = writeWorkbook([
    { name: "Šifre & <test>", rows: [["Label", "2025"], ["Ž & <x>", 1234.567], [null, -5]] },
    { name: "Second", rows: [] },
  ]);
  const sheets = await readWorkbook(bytes);
  assert.deepEqual(sheets[0], { name: "Šifre & <test>", rows: [["Label", "2025"], ["Ž & <x>", "1234.5670"], ["", "-5"]] });
  assert.deepEqual(sheets[1].rows, []);
});

for (const lang of ["en", "hr"]) {
  test(`rating template (${lang}): every line is recognised, and the example rates like the sample`, async () => {
    useLanguage(lang);
    const sheets = await readWorkbook(writeWorkbook(ratingTemplate({ latestYear: 2025 })));
    assert.equal(sheets.length, 3);
    const blank = readStatementPaste(gridToText(sheets[0].rows));
    assert.deepEqual(blank.rows, [], "a blank template has no amounts");
    assert.equal(sheets[0].rows[0].length, 1 + TEMPLATE_YEARS);

    // Each label must land on its own field, in either language.
    const filled = sheets[0].rows.map((row, i) => (i === 0 ? row : [row[0], String(i * 1000)]));
    const read = readStatementPaste(gridToText(filled));
    assert.deepEqual(read.rows.map((r) => r.fieldId), YEAR_FIELD_IDS, read.rows.map((r) => `${r.label}→${r.fieldId}`).join(", "));

    assert.equal(pickSheet(sheets).name, sheets[1].name, "an untouched template opens its example");
    const example = readStatementPaste(gridToText(sheets[1].rows));
    const [year] = pasteToYears(example.rows, example.columns.length, { newestFirst: true, latestYear: 2025 });
    const sample = SAMPLES[0];
    for (const id of YEAR_FIELD_IDS) assert.equal(year.values[id], sample.values[id] ?? null, id);
  });

  test(`segment template (${lang}): the header is recognised and the example reads back`, async () => {
    useLanguage(lang);
    for (const kind of ["customer", "product", "channel", "region", "segment"]) {
      const [table] = await readWorkbook(writeWorkbook(segmentTemplate({ kind })));
      const withRow = [...table.rows, ["X", "100", "60", "10"]];
      const read = readSegmentPaste(gridToText(withRow));
      assert.equal(read.header, true, kind);
      assert.deepEqual(read.segments, [{ name: "X", revenue: 100, variableCosts: 60, fixedCosts: 10 }], kind);
    }
    const sheets = await readWorkbook(writeWorkbook(segmentTemplate({ kind: "product" })));
    const read = readSegmentPaste(gridToText(sheets[1].rows));
    assert.deepEqual(read.segments, SEGMENT_SAMPLES[0].segments);
    assert.equal(COLUMNS.length, sheets[1].rows[0].length);
  });
}
