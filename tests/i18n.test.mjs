// Tests for src/shared/i18n.js and the language files: both languages have the
// same texts, every key the code uses exists, Croatian formatting follows
// Croatian conventions, and the whole rating and messaging engine runs in Croatian.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { t, useLanguage, getLang, hasText, DICTIONARIES_FOR_TESTS } from "../src/shared/i18n.js";
import {
  MINUS, formatEur, formatEurFull, formatPct, formatPp, formatInteger, formatMultiple, formatPerMessage,
  formatCount, formatAmountInput, formatPercentValue, formatPerEuro, formatNumber,
} from "../src/shared/format.js";
import { parseAmount } from "../src/shared/parse.js";
import { rate } from "../src/rating/rating.js";
import { explainRatio, dupontSentences, textSummary, ratioStatusText } from "../src/rating/report.js";
import { parseForm, importJson, FIELDS } from "../src/rating/fields.js";
import { SAMPLES } from "../src/rating/samples.js";
import { HAND_CASE } from "./fixtures.mjs";

const { en, hr } = DICTIONARIES_FOR_TESTS;
const ROOT = new URL("..", import.meta.url);

afterEach(() => useLanguage("en"));

const isPlural = (node) => typeof node === "object" && node !== null && !Array.isArray(node) && "other" in node;

/** Flattens a dictionary to key → text (plural objects stay as one entry). */
function flatten(node, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string" || isPlural(v) || Array.isArray(v)) out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}

/** Placeholder names in a text or in every form of a plural text. */
function placeholders(entry) {
  const texts = typeof entry === "string" ? [entry] : Object.values(entry);
  return [...new Set(texts.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
}

const flatEn = flatten(en);
const flatHr = flatten(hr);
// The "data" section exists only in Croatian: English names come from the data files.
const hrUiKeys = Object.keys(flatHr).filter((k) => !k.startsWith("data."));

test("English is the default language in Node", () => {
  assert.equal(getLang(), "en");
});

test("both language files have exactly the same keys (except Croatian data names)", () => {
  const onlyEn = Object.keys(flatEn).filter((k) => !(k in flatHr));
  const onlyHr = hrUiKeys.filter((k) => !(k in flatEn));
  assert.deepEqual(onlyEn, [], "keys missing in hr.js");
  assert.deepEqual(onlyHr, [], "keys missing in en.js");
});

test("every text has the same placeholders in both languages", () => {
  for (const key of Object.keys(flatEn)) {
    if (Array.isArray(flatEn[key])) continue;
    assert.deepEqual(placeholders(flatHr[key]), placeholders(flatEn[key]), key);
  }
});

test("plural texts: English has one/other, Croatian one/few/other, all using {count}", () => {
  for (const [key, entry] of Object.entries(flatEn)) {
    if (!isPlural(entry)) continue;
    assert.deepEqual(Object.keys(entry).sort(), ["one", "other"], `en ${key}`);
    assert.ok(isPlural(flatHr[key]), `hr ${key} must be plural too`);
    assert.deepEqual(Object.keys(flatHr[key]).sort(), ["few", "one", "other"], `hr ${key}`);
  }
  useLanguage("hr");
  const forms = [1, 2, 5, 21, 22, 25].map((count) => t("rating.page.attention", { count }));
  assert.deepEqual(forms, [
    "1 podatak treba provjeriti", "2 podatka treba provjeriti", "5 podataka treba provjeriti",
    "21 podatak treba provjeriti", "22 podatka treba provjeriti", "25 podataka treba provjeriti",
  ]);
  useLanguage("en");
  assert.equal(t("rating.page.attention", { count: 1 }), "One figure needs attention");
  assert.equal(t("rating.page.attention", { count: 3 }), "3 figures need attention");
});

test("unknown keys throw, so a missing text is caught by the tests and never shown as a key", () => {
  assert.throws(() => t("rating.nope"), /Missing text "rating.nope" in language "en"/);
  assert.throws(() => useLanguage("de"), /Unknown language/);
  assert.equal(hasText("rating.coverage"), true);
  assert.equal(hasText("data.country.HR"), false, "English has no data names");
  useLanguage("hr");
  assert.equal(hasText("data.country.HR"), true);
});

/** All files under a folder with one of the given extensions. */
function filesIn(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesIn(path, exts));
    else if (exts.includes(extname(name))) out.push(path);
  }
  return out;
}

test("every literal key used in the code and the pages exists in both languages", () => {
  const sources = [
    ...filesIn(fileURLToPath(new URL("src", ROOT)), [".js"]),
    ...filesIn(fileURLToPath(new URL("modules/messaging/js", ROOT)), [".js"]),
    fileURLToPath(new URL("index.html", ROOT)),
    fileURLToPath(new URL("segments.html", ROOT)),
    fileURLToPath(new URL("learn.html", ROOT)),
    fileURLToPath(new URL("cheatsheet.html", ROOT)),
    fileURLToPath(new URL("modules/messaging/index.html", ROOT)),
  ];
  const used = new Set();
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\bt\(\s*"([\w.]+)"/g)) used.add(m[1]);
    for (const m of text.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)) used.add(m[1]);
    for (const m of text.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of m[1].split(";")) used.add(pair.split(":")[1].trim());
    }
  }
  assert.ok(used.size > 200, `found only ${used.size} keys; is the scan broken?`);
  const missing = [...used].filter((k) => !(k in flatEn) || !(k in flatHr));
  assert.deepEqual(missing, []);
});

