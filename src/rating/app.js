// app.js: the Company rating page. UI only: every number and sentence comes
// from the pure modules (fields, years, rating, report, path, whatif, compare,
// paste, shared/*) and every other text from the language files. This file
// keeps the form's state (one to five years), calls rateYears() and places
// the result blocks (view-results.js, view-path.js, view-whatif.js, view-peers.js).
//
// The form shows one year at a time; the year tabs switch which year's
// figures are in the inputs. Newest year first: years[0] is the year rated.

import { FIELDS, GROUPS, parseForm, exportJson, importJson } from "./fields.js";
import { MAX_YEARS, PRIOR_FIELD_IDS, rateYears, trendSentence } from "./years.js";
import { INDUSTRIES, DEFAULT_INDUSTRY_ID, INDUSTRY_BY_ID, BENCHMARK_SOURCE } from "./benchmarks.js";
import { SAMPLES } from "./samples.js";
import { CASES, caseFromHash } from "../learn/cases.js";
import { textSummary } from "./report.js";
import {
  renderVerdict, renderKeyFigures, renderFlags, renderRatioGroup, renderTrend, renderDupont, renderMethod, renderPrintInputs, richText,
} from "./view-results.js";
import { renderWhatIf } from "./view-whatif.js";
import { renderPath } from "./view-path.js";
import { renderPeers } from "./view-peers.js";
import { createPasteDialog } from "./view-paste.js";
import { listenForFileDrop } from "../shared/file-import.js";
import { formatAmountInput } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { decodeHandoff, HANDOFF_SOURCES } from "../shared/handoff.js";
import { h, replaceChildren } from "../shared/dom.js";
import { readJson, writeJson } from "../shared/prefs.js";
import { downloadFile } from "../shared/export.js";
import { mountSiteHeader } from "../shared/site-header.js";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "rating/form";
const STORAGE_VERSION = 2;
/** The latest financial year offered by default: last calendar year. */
const DEFAULT_YEAR = new Date().getFullYear() - 1;
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

const blankRaw = () => Object.fromEntries(FIELDS.map((f) => [f.id, ""]));

/** The page's state besides what the inputs show. */
const app = {
  /** Raw text of each year's fields, newest first. The inputs show years[active]. */
  years: [blankRaw()],
  active: 0,
  /** The latest financial year (the first tab). */
  latestYear: DEFAULT_YEAR,
  /** Errors from the last attempt to rate, by year index then field id. */
  errors: {},
  /** @type {object|null} view context of the last rating (see view-results.js) */
  view: null,
  /** Serialised form at the time of the last rating, to notice later edits. */
  ratedSnapshot: null,
  /** @type {string|null} id in HANDOFF_SOURCES when the figures came from another module */
  source: null,
};

const yearLabel = (index) => app.latestYear - index;
const isOldest = (index) => index === app.years.length - 1;

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

const inputId = (fieldId) => `f-${fieldId}`;

