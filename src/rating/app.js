// app.js: the Company rating page. UI only: every number and sentence comes
// from the pure modules (fields, rating, report, shared/*) and every other
// text from the language files (t() keys under rating.page); this file builds
// the form, calls rate() and places the results.

import { FIELDS, GROUPS, parseForm, exportJson, importJson } from "./fields.js";
import { rate, GRADES } from "./rating.js";
import { RATIOS } from "./ratios.js";
import { INDUSTRIES, DEFAULT_INDUSTRY_ID, INDUSTRY_BY_ID, BENCHMARK_SOURCE } from "./benchmarks.js";
import { SAMPLES } from "./samples.js";
import { KEY_FIGURES, keyFigureText, explainRatio, dupontSentences, ratioStatusText, textSummary } from "./report.js";
import { formatPct, formatMultiple, formatAmountInput, formatPercentValue } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { trackGeometry } from "../shared/track.js";
import { decodeHandoff, HANDOFF_SOURCES } from "../shared/handoff.js";
import { h, replaceChildren } from "../shared/dom.js";
import { bandPill, pill, severityPill, GRADE_TONES } from "../shared/status.js";
import { readJson, writeJson } from "../shared/prefs.js";
import { mountSiteHeader } from "../shared/site-header.js";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "rating/form";
const STORAGE_VERSION = 1;

/** What the page knows besides the form: the last rating and where the figures came from. */
const app = {
  /** @type {object|null} result of rate() */
  rating: null,
  /** @type {Record<string, number|null>|null} the values that were rated */
  ratedValues: null,
  /** Serialised form at the time of the last rating, to notice later edits. */
  ratedSnapshot: null,
  /** Company name at the time of the last rating. */
  ratedName: "",
  /** @type {string|null} id in HANDOFF_SOURCES when the figures came from another module */
  source: null,
};

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

const inputId = (fieldId) => `f-${fieldId}`;

function buildForm() {
  const groups = GROUPS.map((group) => h("fieldset", { class: "field-group" },
    h("legend", {}, group.label),
    FIELDS.filter((f) => f.group === group.id).map(buildField)));
  replaceChildren($("field-groups"), groups);

  const select = $("industry");
  replaceChildren(select, INDUSTRIES.map((i) => h("option", { value: i.id }, i.label)));
  select.addEventListener("change", () => { showIndustryNote(); onFormEdited(); });

  replaceChildren($("example-chips"), SAMPLES.map((s) => h("button", {
    type: "button", class: "chip", title: s.description,
    on: { click: () => loadSample(s) },
  }, s.name, h("span", { class: "chip__tag" }, t("common.fictional")))));

  const form = $("rating-form");
  form.addEventListener("submit", (event) => { event.preventDefault(); submit(); });
  form.addEventListener("input", onFormEdited);
  $("clear-form").addEventListener("click", clearForm);
  $("export-json").addEventListener("click", exportForm);
  $("import-json").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", importFile);
}

function buildField(field) {
  const id = inputId(field.id);
  return h("div", { class: "field", dataset: { field: field.id } },
    h("label", { for: id },
      field.label,
      field.required ? [h("abbr", { class: "req", title: t("rating.page.required"), "aria-hidden": "true" }, "*"), h("span", { class: "sr-only" }, t("rating.page.requiredSr"))] : null),
    h("span", { class: "field__hr", lang: t("rating.altLang") }, field.altTerm),
    h("input", {
      id, name: field.id, type: "text", inputmode: field.sign === "any" ? "text" : "decimal",
      autocomplete: "off", spellcheck: "false", "aria-describedby": `h-${field.id} amount-hint`,
      required: field.required,
    }),
    h("p", { class: "field__help", id: `h-${field.id}` }, field.help),
    h("p", { class: "field__error", id: `e-${field.id}`, hidden: true }));
}

function showIndustryNote() {
  const industry = INDUSTRY_BY_ID[$("industry").value];
  $("industry-note").textContent = t("rating.page.industryNote", { note: industry.note, source: BENCHMARK_SOURCE.label });
}