test("English number formats are unchanged", () => {
  assert.equal(formatEur(1234567), "€1.2M");
  assert.equal(formatEurFull(-1500), `${MINUS}€1,500`);
  assert.equal(formatPct(0.2214), "22.1%");
  assert.equal(formatPp(0.012), "+1.2 pp");
  assert.equal(formatInteger(1234567), "1,234,567");
  assert.equal(formatAmountInput(2400000), "2,400,000");
  assert.equal(formatAmountInput(1234.5), "1,234.5");
  assert.equal(formatPercentValue(2.5), "2.5%");
  assert.equal(formatPerEuro(0.096), "€0.10");
  assert.equal(formatNumber(1.13, 3), "1.130");
  assert.equal(formatPct(null), "n/a");
});

test("Croatian number formats: 1.234,56 and 22,1 %", () => {
  useLanguage("hr");
  const nb = " ";
  assert.equal(formatEur(1234567), `1,2${nb}mil.${nb}€`);
  assert.equal(formatEur(-45300), `${MINUS}45,3${nb}tis.${nb}€`);
  assert.equal(formatEur(512), `512${nb}€`);
  assert.equal(formatEurFull(2400000), `2.400.000${nb}€`);
  assert.equal(formatEurFull(-1500), `${MINUS}1.500${nb}€`);
  assert.equal(formatPct(0.2214), `22,1${nb}%`);
  assert.equal(formatPct(-0.4188, 2), `${MINUS}41,88${nb}%`);
  assert.equal(formatPp(0.012), `+1,2${nb}p.${nb}b.`);
  assert.equal(formatInteger(1234567), "1.234.567");
  assert.equal(formatCount(821584062), `821,6${nb}mil.`);
  assert.equal(formatMultiple(2.5), "2,50×");
  assert.equal(formatPerMessage(0.012345), `0,0123${nb}€/poruka`);
  assert.equal(formatPercentValue(2.5), `2,5${nb}%`);
  assert.equal(formatPerEuro(0.096), `0,10${nb}€`);
  assert.equal(formatNumber(1.13, 3), "1,130");
  assert.equal(formatAmountInput(2400000), "2.400.000");
  assert.equal(formatAmountInput(1234.5), "1.234,5");
  assert.equal(formatAmountInput(-5000), "-5.000");
  assert.equal(formatPct(null), "n/d");
});

test("amounts written into the form read back as the same number in both languages", () => {
  for (const lang of ["en", "hr"]) {
    useLanguage(lang);
    for (const value of [0, 12.5, 999, 1000, 1234.56, 2400000, -5000, 1234567.89, 0.5]) {
      assert.equal(parseAmount(formatAmountInput(value)).value, value, `${lang} ${value} → "${formatAmountInput(value)}"`);
    }
  }
});

test("the rating, its explanations and the text summary run in Croatian", () => {
  useLanguage("hr");
  const r = rate(HAND_CASE, "general");
  assert.equal(r.grade.label, "Izvrsna");
  assert.equal(r.coverage.label, "8 od 8 pokazatelja");
  assert.match(r.summary, /^Izvrsna profitabilnost: ocjena A \(96\/100\) prema okvirnim pragovima za djelatnost Općenito; najjača je /);
  assert.equal(r.ratios[0].label, "Bruto marža");
  assert.equal(r.ratios[0].band.label, "Dobro");
  assert.deepEqual(explainRatio(r.ratios[0], r.statement, HAND_CASE), {
    formula: "Bruto dobit ÷ Prihodi od prodaje",
    substituted: "= 400 € ÷ 1.000 €",
    result: "= 40,0 %",
    where: ["Bruto dobit = Prihodi od prodaje − Trošak prodanih proizvoda i robe = 1.000 € − 600 € = 400 €"],
  });
  assert.equal(dupontSentences(r.dupont).at(-1),
    "Ukupno: 9,6 % × 1,00 × 2,50 = 24,0 %, dakle svaki 1 € kapitala zaradi 0,24 € dobiti godišnje (ROE).");

  for (const sample of SAMPLES) {
    const rated = rate(sample.values, sample.industryId);
    const text = textSummary(rated, { companyName: sample.name });
    assert.ok(text.startsWith("Profitability Lens: ocjena tvrtke\n"), sample.id);
    for (const ratio of rated.ratios) {
      explainRatio(ratio, rated.statement, sample.values);
      ratioStatusText(ratio);
    }
    dupontSentences(rated.dupont);
    for (const flag of rated.flags) assert.ok(flag.title && flag.detail && !/\{\w+\}/.test(flag.detail), `${sample.id} ${flag.id}`);
  }
  const hotel = rate(SAMPLES.find((s) => s.id === "hotel").values, "tourism");
  assert.equal(ratioStatusText(hotel.ratios[0]), "Nedostaje podatak: Trošak prodanih proizvoda i robe");
});