function buildForm() {
  const groups = GROUPS.map((group) => h("fieldset", { class: "field-group", id: `group-${group.id}` },
    h("legend", { id: `legend-${group.id}` }, group.label),
    group.id === "prior" ? h("p", { class: "field__note chain-note", id: "chain-note", hidden: true }) : null,
    FIELDS.filter((f) => f.group === group.id).map(buildField)));
  replaceChildren($("field-groups"), groups);

  const select = $("industry");
  replaceChildren(select, INDUSTRIES.map((i) => h("option", { value: i.id }, i.label)));
  select.addEventListener("change", () => { showIndustryNote(); onFormEdited(); });

  const year = $("latest-year");
  year.min = String(MIN_YEAR);
  year.max = String(MAX_YEAR);
  year.addEventListener("input", () => {
    const value = Number(year.value);
    if (Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR) {
      app.latestYear = value;
      renderYearBar();
      showYearLabels();
    }
  });

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
  $("import-file").addEventListener("change", (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (file) importJsonFile(file);
  });
  const paste = createPasteDialog({ latestYear: () => app.latestYear, industryId: () => $("industry").value, onApply: applyPaste });
  $("paste-table").addEventListener("click", () => paste.open());
  // A file dropped on the page: an exported JSON file is imported, a table opens in the paste dialog.
  listenForFileDrop((file) => (/.json$/i.test(file.name) ? importJsonFile(file) : paste.open(file)));
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

/** The year tabs, "Add an earlier year" and "Remove this year". */
function renderYearBar() {
  const tabs = app.years.map((_, i) => h("button", {
    type: "button", role: "tab", id: `year-tab-${i}`, class: "year-tab",
    "aria-selected": String(i === app.active), "aria-controls": "field-groups", tabindex: i === app.active ? "0" : "-1",
    on: { click: () => showYear(i), keydown: onTabKey },
  }, String(yearLabel(i)), i === 0 && app.years.length > 1 ? h("span", { class: "year-tab__tag" }, t("rating.years.rated")) : null));
  const full = app.years.length >= MAX_YEARS;
  replaceChildren($("years"),
    h("div", { class: "years__tabs", role: "tablist", "aria-label": t("rating.years.tabsLabel") }, tabs),
    h("div", { class: "years__actions" },
      h("button", {
        type: "button", class: "button-quiet", disabled: full,
        title: full ? t("rating.years.full", { max: MAX_YEARS }) : null,
        on: { click: addYear },
      }, t("rating.years.add", { year: yearLabel(app.years.length) })),
      app.years.length > 1 && isOldest(app.active)
        ? h("button", { type: "button", class: "button-quiet", on: { click: removeYear } }, t("rating.years.remove", { year: yearLabel(app.active) }))
        : null));
  $("field-groups").setAttribute("aria-labelledby", `year-tab-${app.active}`);
}

/** Arrow keys move between year tabs (WAI-ARIA tabs pattern). */
function onTabKey(event) {
  const moves = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity };
  if (!(event.key in moves)) return;
  event.preventDefault();
  const next = Math.min(Math.max(app.active + moves[event.key], 0), app.years.length - 1);
  showYear(next);
  $(`year-tab-${next}`).focus();
}

/** Legends name the year; the prior-year fields belong to the oldest year only. */
function showYearLabels() {
  const year = yearLabel(app.active);
  $("legend-income").textContent = t("rating.years.income", { year });
  $("legend-balance").textContent = t("rating.years.balance", { year });
  $("legend-prior").textContent = t("rating.years.prior", { year: year - 1 });
  const oldest = isOldest(app.active);
  for (const id of PRIOR_FIELD_IDS) document.querySelector(`[data-field="${id}"]`).hidden = !oldest;
  const note = $("chain-note");
  note.hidden = oldest;
  note.textContent = oldest ? "" : t("rating.years.chained", { year: year - 1 });
}

/** The inputs' raw text, by field id. */
function readRaw() {
  return Object.fromEntries(FIELDS.map((f) => [f.id, $(inputId(f.id)).value]));
}

/** Copies the inputs into the active year. */
function syncActive() {
  app.years[app.active] = readRaw();
}

function fillInputs(raw) {
  for (const f of FIELDS) $(inputId(f.id)).value = raw[f.id] ?? "";
}

/**
 * Shows year `index` in the form.
 * @param {number} index
 * @param {{sync?: boolean}} [options] sync: first copy the inputs into the year in view
 */
function showYear(index, { sync = true } = {}) {
  if (sync) syncActive();
  app.active = index;
  fillInputs(app.years[index]);
  renderYearBar();
  showYearLabels();
  showFieldErrors();
}

/** Puts a whole form state in place: years of raw text, newest first. */
function fillForm({ years, latestYear, industryId, companyName }) {
  app.years = years.length > 0 ? years.slice(0, MAX_YEARS).map((raw) => ({ ...blankRaw(), ...raw })) : [blankRaw()];
  app.latestYear = Number.isInteger(latestYear) && latestYear >= MIN_YEAR && latestYear <= MAX_YEAR ? latestYear : DEFAULT_YEAR;
  app.active = 0;
  app.errors = {};
  $("latest-year").value = String(app.latestYear);
  $("industry").value = INDUSTRY_BY_ID[industryId] ? industryId : DEFAULT_INDUSTRY_ID;
  $("company-name").value = companyName ?? "";
  fillInputs(app.years[0]);
  showIndustryNote();
  renderYearBar();
  showYearLabels();
  showErrors({});
}

