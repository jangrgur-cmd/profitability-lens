// app.js (segments): the Segment profitability page. UI only: every number
// and sentence comes from segments.js and src/shared/*, every other text from
// the language files. The table is kept in localStorage; nothing is sent.

import {
  COLUMNS, MAX_SEGMENTS, SEGMENT_KINDS, analyseSegments, readSegmentPaste, segmentSummary, segmentsCsv, validateSegments,
} from "./segments.js";
import { SEGMENT_SAMPLES } from "./samples.js";
import { parseAmount } from "../shared/parse.js";
import { formatAmountInput, formatEur, formatEurFull, formatPct, formatPoints, toneClass } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { h, replaceChildren } from "../shared/dom.js";
import { readJson, writeJson } from "../shared/prefs.js";
import { downloadCsv } from "../shared/export.js";
import { downloadWorkbook, fileControls, listenForFileDrop, readTableFile } from "../shared/file-import.js";
import { segmentTemplate } from "./template.js";
import { encodeHandoff } from "../shared/handoff.js";
import { mountSiteHeader } from "../shared/site-header.js";
import { captureMotion, playMotion, motionKey } from "../shared/motion.js";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "segments/table";
const STORAGE_VERSION = 1;
const START_ROWS = 4;
const AMOUNT_COLUMNS = COLUMNS.filter((c) => c !== "name");

const blankRow = () => Object.fromEntries(COLUMNS.map((c) => [c, ""]));

const app = {
  /** Raw text of each row. */
  rows: Array.from({ length: START_ROWS }, blankRow),
  /** @type {ReturnType<typeof analyseSegments>|null} */
  analysis: null,
  ratedSnapshot: null,
  errors: {},
};

// ---------------------------------------------------------------------------
// Table editor
// ---------------------------------------------------------------------------

const cellId = (row, col) => `s-${row}-${col}`;

function renderRows() {
  replaceChildren($("seg-rows"), app.rows.map((row, i) => h("tr", {},
    h("td", { class: "seg-table__num" }, String(i + 1)),
    COLUMNS.map((col) => {
      const error = app.errors[i]?.[col];
      return h("td", { class: col === "name" ? "seg-table__name" : "" },
        h("input", {
          id: cellId(i, col), type: "text", value: row[col],
          inputmode: col === "name" ? null : "decimal", autocomplete: "off", spellcheck: col === "name" ? null : "false",
          class: col === "name" ? "" : "num",
          "aria-label": t("segments.page.cellLabel", { column: columnLabel(col), row: i + 1 }),
          "aria-invalid": error ? "true" : null,
          title: error ?? null,
          on: { input: (e) => { app.rows[i][col] = e.target.value; onEdited(); } },
        }));
    }),
    h("td", {}, h("button", {
      type: "button", class: "icon-button seg-remove", "aria-label": t("segments.page.removeRow", { row: i + 1 }),
      title: t("segments.page.removeRow", { row: i + 1 }),
      on: { click: () => removeRow(i) },
    }, "✕")))));
  $("seg-add").disabled = app.rows.length >= MAX_SEGMENTS;
}

function columnLabel(col) {
  return col === "name" ? currentKind().label : t(`segments.columns.${col}`);
}

const currentKind = () => SEGMENT_KINDS.find((k) => k.id === $("seg-kind").value) ?? SEGMENT_KINDS[0];

function showKind() {
  $("seg-col-name").textContent = currentKind().label;
}

function addRow() {
  if (app.rows.length >= MAX_SEGMENTS) return;
  app.rows.push(blankRow());
  renderRows();
  onEdited();
  $(cellId(app.rows.length - 1, "name")).focus();
}

function removeRow(i) {
  app.rows.splice(i, 1);
  if (app.rows.length === 0) app.rows.push(blankRow());
  const errors = {};
  for (const [k, v] of Object.entries(app.errors)) if (Number(k) !== i) errors[Number(k) > i ? Number(k) - 1 : k] = v;
  app.errors = errors;
  renderRows();
  onEdited();
  announce(t("segments.page.rowRemoved", { row: i + 1 }));
  const focus = $(cellId(Math.min(i, app.rows.length - 1), "name"));
  if (focus) focus.focus();
}