test("validation and import messages are translated", () => {
  useLanguage("hr");
  const { errors } = parseForm({ revenue: "abc", assets: "-5" });
  assert.equal(errors.revenue, "Prihodi od prodaje: Nije broj. Upišite znamenke, npr. 1.234.567,89 ili 1,234,567.89.");
  assert.equal(errors.assets, "Polje „Ukupna aktiva” mora biti veće od nule.");
  assert.equal(errors.equity, "Polje „Kapital i rezerve” je obavezno.");
  assert.throws(() => importJson("{"), /Ova datoteka nije valjani JSON\./);
  assert.ok(FIELDS.every((f) => f.altTerm && f.label !== f.altTerm));
});

test("the messaging model's names, checks and scenario steps run in Croatian", async () => {
  const { buildModel } = await import("../modules/messaging/js/data.js");
  const { runDataChecks } = await import("../modules/messaging/js/checks.js");
  const { STEPS, PRESETS } = await import("../modules/messaging/js/scenarios.js");
  const assumptions = JSON.parse(readFileSync(new URL("modules/messaging/data/assumptions.json", ROOT), "utf8"));
  const traffic = JSON.parse(readFileSync(new URL("modules/messaging/data/traffic.json", ROOT), "utf8"));

  const enModel = buildModel(assumptions, traffic);
  assert.equal(enModel.countryNames.HR, "Croatia");
  assert.equal(enModel.customerNames.C10, "German parcel carrier");

  useLanguage("hr");
  const model = buildModel(assumptions, traffic);
  assert.equal(model.countryNames.HR, "Hrvatska");
  assert.equal(model.monthLabels[0], "Sij");
  assert.equal(model.customerNames.C10, "Njemački dostavljač paketa");
  assert.equal(model.industryName("Banking"), "Bankarstvo");
  assert.equal(model.channelName("SMS"), "SMS", "untranslated names fall back to the data");
  for (const c of assumptions.customers) assert.notEqual(model.customerNames[c.id], c.name, `${c.id} needs a Croatian name`);

  const checks = runDataChecks(model, model.rows);
  assert.ok(checks.every((c) => c.pass));
  assert.equal(checks[0].label, "Ukupni prihodi jednaki su zbroju po državama");
  assert.match(checks[0].detail, /zbroj za 5 država:/);
  assert.equal(STEPS[3].label, "Trošak operatera");
  assert.equal(PRESETS[2].label, "Jak dolar");
});

test("messaging sentences: whole phrases per category and English country names with 'the'", async () => {
  const { inCountry } = await import("../modules/messaging/js/labels.js");
  const assumptions = JSON.parse(readFileSync(new URL("modules/messaging/data/assumptions.json", ROOT), "utf8"));
  assert.equal(inCountry("GB", "United Kingdom"), "in the United Kingdom");
  assert.equal(inCountry("DE", "Germany"), "in Germany");
  assert.equal(t("seg.overview.trafficOfCategory.authentication"), "authentication (OTP) traffic");
  for (const lang of ["en", "hr"]) {
    useLanguage(lang);
    for (const c of assumptions.dimensions.categories) assert.ok(hasText(`seg.overview.trafficOfCategory.${c.id}`), `${lang} ${c.id}`);
  }
  assert.equal(inCountry("GB", "Ujedinjeno Kraljevstvo"), "u Ujedinjenom Kraljevstvu");
  assert.equal(t("seg.overview.trafficOfCategory.marketing"), "marketinški promet");
});

test("plural texts choose their form from {count}, so other numbers come after a colon", () => {
  assert.equal(t("rating.paste.summary", { count: 5, matched: 5, columns: 1 }), "5 lines with amounts, 5 matched to fields; columns of years: 1.");
  assert.equal(t("segments.paste.summary", { count: 2, skipped: 1 }), "2 segments read; lines skipped: 1.");
});