/** The form's raw text, by field id. */
function readRaw() {
  return Object.fromEntries(FIELDS.map((f) => [f.id, $(inputId(f.id)).value]));
}

function fillForm({ raw, industryId, companyName }) {
  for (const f of FIELDS) $(inputId(f.id)).value = raw[f.id] ?? "";
  $("industry").value = INDUSTRY_BY_ID[industryId] ? industryId : DEFAULT_INDUSTRY_ID;
  $("company-name").value = companyName ?? "";
  showIndustryNote();
  showErrors({});
}

const snapshot = () => JSON.stringify({ raw: readRaw(), industryId: $("industry").value });

function saveForm() {
  writeJson(STORAGE_KEY, {
    version: STORAGE_VERSION,
    raw: readRaw(),
    industryId: $("industry").value,
    companyName: $("company-name").value,
    source: app.source,
  });
}

function onFormEdited() {
  saveForm();
  $("stale-note").hidden = !app.rating || snapshot() === app.ratedSnapshot;
}

/** Shows field errors next to the fields and as a linked list at the top. */
function showErrors(errors) {
  for (const f of FIELDS) {
    const input = $(inputId(f.id));
    const box = $(`e-${f.id}`);
    const message = errors[f.id];
    box.hidden = !message;
    box.textContent = message ?? "";
    input.toggleAttribute("aria-invalid", Boolean(message));
    input.setAttribute("aria-describedby", message ? `e-${f.id} h-${f.id}` : `h-${f.id} amount-hint`);
  }
  const summary = $("error-summary");
  const ids = FIELDS.map((f) => f.id).filter((id) => errors[id]);
  summary.hidden = ids.length === 0;
  replaceChildren(summary, ids.length === 0 ? [] : [
    h("p", { class: "error-summary__title" }, t("rating.page.attention", { count: ids.length })),
    h("ul", {}, ids.map((id) => h("li", {}, h("a", {
      href: `#${inputId(id)}`,
      on: { click: (event) => { event.preventDefault(); $(inputId(id)).focus(); } },
    }, errors[id])))),
  ]);
  return ids;
}