const snapshot = () => JSON.stringify({ rows: app.rows });

function save() {
  writeJson(STORAGE_KEY, { version: STORAGE_VERSION, kind: $("seg-kind").value, rows: app.rows });
}

function onEdited() {
  save();
  $("seg-stale").hidden = !app.analysis || snapshot() === app.ratedSnapshot;
}

/** Puts segments (numbers) into the editor. */
function fillRows(segments) {
  app.rows = segments.map((s) => ({
    name: s.name,
    revenue: formatAmountInput(s.revenue),
    variableCosts: formatAmountInput(s.variableCosts),
    fixedCosts: s.fixedCosts === null || s.fixedCosts === undefined ? "" : formatAmountInput(s.fixedCosts),
  }));
  if (app.rows.length === 0) app.rows.push(blankRow());
  app.errors = {};
  renderRows();
}

/**
 * Reads the editor. Blank rows are skipped; a blank revenue or cost cell is an error,
 * except direct fixed costs, which may stay blank.
 * @returns {{segments: object[], errors: Record<number, Record<string, string>>, table: string|null, rowOf: number[]}}
 */
function readRows() {
  const segments = [];
  const rowOf = [];
  const errors = {};
  app.rows.forEach((row, i) => {
    if (COLUMNS.every((c) => String(row[c]).trim() === "")) return;
    const segment = { name: String(row.name).trim() };
    for (const col of AMOUNT_COLUMNS) {
      const { value, error } = parseAmount(row[col]);
      if (error) (errors[i] ??= {})[col] = t("segments.validation.number");
      segment[col] = value;
    }
    if (segment.variableCosts === null && !errors[i]?.variableCosts) segment.variableCosts = Number.NaN;
    if (segment.revenue === null && !errors[i]?.revenue) segment.revenue = Number.NaN;
    rowOf.push(i);
    segments.push(segment);
  });
  const checked = validateSegments(segments);
  for (const [k, cols] of Object.entries(checked.rows)) {
    const i = rowOf[Number(k)];
    for (const [col, message] of Object.entries(cols)) if (!errors[i]?.[col]) (errors[i] ??= {})[col] = message;
  }
  return { segments, errors, table: checked.table, rowOf };
}