/** Raw text for each year from values (numbers), newest first. */
const rawFromValues = (values) => Object.fromEntries(FIELDS.map((f) => [f.id, formatAmountInput(values[f.id] ?? null)]));

const snapshot = () => JSON.stringify({ years: app.years, latestYear: app.latestYear, industryId: $("industry").value });

function saveForm() {
  writeJson(STORAGE_KEY, {
    version: STORAGE_VERSION,
    latestYear: app.latestYear,
    years: app.years,
    industryId: $("industry").value,
    companyName: $("company-name").value,
    source: app.source,
  });
}

function onFormEdited() {
  syncActive();
  saveForm();
  $("stale-note").hidden = !app.view || snapshot() === app.ratedSnapshot;
}

function addYear() {
  syncActive();
  if (app.years.length >= MAX_YEARS) return;
  // The oldest year's prior-year balance sheet becomes the new year's balance sheet.
  const oldest = app.years.at(-1);
  const added = { ...blankRaw(), assets: oldest.priorAssets ?? "", equity: oldest.priorEquity ?? "" };
  for (const id of PRIOR_FIELD_IDS) oldest[id] = "";
  app.years.push(added);
  showYear(app.years.length - 1, { sync: false });
  onFormEdited();
  announce(t("rating.years.added", { year: yearLabel(app.years.length - 1) }));
  $(inputId("revenue")).focus();
}

function removeYear() {
  syncActive();
  const index = app.years.length - 1;
  const removed = app.years[index];
  const hasFigures = Object.entries(removed).some(([id, v]) => !["assets", "equity"].includes(id) && String(v).trim() !== "");
  if (hasFigures && !window.confirm(t("rating.years.removeConfirm", { year: yearLabel(index) }))) return;
  app.years.pop();
  // Its balance sheet goes back into the prior-year fields of the new oldest year.
  const oldest = app.years.at(-1);
  oldest.priorAssets = removed.assets ?? "";
  oldest.priorEquity = removed.equity ?? "";
  delete app.errors[index];
  app.active = Math.min(app.active, app.years.length - 1);
  fillInputs(app.years[app.active]);
  renderYearBar();
  showYearLabels();
  showErrors(app.errors);
  onFormEdited();
  announce(t("rating.years.removed", { year: yearLabel(index) }));
  $(`year-tab-${app.active}`).focus();
}

/**
 * Parses every year. Prior-year fields count only for the oldest year.
 * @returns {{years: {year: number, values: object}[], errors: Record<number, Record<string, string>>}}
 */
function parseAll() {
  syncActive();
  const years = [];
  const errors = {};
  app.years.forEach((raw, i) => {
    const own = isOldest(i) ? raw : { ...raw, ...Object.fromEntries(PRIOR_FIELD_IDS.map((id) => [id, ""])) };
    const parsed = parseForm(own);
    years.push({ year: yearLabel(i), values: parsed.values });
    if (Object.keys(parsed.errors).length > 0) errors[i] = parsed.errors;
  });
  return { years, errors };
}

/** Field errors of the year in view, next to the fields. */
function showFieldErrors() {
  const errors = app.errors[app.active] ?? {};
  for (const f of FIELDS) {
    const input = $(inputId(f.id));
    const box = $(`e-${f.id}`);
    const message = errors[f.id];
    box.hidden = !message;
    box.textContent = message ?? "";
    input.toggleAttribute("aria-invalid", Boolean(message));
    input.setAttribute("aria-describedby", message ? `e-${f.id} h-${f.id}` : `h-${f.id} amount-hint`);
  }
}

/** Shows errors next to the fields and as a linked list at the top (naming the year when there are several). */
function showErrors(errors) {
  app.errors = errors;
  showFieldErrors();
  const summary = $("error-summary");
  const items = [];
  for (const [index, byField] of Object.entries(errors)) {
    for (const f of FIELDS) {
      if (!byField[f.id]) continue;
      const i = Number(index);
      const text = app.years.length > 1 ? t("rating.years.errorIn", { year: yearLabel(i), error: byField[f.id] }) : byField[f.id];
      items.push(h("li", {}, h("a", {
        href: `#${inputId(f.id)}`,
        on: { click: (event) => { event.preventDefault(); if (i !== app.active) showYear(i); $(inputId(f.id)).focus(); } },
      }, text)));
    }
  }
  summary.hidden = items.length === 0;
  replaceChildren(summary, items.length === 0 ? [] : [
    h("p", { class: "error-summary__title" }, t("rating.page.attention", { count: items.length })),
    h("ul", {}, items),
  ]);
  return items.length;
}