function showSourceNote() {
  const note = $("source-note");
  const source = HANDOFF_SOURCES[app.source];
  note.hidden = !source;
  if (!source) return;
  replaceChildren(note,
    h("strong", {}, t("rating.page.sourceStrong")),
    t("rating.page.sourceBody", { source: source.label }),
    h("a", { href: source.backLink.replace(/#.*/, "") }, t("rating.page.sourceBack")));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function announce(text) {
  const el = $("announcer");
  el.textContent = "";
  // A fresh text node after a tick so screen readers announce repeated messages.
  setTimeout(() => { el.textContent = text; }, 50);
}

function submit() {
  const { values, errors } = parseForm(readRaw());
  const invalid = showErrors(errors);
  if (invalid.length > 0) {
    $("error-summary").focus();
    announce(t("rating.page.announceInvalid"));
    return;
  }
  runRating(values);
  saveForm();
  const results = $("results");
  if (results.getBoundingClientRect().top > window.innerHeight * 0.6) results.scrollIntoView({ behavior: "smooth", block: "start" });
  results.focus({ preventScroll: true });
  announce(t("rating.page.announceRated", { letter: app.rating.grade.letter, score: app.rating.score, label: app.rating.grade.label }));
}

function runRating(values) {
  app.rating = rate(values, $("industry").value);
  app.ratedValues = values;
  app.ratedSnapshot = snapshot();
  app.ratedName = $("company-name").value.trim();
  $("stale-note").hidden = true;
  renderResults();
}

function loadSample(sample) {
  app.source = null;
  const raw = Object.fromEntries(FIELDS.map((f) => [f.id, formatAmountInput(sample.values[f.id])]));
  fillForm({ raw, industryId: sample.industryId, companyName: t("rating.samples.nameFictional", { name: sample.name }) });
  showSourceNote();
  submit();
}

function clearForm() {
  const hasFigures = Object.values(readRaw()).some((v) => v.trim() !== "");
  if (hasFigures && !window.confirm(t("rating.page.clearConfirm"))) return;
  app.source = null;
  app.rating = null;
  fillForm({ raw: {}, industryId: $("industry").value, companyName: "" });
  showSourceNote();
  saveForm();
  renderResults();
  $(inputId(FIELDS[0].id)).focus();
}

/** Lets the browser save a text file. */
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(text) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function exportForm() {
  const { values } = parseForm(readRaw());
  const companyName = $("company-name").value.trim();
  download(`company-rating${companyName ? `-${slug(companyName)}` : ""}.json`,
    exportJson(values, { industryId: $("industry").value, companyName }), "application/json");
  announce(t("rating.page.announceExported"));
}

async function importFile(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    const imported = importJson(await file.text());
    app.source = null;
    const raw = Object.fromEntries(FIELDS.map((f) => [f.id, formatAmountInput(imported.values[f.id])]));
    fillForm({ raw, industryId: imported.industryId, companyName: imported.companyName });
    showSourceNote();
    if (Object.keys(imported.errors).length === 0) submit();
    else { showErrors(imported.errors); saveForm(); $("error-summary").focus(); }
  } catch (error) {
    showErrors({});
    const summary = $("error-summary");
    summary.hidden = false;
    replaceChildren(summary, h("p", { class: "error-summary__title" }, t("rating.page.importFailed")), h("p", {}, error.message));
    summary.focus();
  }
}

async function copySummary(button) {
  const text = textSummary(app.rating, { companyName: app.ratedName });
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    // Clipboard API unavailable (e.g. an http:// address): fall back to a hidden text area.
    const area = h("textarea", { class: "sr-only", "aria-hidden": "true" });
    area.value = text;
    document.body.append(area);
    area.select();
    copied = document.execCommand("copy");
    area.remove();
  }
  const label = button.textContent;
  button.textContent = t(copied ? "rating.page.copied" : "rating.page.copyFailed");
  announce(t(copied ? "rating.page.announceCopied" : "rating.page.announceCopyFailed"));
  setTimeout(() => { button.textContent = label; }, 1800);
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function renderResults() {
  const body = $("results-body");
  if (!app.rating) {
    replaceChildren(body, h("div", { class: "card empty-state" },
      h("p", { class: "empty-state__title" }, t("rating.page.emptyTitle")),
      richText("p", "rating.page.emptyBody")));
    return;
  }
  const r = app.rating;
  replaceChildren(body,
    renderVerdict(r),
    renderKeyFigures(r),
    renderFlags(r),
    renderRatioGroup(r, "margins"),
    renderRatioGroup(r, "returns"),
    renderDupont(r),
    renderMethod(r),
    renderPrintInputs());
}

/** An element whose content is one of our own language texts with simple markup (<strong>). */
function richText(tag, key) {
  const el = h(tag);
  el.innerHTML = t(key);
  return el;
}

/** "A 80+ (Excellent), B 65+ (Strong), …, E below 35 (Poor)". */
function gradeScaleText() {
  return GRADES.map((g, i) => (g.min > 0
    ? t("rating.page.gradeFrom", { letter: g.letter, min: g.min, label: g.label })
    : t("rating.page.gradeBelow", { letter: g.letter, min: GRADES[i - 1].min, label: g.label }))).join(t("common.listSeparator"));
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** The grade ring: a circle filled to the score. */
function gradeRing(r) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const ring = svg("svg", { viewBox: "0 0 120 120", class: "grade-ring__svg", "aria-hidden": "true" });
  ring.append(
    svg("circle", { cx: 60, cy: 60, r: radius, class: "grade-ring__track" }),
    svg("circle", {
      cx: 60, cy: 60, r: radius, class: "grade-ring__value",
      "stroke-dasharray": `${(circumference * r.score) / 100} ${circumference}`,
      transform: "rotate(-90 60 60)",
    }));
  return h("div", { class: `grade-ring tone-${GRADE_TONES[r.grade.letter]}` },
    ring,
    h("div", { class: "grade-ring__label" },
      h("span", { class: "grade-ring__letter" }, r.grade.letter),
      h("span", { class: "grade-ring__score" }, `${r.score}/100`)));
}

function renderVerdict(r) {
  return h("section", { class: "card verdict", "aria-labelledby": "verdict-title" },
    gradeRing(r),
    h("div", { class: "verdict__text" },
      h("p", { class: "verdict__eyebrow" }, app.ratedName || t("rating.page.yourCompany")),
      h("h3", { id: "verdict-title", class: "verdict__title" },
        h("span", { class: "sr-only" }, t("rating.page.gradeSr", { letter: r.grade.letter, score: r.score })),
        t("rating.page.verdictTitle", { grade: r.grade.label })),
      h("p", { class: "verdict__summary" }, r.summary),
      h("p", { class: "verdict__meta" },
        t("rating.page.verdictMeta", { coverage: r.coverage.label, industry: r.industry.label }),
        h("span", { class: "rule-of-thumb", title: BENCHMARK_SOURCE.note }, BENCHMARK_SOURCE.inlineLabel)),
      h("div", { class: "verdict__actions" },
        h("button", { type: "button", class: "button", on: { click: (e) => copySummary(e.currentTarget) } }, t("rating.page.copySummary")),
        h("button", { type: "button", class: "button", on: { click: () => window.print() } }, t("rating.page.print")))));
}

function renderKeyFigures(r) {
  return h("section", { class: "block", "aria-labelledby": "kf-title" },
    h("h3", { id: "kf-title", class: "block-title" }, t("rating.keyFigures.title")),
    h("dl", { class: "tiles" }, KEY_FIGURES.map((k) => {
      const { text, note } = keyFigureText(k.id, r);
      const raw = r.keyFigures[k.id];
      const tone = k.kind === "eur" && raw !== null && raw < 0 ? "neg" : "";
      return h("div", { class: "tile" },
        h("dt", {}, k.label),
        h("dd", { class: `tile__value ${tone}` }, text),
        note ? h("dd", { class: "tile__note" }, note) : null);
    })));
}

function renderFlags(r) {
  if (r.flags.length === 0) {
    return h("section", { class: "block", "aria-labelledby": "flags-title" },
      h("h3", { id: "flags-title", class: "block-title" }, t("rating.page.flagsTitle")),
      h("p", { class: "card no-flags" }, pill("excellent", "✓", t("rating.page.noFlagsPill")), t("rating.page.noFlags")));
  }
  return h("section", { class: "block", "aria-labelledby": "flags-title" },
    h("h3", { id: "flags-title", class: "block-title" }, t("rating.page.flagsTitle"), " ",
      h("span", { class: "count" }, t("rating.page.flagsCount", { count: r.flags.length }))),
    h("ul", { class: "flags card" }, r.flags.map((f) => h("li", { class: `flag tone-${f.severity}` },
      severityPill(f.severity),
      h("div", {}, h("p", { class: "flag__title" }, f.title), h("p", { class: "flag__detail" }, f.detail))))));
}

/** "Poor below 15%, Weak 15–25%, …" for the track's accessible name. */
function scaleText(thresholds) {
  const [poor, fair, good, excellent] = thresholds.map(formatPercentValue);
  return t("rating.page.scale", { poor, fair, good, excellent });
}

function renderTrack(ratio) {
  const valuePct = ratio.status === "ok" ? ratio.value * 100 : null;
  const g = trackGeometry(valuePct, ratio.thresholds);
  const label = ratio.status === "ok"
    ? t("rating.page.trackValue", { value: formatPct(ratio.value), ratio: ratio.label.toLowerCase(), scale: scaleText(ratio.thresholds) })
    : t("rating.page.trackScale", { scale: scaleText(ratio.thresholds) });
  return h("div", { class: "track", role: "img", "aria-label": label },
    h("div", { class: "track__bar" },
      g.segments.map((s) => h("span", { class: `track__seg tone-${s.id}`, style: `left:${s.from}%;width:${s.to - s.from}%` })),
      g.marker ? h("span", {
        class: `track__marker${g.marker.outside ? ` track__marker--${g.marker.outside}` : ""}`,
        style: `left:${g.marker.at}%`,
      }) : null),
    h("div", { class: "track__ticks", "aria-hidden": "true" },
      g.ticks.map((tick) => h("span", { class: "track__tick", style: `left:${tick.at}%` }, formatPercentValue(tick.value)))));
}

function renderMath(ratio, r) {
  const math = explainRatio(ratio, r.statement, app.ratedValues);
  return h("div", { class: "ratio__learn learn-only" },
    h("div", { class: "math" },
      h("p", { class: "math__title" }, t("rating.math.title")),
      h("ol", { class: "math__steps" },
        h("li", {}, h("code", {}, math.formula)),
        math.substituted ? h("li", {}, h("code", {}, math.substituted)) : null,
        h("li", {}, h("code", { class: "math__result" }, math.result))),
      math.where.length > 0 ? h("ul", { class: "math__where" }, math.where.map((w) => h("li", {}, w))) : null),
    h("p", {}, h("strong", {}, t("rating.math.meaning")), ratio.meaning),
    h("p", {}, h("strong", {}, t("rating.math.improve")), ratio.improve));
}

function renderRatio(ratio, r) {
  const head = h("div", { class: "ratio__head" },
    h("h5", { class: "ratio__name" }, ratio.label),
    h("span", { class: "ratio__weight" }, t("rating.page.weight", { weight: ratio.weight })),
    h("span", { class: "ratio__score" }, ratio.status === "ok"
      ? [h("span", { class: "ratio__value" }, formatPct(ratio.value)), bandPill(ratio.band)]
      : [h("span", { class: "ratio__value ratio__value--none" }, t(ratio.status === "missing" ? "rating.page.notAvailable" : "rating.page.notMeaningful")),
        pill("none", t("common.dash"), t(ratio.status === "missing" ? "rating.page.missingPill" : "rating.page.notMeaningfulPill"))]));
  const source = HANDOFF_SOURCES[app.source];
  return h("li", { class: `ratio ratio--${ratio.status}` },
    head,
    ratio.status === "ok" ? null : h("p", { class: "ratio__status" }, ratioStatusText(ratio)),
    renderTrack(ratio),
    ratio.id === "grossMargin" && source ? h("p", { class: "ratio__link" }, h("a", { href: source.backLink }, `${source.backLabel} →`)) : null,
    renderMath(ratio, r));
}

function renderRatioGroup(r, group) {
  const id = `ratios-${group}`;
  return h("section", { class: "block", "aria-labelledby": id },
    h("h3", { id, class: "block-title" }, t(`rating.ratioGroups.${group}`)),
    h("p", { class: "block-note" }, t(`rating.ratioGroups.${group}Lede`)),
    h("ol", { class: "ratios card" }, r.ratios.filter((x) => x.group === group).map((x) => renderRatio(x, r))));
}

function renderDupont(r) {
  const d = r.dupont;
  const factor = (label, value, op) => [
    op ? h("span", { class: "dupont__op", "aria-hidden": "true" }, op) : null,
    h("div", { class: "dupont__factor" }, h("span", { class: "dupont__label" }, label), h("span", { class: "dupont__value" }, value)),
  ];
  return h("section", { class: "block", "aria-labelledby": "dupont-title" },
    h("h3", { id: "dupont-title", class: "block-title" }, t("rating.dupont.title")),
    h("p", { class: "block-note" }, t("rating.dupont.lede")),
    h("div", { class: "card dupont-card" },
      h("div", { class: "dupont" },
        factor(t("rating.dupont.netMargin"), formatPct(d.netMargin)),
        factor(t("rating.dupont.assetTurnover"), formatMultiple(d.assetTurnover), "×"),
        factor(t("rating.dupont.equityMultiplier"), d.status === "ok" ? formatMultiple(d.equityMultiplier) : t("rating.dupont.notMeaningful"), "×"),
        factor(t("rating.dupont.roe"), d.status === "ok" ? formatPct(d.roe) : t("rating.dupont.notMeaningful"), "=")),
      d.status === "ok" ? null : h("p", { class: "ratio__status" }, d.reason),
      h("div", { class: "learn-note learn-only" }, dupontSentences(d).map((s) => h("p", {}, s)))));
}

function renderMethod(r) {
  const thresholds = INDUSTRY_BY_ID[r.industry.id].thresholds;
  return h("section", { class: "block" },
    h("details", { class: "card method" },
      h("summary", {}, t("rating.page.methodTitle")),
      h("ol", { class: "method__steps" },
        h("li", {}, t("rating.page.methodStep1")),
        h("li", {}, t("rating.page.methodStep2")),
        h("li", {}, t("rating.page.methodStep3", { grades: gradeScaleText() })),
        h("li", {}, t("rating.page.methodStep4"))),
      h("div", { class: "table-scroll" },
        h("table", { class: "method__table" },
          h("caption", {}, t("rating.page.methodCaption", { industry: r.industry.label, source: BENCHMARK_SOURCE.label, note: BENCHMARK_SOURCE.note })),
          h("thead", {}, h("tr", {},
            ["colRatio", "colWeight", "colWeak", "colFair", "colGood", "colExcellent"].map((key) => h("th", { scope: "col" }, t(`rating.page.${key}`))))),
          h("tbody", {}, RATIOS.map((ratio) => h("tr", {},
            h("th", { scope: "row" }, ratio.label),
            h("td", {}, String(ratio.weight)),
            thresholds[ratio.id].map((value) => h("td", {}, formatPercentValue(value)))))))),
      h("p", {}, t("rating.page.methodLink"), h("a", { href: "docs/methodology.md" }, "docs/methodology.md"))));
}

/** The inputs, printed with the results (hidden on screen). */
function renderPrintInputs() {
  const v = app.ratedValues;
  return h("section", { class: "print-only print-inputs" },
    h("h3", { class: "block-title" }, t("rating.page.printInputs")),
    h("dl", {}, FIELDS.map((f) => [h("dt", {}, f.label), h("dd", {}, v[f.id] === null ? t("common.dash") : formatAmountInput(v[f.id]))])));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/** Restores the saved form, or applies figures sent from the segment module. */
function restore() {
  const handoff = decodeHandoff(location.hash);
  if (handoff) {
    app.source = handoff.source.id;
    const raw = Object.fromEntries(FIELDS.map((f) => [f.id, formatAmountInput(handoff.values[f.id] ?? null)]));
    fillForm({ raw, industryId: handoff.source.industryId, companyName: handoff.source.companyName });
    history.replaceState(null, "", location.pathname + location.search);
    saveForm();
    showSourceNote();
    renderResults();
    const firstEmpty = FIELDS.find((f) => f.required && !$(inputId(f.id)).value);
    if (firstEmpty) $(inputId(firstEmpty.id)).focus();
    return;
  }
  const saved = readJson(STORAGE_KEY);
  if (saved?.version === STORAGE_VERSION && saved.raw) {
    app.source = HANDOFF_SOURCES[saved.source] ? saved.source : null;
    fillForm(saved);
    showSourceNote();
    const { values, errors } = parseForm(readRaw());
    if (Object.keys(errors).length === 0) runRating(values);
    else renderResults();
    return;
  }
  fillForm({ raw: {}, industryId: DEFAULT_INDUSTRY_ID, companyName: "" });
  renderResults();
}

mountSiteHeader($("site-header"), { active: "rating", root: "./" });
buildForm();
restore();
// A hand-off link opened while this page is already showing changes only the hash.
window.addEventListener("hashchange", () => { if (decodeHandoff(location.hash)) restore(); });