function showErrors(errors, table) {
  app.errors = errors;
  renderRows();
  const box = $("seg-errors");
  const items = [];
  if (table) items.push(h("li", {}, table));
  for (const [i, cols] of Object.entries(errors)) {
    for (const col of COLUMNS) {
      if (!cols[col]) continue;
      items.push(h("li", {}, h("a", {
        href: `#${cellId(i, col)}`,
        on: { click: (e) => { e.preventDefault(); $(cellId(i, col)).focus(); } },
      }, t("segments.page.errorIn", { row: Number(i) + 1, column: columnLabel(col), error: cols[col] }))));
    }
  }
  box.hidden = items.length === 0;
  replaceChildren(box, items.length === 0 ? [] : [
    h("p", { class: "error-summary__title" }, t("segments.page.attention", { count: items.length })), h("ul", {}, items),
  ]);
  return items.length;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function announce(text) {
  const el = $("announcer");
  el.textContent = "";
  setTimeout(() => { el.textContent = text; }, 50);
}

function submit({ focus = true } = {}) {
  const { segments, errors, table } = readRows();
  if (showErrors(errors, table) > 0) {
    if (focus) $("seg-errors").focus();
    announce(t("segments.page.announceInvalid"));
    return;
  }
  app.analysis = analyseSegments(segments);
  app.ratedSnapshot = snapshot();
  $("seg-stale").hidden = true;
  renderResults();
  if (focus) {
    const results = $("seg-results");
    results.scrollIntoView({ behavior: "smooth", block: "start" });
    results.focus({ preventScroll: true });
    announce(segmentSummary(app.analysis));
  }
}

function loadSample(sample) {
  $("seg-kind").value = sample.kind;
  showKind();
  fillRows(sample.segments);
  save();
  submit();
}

function clearTable() {
  const hasFigures = app.rows.some((row) => COLUMNS.some((c) => String(row[c]).trim() !== ""));
  if (hasFigures && !window.confirm(t("segments.page.clearConfirm"))) return;
  app.rows = Array.from({ length: START_ROWS }, blankRow);
  app.analysis = null;
  app.errors = {};
  showErrors({}, null);
  save();
  renderResults();
  $(cellId(0, "name")).focus();
}

/** The paste dialog: read a table, preview it, replace the editor's rows. */
function createPasteDialog() {
  let read = null;
  const textarea = h("textarea", { id: "seg-paste-text", rows: 8, spellcheck: "false", placeholder: t("segments.paste.placeholder"), "aria-describedby": "seg-paste-help" });
  const preview = h("div", { class: "paste__preview", "aria-live": "polite" });
  const fileNote = h("p", { class: "paste__file", "aria-live": "polite", hidden: true });
  const apply = h("button", { type: "button", class: "button button--primary", disabled: true }, t("segments.paste.apply"));
  const readText = () => {
    read = readSegmentPaste(textarea.value);
    apply.disabled = read.segments.length === 0;
    if (read.segments.length === 0) {
      replaceChildren(preview, h("p", { class: "paste__empty" }, t("segments.paste.nothing")));
      return;
    }
    replaceChildren(preview,
      h("p", { class: "paste__summary" }, t("segments.paste.summary", { count: read.segments.length, skipped: read.skipped.length })),
      read.truncated ? h("p", { class: "paste__warn" }, t("segments.paste.truncated", { max: MAX_SEGMENTS })) : null,
      h("p", { class: "paste__note" }, t(read.header ? "segments.paste.withHeader" : "segments.paste.noHeader")),
      h("div", { class: "table-scroll" }, h("table", { class: "paste__table" },
        h("caption", {}, t("segments.paste.previewCaption")),
        h("thead", {}, h("tr", {}, COLUMNS.map((c) => h("th", { scope: "col" }, columnLabel(c))))),
        h("tbody", {}, read.segments.slice(0, 12).map((s) => h("tr", {},
          h("th", { scope: "row" }, s.name),
          AMOUNT_COLUMNS.map((c) => h("td", {}, s[c] === null ? t("common.dash") : formatEurFull(s[c])))))))),
      read.segments.length > 12 ? h("p", { class: "paste__note" }, t("segments.paste.more", { count: read.segments.length - 12 })) : null,
      read.skipped.length > 0 ? h("p", { class: "paste__note" }, t("segments.paste.skipped", { lines: read.skipped.map((s) => s.line).join(t("common.listSeparator")) })) : null);
  };
  const dialog = h("dialog", { class: "paste-dialog card", "aria-labelledby": "seg-paste-title" },
    h("form", { method: "dialog", class: "paste" },
      h("div", { class: "paste__head" },
        h("h2", { id: "seg-paste-title", class: "form-title" }, t("segments.paste.title")),
        h("button", { type: "submit", class: "icon-button", value: "cancel", "aria-label": t("rating.paste.close") }, "✕")),
      h("p", { id: "seg-paste-help", class: "paste__intro" }, t("segments.paste.intro")),
      h("div", { class: "field field--text" }, h("label", { for: "seg-paste-text" }, t("segments.paste.label")), textarea),
      fileControls({
        id: "seg-paste",
        onFile: (file) => loadFile(file),
        onTemplate: () => downloadWorkbook(t("segments.template.filename"), segmentTemplate({ kind: currentKind().id })),
      }),
      fileNote,
      h("div", { class: "paste__read" },
        h("button", { type: "button", class: "button", on: { click: readText } }, t("rating.paste.read")),
        h("p", { class: "paste__privacy" }, t("rating.paste.privacy"))),
      preview,
      h("div", { class: "paste__foot" },
        h("button", { type: "submit", class: "button-quiet", value: "cancel" }, t("rating.paste.cancel")),
        apply)));
  async function loadFile(file) {
    fileNote.hidden = false;
    fileNote.classList.remove("paste__file--error");
    try {
      const { text, note } = await readTableFile(file);
      textarea.value = text;
      fileNote.textContent = note;
      readText();
    } catch (error) {
      fileNote.textContent = error.message;
      fileNote.classList.add("paste__file--error");
    }
  }
  apply.addEventListener("click", () => {
    dialog.close("apply");
    fillRows(read.segments);
    save();
    submit();
  });
  document.body.append(dialog);
  return {
    open(file) {
      textarea.value = "";
      fileNote.hidden = true;
      replaceChildren(preview);
      apply.disabled = true;
      if (!dialog.open) dialog.showModal();
      textarea.focus();
      if (file) loadFile(file);
    },
  };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function renderResults() {
  const body = $("seg-results-body");
  const a = app.analysis;
  if (!a) {
    replaceChildren(body, h("div", { class: "card empty-state" },
      h("p", { class: "empty-state__title" }, t("segments.page.emptyTitle")),
      h("p", {}, t("segments.page.emptyBody"))));
    return;
  }
  // New blocks and segments rise into place; bars glide to their new length and changed totals light up.
  const before = captureMotion(body);
  const blocks = [renderSummary(a), renderRanked(a), renderCurve(a), renderTable(a), renderLearn(a), renderMethod()];
  blocks.forEach((el, i) => motionKey(el, `seg-block-${i}`, { enter: true }));
  replaceChildren(body, blocks);
  playMotion(body, before);
}

function renderSummary(a) {
  const profitLabel = a.hasFixedCosts ? t("segments.results.profit") : t("segments.results.contribution");
  let tiles = 0;
  const tile = (label, value, note, cls = "") => h("div", { class: "tile" },
    h("dt", {}, label), motionKey(h("dd", { class: `tile__value ${cls}` }, value), `seg-tile-${tiles++}`), note ? h("dd", { class: "tile__note" }, note) : null);
  const handoff = `index.html${encodeHandoff("segments", { revenue: Math.max(a.totals.revenue, 0), cogs: a.totals.variableCosts })}`;
  return h("section", { class: "block", "aria-labelledby": "seg-summary-title" },
    h("div", { class: "card seg-summary" },
      h("h3", { id: "seg-summary-title", class: "verdict__title" }, t("segments.results.title", { count: a.rows.length })),
      h("p", { class: "verdict__summary" }, segmentSummary(a)),
      h("dl", { class: "tiles" },
        tile(t("segments.columns.revenue"), formatEurFull(a.totals.revenue)),
        tile(t("segments.results.contribution"), formatEurFull(a.totals.contribution), t("segments.results.cmNote", { ratio: formatPct(a.totals.cmRatio) }), a.totals.contribution < 0 ? "neg" : ""),
        a.hasFixedCosts ? tile(t("segments.results.profit"), formatEurFull(a.totals.profit), t("segments.results.profitNote", { margin: formatPct(a.totals.profitMargin) }), a.totals.profit < 0 ? "neg" : "") : null,
        tile(t("segments.results.top20", { count: a.top20.count }), a.top20.share === null ? t("rating.page.notMeaningful") : formatPct(a.top20.share), t("segments.results.top20Note", { profit: profitLabel.toLowerCase() })),
        tile(t("segments.results.losers"), String(a.lossMakers.count), a.lossMakers.count > 0 ? formatEurFull(a.lossMakers.loss) : null, a.lossMakers.count > 0 ? "neg" : "")),
      h("div", { class: "verdict__actions" },
        h("a", { class: "button", href: handoff }, t("segments.results.send")),
        h("button", { type: "button", class: "button", on: { click: () => { downloadCsv("segment-profitability.csv", segmentsCsv(a)); announce(t("segments.results.csvDone")); } } }, t("common.downloadCsv"))),
      h("p", { class: "block-note seg-summary__send" }, t("segments.results.sendNote"))));
}

/** Horizontal bars of profit by segment, ranked, from a zero line (losses to the left). */
function renderRanked(a) {
  const profits = a.rows.map((r) => r.profit);
  const max = Math.max(0, ...profits);
  const min = Math.min(0, ...profits);
  const span = max - min || 1;
  const zero = (-min / span) * 100;
  const profitLabel = a.hasFixedCosts ? t("segments.results.profit") : t("segments.results.contribution");
  return h("section", { class: "block", "aria-labelledby": "seg-ranked-title" },
    h("h3", { id: "seg-ranked-title", class: "block-title" }, t("segments.results.rankedTitle", { profit: profitLabel.toLowerCase() })),
    h("p", { class: "block-note" }, t("segments.results.rankedNote")),
    h("ol", { class: "card ranked" }, a.rows.map((r) => {
      const width = (Math.abs(r.profit) / span) * 100;
      const left = r.profit >= 0 ? zero : zero - width;
      return motionKey(h("li", { class: "ranked__row" },
        h("span", { class: "ranked__name" }, h("span", { class: "ranked__rank" }, `${r.rank}.`), r.name),
        h("span", { class: "ranked__track", "aria-hidden": "true" },
          h("span", { class: "ranked__zero", style: `left:${zero}%` }),
          motionKey(h("span", { class: `ranked__bar ${r.profit < 0 ? "ranked__bar--loss" : ""}`, style: `left:${left}%;width:${Math.max(width, 0.4)}%` }), `seg-bar-${r.name}`)),
        h("span", { class: `ranked__value ${toneClass(r.profit)}` }, formatEur(r.profit),
          h("span", { class: "ranked__margin" }, formatPct(r.profitMargin)))), `seg-row-${r.name}`, { enter: true });
    })));
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

/** The whale curve: cumulative share of segments (x) against cumulative share of profit (y). */
function renderCurve(a) {
  const title = h("h3", { id: "seg-curve-title", class: "block-title" }, t("segments.results.curveTitle"));
  if (a.rows.length < 2 || a.top20.share === null) {
    return h("section", { class: "block", "aria-labelledby": "seg-curve-title" }, title,
      h("p", { class: "card seg-curve__none" }, t(a.rows.length < 2 ? "segments.results.curveOne" : "segments.results.curveNoProfit")));
  }
  const W = 640; const H = 300; const L = 52; const R = 16; const T = 16; const B = 44;
  const peakShare = Math.max(...a.curve.points.map((p) => p.profitShare));
  const yMax = Math.max(1, Math.ceil(peakShare * 10) / 10);
  const x = (share) => L + share * (W - L - R);
  const y = (share) => T + (1 - share / yMax) * (H - T - B);
  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "curve", role: "img", "aria-labelledby": "seg-curve-desc" });

  for (let v = 0; v <= yMax + 1e-9; v += yMax > 1.5 ? 0.5 : 0.25) {
    chart.append(svg("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "curve__grid" }));
    chart.append(svg("text", { x: L - 8, y: y(v) + 4, class: "curve__tick", "text-anchor": "end" }, formatPct(v, 0)));
  }
  for (const v of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    chart.append(svg("text", { x: x(v), y: H - B + 18, class: "curve__tick", "text-anchor": "middle" }, formatPct(v, 0)));
  }
  chart.append(svg("line", { x1: L, x2: W - R, y1: y(1), y2: y(1), class: "curve__full" }));
  chart.append(svg("line", { x1: x(0.2), x2: x(0.2), y1: T, y2: H - B, class: "curve__top20" }));
  const points = [[0, 0], ...a.curve.points.map((p) => [p.itemShare, p.profitShare])];
  chart.append(svg("path", { d: points.map(([px, py], i) => `${i ? "L" : "M"}${x(px).toFixed(1)} ${y(py).toFixed(1)}`).join(""), class: "curve__line" }));
  const peak = a.curve.peak;
  chart.append(svg("circle", { cx: x(peak.itemShare), cy: y(peak.profitShare), r: 5, class: "curve__peak" }));
  chart.append(svg("text", { x: L + (W - L - R) / 2, y: H - 6, class: "curve__axis", "text-anchor": "middle" }, t("segments.results.curveX")));
  chart.append(svg("text", { x: 14, y: T + (H - T - B) / 2, class: "curve__axis curve__axis--y", "text-anchor": "middle", transform: `rotate(-90 14 ${T + (H - T - B) / 2})` }, t("segments.results.curveY")));

  let desc = t("segments.results.curveDesc", { count: a.top20.count, total: a.rows.length, share: formatPct(a.top20.share) });
  if (peak.rank < a.rows.length) desc += t("segments.results.curvePeak", { peak: formatPct(peak.profitShare), peakCount: peak.rank });
  return h("section", { class: "block", "aria-labelledby": "seg-curve-title" }, title,
    h("p", { class: "block-note", id: "seg-curve-desc" }, desc),
    h("div", { class: "card seg-curve" }, chart,
      h("ul", { class: "curve__legend", "aria-hidden": "true" },
        h("li", { class: "curve__key curve__key--line" }, t("segments.results.legendCurve")),
        h("li", { class: "curve__key curve__key--full" }, t("segments.results.legendFull")),
        h("li", { class: "curve__key curve__key--top" }, t("segments.results.legendTop20")),
        h("li", { class: "curve__key curve__key--peak" }, t("segments.results.legendPeak")))),
    h("p", { class: "learn-note learn-only" }, t("segments.results.curveLearn")));
}

function renderTable(a) {
  const cols = [
    ["rank", (r) => String(r.rank)],
    ["name", (r) => r.name],
    ["revenue", (r) => formatEurFull(r.revenue)],
    ["variableCosts", (r) => formatEurFull(r.variableCosts)],
    ["contribution", (r) => formatEurFull(r.contribution), (r) => toneClass(r.contribution)],
    ["cmRatio", (r) => formatPct(r.cmRatio)],
    ...(a.hasFixedCosts ? [
      ["fixedCosts", (r) => (r.fixedCosts === null ? t("common.dash") : formatEurFull(r.fixedCosts))],
      ["profit", (r) => formatEurFull(r.profit), (r) => toneClass(r.profit)],
    ] : []),
    ["profitShare", (r) => (r.profitShare === null ? t("rating.page.notMeaningful") : formatPct(r.profitShare))],
    ["cumulativeShare", (r) => (r.cumulativeShare === null ? t("rating.page.notMeaningful") : formatPct(r.cumulativeShare))],
  ];
  const head = (id) => (id === "name" ? currentKind().label : t(`segments.table.${id}`));
  return h("section", { class: "block", "aria-labelledby": "seg-table-title" },
    h("h3", { id: "seg-table-title", class: "block-title" }, t("segments.table.title")),
    h("div", { class: "card table-scroll" },
      h("table", { class: "seg-ranked" },
        h("thead", {}, h("tr", {}, cols.map(([id]) => h("th", { scope: "col" }, head(id))))),
        h("tbody", {}, a.rows.map((r) => h("tr", { class: r.lossMaking ? "seg-ranked__loss" : "" },
          cols.map(([id, text, tone]) => (id === "name"
            ? h("th", { scope: "row" }, text(r), r.lossMaking ? h("span", { class: "sr-only" }, t("segments.table.lossSr")) : null)
            : h("td", { class: tone ? tone(r) : "" }, text(r))))))),
        h("tfoot", {}, h("tr", {}, cols.map(([id]) => {
          const tot = a.totals;
          const values = {
            name: t("segments.table.total"), revenue: formatEurFull(tot.revenue), variableCosts: formatEurFull(tot.variableCosts),
            contribution: formatEurFull(tot.contribution), cmRatio: formatPct(tot.cmRatio), fixedCosts: formatEurFull(tot.fixedCosts),
            profit: formatEurFull(tot.profit), profitShare: tot.profit > 0 ? formatPct(1) : "", cumulativeShare: "", rank: "",
          };
          return id === "name" ? h("th", { scope: "row" }, values[id]) : h("td", {}, values[id]);
        }))))));
}

/** Learn mode: how each segment's margin adds up to the company's margin. */
function renderLearn(a) {
  const { rows, total } = a.contributions;
  const profitLabel = a.hasFixedCosts ? t("segments.results.profit") : t("segments.results.contribution");
  return h("section", { class: "block learn-only", "aria-labelledby": "seg-learn-title" },
    h("h3", { id: "seg-learn-title", class: "block-title" }, t("segments.learn.title")),
    h("div", { class: "learn-note" },
      h("p", {}, t("segments.learn.cm")),
      h("p", {}, t("segments.learn.addUp", { profit: profitLabel.toLowerCase(), margin: formatPct(total.margin) })),
      h("div", { class: "table-scroll" }, h("table", { class: "seg-ranked seg-learn" },
        h("thead", {}, h("tr", {},
          h("th", { scope: "col" }, currentKind().label),
          h("th", { scope: "col" }, t("segments.learn.colShare")),
          h("th", { scope: "col" }, t("segments.learn.colMargin")),
          h("th", { scope: "col" }, t("segments.learn.colPoints")))),
        h("tbody", {}, rows.map((r) => h("tr", {},
          h("th", { scope: "row" }, r.label),
          h("td", {}, formatPct(r.revenueShare)),
          h("td", {}, formatPct(r.margin)),
          h("td", { class: toneClass(r.contribution) }, formatPoints(r.contribution))))),
        h("tfoot", {}, h("tr", {},
          h("th", { scope: "row" }, t("segments.table.total")), h("td", {}, formatPct(1)), h("td", {}, formatPct(total.margin)),
          h("td", {}, formatPct(total.margin))))))));
}

function renderMethod() {
  return h("section", { class: "block" },
    h("details", { class: "card method" },
      h("summary", {}, t("segments.method.title")),
      h("ol", { class: "method__steps" },
        h("li", {}, t("segments.method.step1")),
        h("li", {}, t("segments.method.step2")),
        h("li", {}, t("segments.method.step3")),
        h("li", {}, t("segments.method.step4"))),
      h("p", {}, t("rating.page.methodLink"), h("a", { href: "docs/methodology.md#segment-profitability" }, "docs/methodology.md"))));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function start() {
  mountSiteHeader($("site-header"), { active: "segments", root: "./" });
  replaceChildren($("seg-kind"), SEGMENT_KINDS.map((k) => h("option", { value: k.id }, k.label)));
  $("seg-kind").addEventListener("change", () => { showKind(); renderRows(); save(); if (app.analysis) renderResults(); });
  replaceChildren($("seg-example-chips"), SEGMENT_SAMPLES.map((s) => h("button", {
    type: "button", class: "chip", title: s.description, on: { click: () => loadSample(s) },
  }, s.name, h("span", { class: "chip__tag" }, t("common.fictional")))));
  $("seg-add").addEventListener("click", addRow);
  $("seg-clear").addEventListener("click", clearTable);
  const paste = createPasteDialog();
  $("seg-paste").addEventListener("click", () => paste.open());
  listenForFileDrop((file) => paste.open(file));
  $("seg-form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });

  const saved = readJson(STORAGE_KEY);
  if (saved?.version === STORAGE_VERSION && Array.isArray(saved.rows) && saved.rows.length > 0) {
    $("seg-kind").value = SEGMENT_KINDS.some((k) => k.id === saved.kind) ? saved.kind : SEGMENT_KINDS[0].id;
    app.rows = saved.rows.slice(0, MAX_SEGMENTS).map((r) => ({ ...blankRow(), ...Object.fromEntries(COLUMNS.map((c) => [c, String(r?.[c] ?? "")])) }));
  }
  showKind();
  renderRows();
  const filled = app.rows.some((row) => COLUMNS.some((c) => String(row[c]).trim() !== ""));
  if (filled && Object.keys(readRows().errors).length === 0 && !readRows().table) submit({ focus: false });
  else renderResults();
}

start();