function showSourceNote() {
  const note = $("source-note");
  const source = HANDOFF_SOURCES[app.source];
  note.hidden = !source;
  if (!source) return;
  replaceChildren(note,
    h("strong", {}, t("rating.page.sourceStrong")),
    source.note,
    h("a", { href: source.backLink.replace(/#.*/, "") }, source.returnLabel));
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
  const { years, errors } = parseAll();
  if (showErrors(errors) > 0) {
    const first = Number(Object.keys(errors)[0]);
    if (first !== app.active) showYear(first);
    $("error-summary").focus();
    announce(t("rating.page.announceInvalid"));
    return;
  }
  runRating(years);
  saveForm();
  const results = $("results");
  if (results.getBoundingClientRect().top > window.innerHeight * 0.6) results.scrollIntoView({ behavior: "smooth", block: "start" });
  results.focus({ preventScroll: true });
  const r = app.view.rating;
  announce(t("rating.page.announceRated", { letter: r.grade.letter, score: r.score, label: r.grade.label }));
}

function runRating(years) {
  const trend = rateYears(years, $("industry").value);
  app.view = {
    rating: trend.years[0].rating,
    values: trend.years[0].values,
    name: $("company-name").value.trim(),
    source: HANDOFF_SOURCES[app.source] ?? null,
    trend,
  };
  app.ratedSnapshot = snapshot();
  $("stale-note").hidden = true;
  renderResults();
}

function loadSample(sample) {
  app.source = null;
  fillForm({
    years: [rawFromValues(sample.values)], latestYear: app.latestYear, industryId: sample.industryId,
    companyName: t("rating.samples.nameFictional", { name: sample.name }),
  });
  showSourceNote();
  submit();
}

function clearForm() {
  syncActive();
  const hasFigures = app.years.some((raw) => Object.values(raw).some((v) => String(v).trim() !== ""));
  if (hasFigures && !window.confirm(t("rating.page.clearConfirm"))) return;
  app.source = null;
  app.view = null;
  fillForm({ years: [], latestYear: app.latestYear, industryId: $("industry").value, companyName: "" });
  showSourceNote();
  saveForm();
  renderResults();
  $(inputId(FIELDS[0].id)).focus();
}

function slug(text) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function exportForm() {
  const { years } = parseAll();
  const companyName = $("company-name").value.trim();
  downloadFile(`company-rating${companyName ? `-${slug(companyName)}` : ""}.json`,
    exportJson(years, { industryId: $("industry").value, companyName }), "application/json");
  announce(t("rating.page.announceExported"));
}

/** Fills the form from years of values (newest first) and rates them when they are valid. */
function loadYears(years, { latestYear, industryId, companyName }) {
  app.source = null;
  fillForm({ years: years.map((y) => rawFromValues(y.values)), latestYear, industryId, companyName });
  showSourceNote();
  submit();
}

async function importJsonFile(file) {
  try {
    const imported = importJson(await file.text());
    loadYears(imported.years, { latestYear: imported.years[0].year ?? app.latestYear, industryId: imported.industryId, companyName: imported.companyName });
  } catch (error) {
    showErrors({});
    const summary = $("error-summary");
    summary.hidden = false;
    replaceChildren(summary, h("p", { class: "error-summary__title" }, t("rating.page.importFailed")), h("p", {}, error.message));
    summary.focus();
  }
}

/** True for the names the page itself gives fictional figures: examples, practice cases and hand-offs. */
function isFictionalName(name) {
  return [...SAMPLES, ...CASES].some((s) => name === t("rating.samples.nameFictional", { name: s.name }))
    || Object.values(HANDOFF_SOURCES).some((source) => name === source.companyName);
}

/** Fills the form from the paste dialog (years already checked) and rates it with the industry chosen there. */
function applyPaste(years, industryId) {
  // Pasted figures are not the example company any more: drop its fictional name.
  const name = $("company-name").value;
  loadYears(years, { latestYear: years[0].year, industryId, companyName: isFictionalName(name) ? "" : name });
  announce(t("rating.paste.applied", { count: years.length }));
}

async function copySummary(button) {
  const { rating, name, trend } = app.view;
  const text = textSummary(rating, { companyName: name, year: trend.years[0].year, trendText: trendSentence(trend) });
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

function peersBlock() {
  const industry = INDUSTRY_BY_ID[app.view.rating.industry.id];
  const block = renderPeers(app.view, {
    industryId: industry.id,
    industryLabel: industry.label,
    announce,
    onChange: () => {
      const fresh = peersBlock();
      block.replaceWith(fresh);
      fresh.querySelector("h3").setAttribute("tabindex", "-1");
      fresh.querySelector("h3").focus();
    },
  });
  return block;
}

function renderResults() {
  const body = $("results-body");
  if (!app.view) {
    replaceChildren(body, h("div", { class: "card empty-state" },
      h("p", { class: "empty-state__title" }, t("rating.page.emptyTitle")),
      richText("p", "rating.page.emptyBody")));
    return;
  }
  const ctx = app.view;
  const industryId = ctx.rating.industry.id;
  const whatIf = renderWhatIf(ctx, { industryId });
  replaceChildren(body,
    renderVerdict(ctx, { onCopy: copySummary }),
    renderKeyFigures(ctx),
    renderFlags(ctx),
    renderTrend(ctx),
    renderRatioGroup(ctx, "margins"),
    renderRatioGroup(ctx, "returns"),
    renderDupont(ctx),
    renderPath(ctx, { industryId, onTry: whatIf.show }),
    whatIf.element,
    peersBlock(),
    renderMethod(ctx),
    renderPrintInputs(ctx));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/** A stored form: version 2 (years), or version 1 (one year) from Phase 2. */
function storedForm() {
  const saved = readJson(STORAGE_KEY);
  if (saved?.version === STORAGE_VERSION && Array.isArray(saved.years)) return saved;
  if (saved?.version === 1 && saved.raw) return { ...saved, years: [saved.raw], latestYear: DEFAULT_YEAR };
  return null;
}

/**
 * Restores the saved form, or applies figures sent from the segment module,
 * or opens a practice case from the Glossary & practice page (#case=<id>).
 */
function restore() {
  const practiceCase = caseFromHash(location.hash);
  if (practiceCase) {
    history.replaceState(null, "", location.pathname + location.search);
    // Never overwrite the user's own saved figures without asking.
    const saved = storedForm();
    const hasFigures = saved?.years.some((raw) => Object.values(raw ?? {}).some((v) => String(v ?? "").trim() !== ""));
    if (!hasFigures || window.confirm(t("rating.page.caseReplace", { name: practiceCase.name }))) {
      loadSample(practiceCase);
      return;
    }
  }
  const handoff = decodeHandoff(location.hash);
  if (handoff) {
    app.source = handoff.source.id;
    app.view = null;
    fillForm({ years: [rawFromValues(handoff.values)], latestYear: app.latestYear, industryId: handoff.source.industryId, companyName: handoff.source.companyName });
    history.replaceState(null, "", location.pathname + location.search);
    saveForm();
    showSourceNote();
    renderResults();
    const firstEmpty = FIELDS.find((f) => f.required && !$(inputId(f.id)).value);
    if (firstEmpty) $(inputId(firstEmpty.id)).focus();
    return;
  }
  const saved = storedForm();
  if (saved) {
    app.source = HANDOFF_SOURCES[saved.source] ? saved.source : null;
    fillForm(saved);
    showSourceNote();
    const { years, errors } = parseAll();
    if (Object.keys(errors).length === 0) runRating(years);
    else renderResults();
    return;
  }
  fillForm({ years: [], latestYear: DEFAULT_YEAR, industryId: DEFAULT_INDUSTRY_ID, companyName: "" });
  renderResults();
}

mountSiteHeader($("site-header"), { active: "rating", root: "./" });
buildForm();
restore();
// A hand-off link opened while this page is already showing changes only the hash.
window.addEventListener("hashchange", () => { if (decodeHandoff(location.hash) || caseFromHash(location.hash)) restore(); });
