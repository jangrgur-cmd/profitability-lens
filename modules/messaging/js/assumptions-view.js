// assumptions-view.js: the Assumptions & method tab.

import { createSortableTable } from "./tables.js";
import { toCsv, downloadCsv } from "./export.js";
import { STEPS } from "./scenarios.js";
import { formatCount, formatPct } from "../../../src/shared/format.js";
import { t } from "../../../src/shared/i18n.js";

const $ = (id) => document.getElementById(id);

/** Assumption statuses; their labels are seg.assumptions.status<Status> in the language files. */
const STATUSES = ["sourced", "estimated", "placeholder"];
const statusLabel = (status) => (STATUSES.includes(status)
  ? t(`seg.assumptions.status${status[0].toUpperCase()}${status.slice(1)}`)
  : status);

/** Creates an element with optional class and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Shows a value as stored: numbers without rounding noise (in the language's decimal separator), text as is. */
function showValue(value) {
  return typeof value === "number" ? String(Number(value.toPrecision(6))).replace(".", t("format.decimal")) : String(value);
}

/** Status as a word inside a tinted badge (the word carries the meaning, not the colour). */
function statusBadge(status) {
  return el("span", `status status--${status}`, statusLabel(status));
}

/** Link to the source page, labelled with its site name. */
function sourceLink(url) {
  if (!url) return el("span", "muted", "—");
  const link = el("a", "", new URL(url).hostname.replace(/^www\./, ""));
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.title = url;
  return link;
}

/**
 * Does an assumption match the global filters? Assumptions only have some of
 * the dimensions (e.g. FX has none), so a filter only applies where the
 * assumption carries that field.
 */
function matchesFilters(a, { country, channel, category, industry }) {
  const ok = (field, value) => value === "all" || a[field] === undefined || a[field] === value;
  return ok("country", country) && ok("channel", channel) && ok("category", category) && ok("industry", industry);
}

export function createAssumptionsView(model) {
  const { assumptions, customers, countryNames, customerNames } = model;
  let filters = null;

  // --- Group and status selects ----------------------------------------------------

  const groups = [...new Set(assumptions.map((a) => a.group))];
  const groupSelect = $("a-group");
  groupSelect.replaceChildren(el("option", "", t("seg.assumptions.allGroups")), ...groups.map((g) => {
    const option = el("option", "", model.assumptionGroupName(g));
    option.value = g;
    return option;
  }));
  groupSelect.options[0].value = "all";
  const statusSelect = $("a-status");
  statusSelect.replaceChildren(el("option", "", t("seg.assumptions.allStatuses")), ...STATUSES.map((v) => {
    const o = el("option", "", statusLabel(v));
    o.value = v;
    return o;
  }));
  statusSelect.options[0].value = "all";
  for (const select of [groupSelect, statusSelect]) select.addEventListener("change", () => filters && render(filters));

  // --- Assumptions table -------------------------------------------------------------

  const columns = [
    { key: "label", label: t("seg.assumptions.colAssumption"), type: "text", className: "wrap-label" },
    { key: "value", label: t("seg.assumptions.colValue"), type: "number", value: (a) => (typeof a.value === "number" ? a.value : null), format: (_, a) => showValue(a.value) },
    { key: "unit", label: t("seg.assumptions.colUnit"), type: "text", className: "wrap-unit" },
    { key: "status", label: t("seg.assumptions.colStatus"), type: "text", cell: (a) => statusBadge(a.status) },
    { key: "source", label: t("seg.assumptions.colSource"), type: "text", cell: (a) => sourceLink(a.source) },
    { key: "note", label: t("seg.assumptions.colNote"), type: "text", className: "wrap-note" },
  ];
  const table = createSortableTable($("assumptions-table"), {
    columns,
    caption: t("seg.assumptions.tableCaption"),
    sort: { key: "label", direction: "asc" },
  });
  const csvColumns = ["id", "group", "label", "value", "unit", "status", "source", "note"].map((key) => ({ label: key, key }));
  $("assumptions-csv").addEventListener("click", () => downloadCsv("assumptions.csv", toCsv(csvColumns, table.sortedRows())));

  // --- Customer archetypes table --------------------------------------------------------

  const archetypeColumns = [
    { key: "name", label: t("seg.assumptions.colCustomer"), type: "text", value: (c) => customerNames[c.id] },
    { key: "industry", label: t("seg.assumptions.colIndustry"), type: "text", value: (c) => model.industryName(c.industry) },
    { key: "home", label: t("seg.assumptions.colHome"), type: "text", value: (c) => countryNames[c.home_country] },
    { key: "size_tier", label: t("seg.assumptions.colSize"), type: "text", value: (c) => model.sizeName(c.size_tier) },
    { key: "discount", label: t("seg.assumptions.colDiscount"), type: "number", value: (c) => model.ctx.discountByCustomer[c.id], format: formatPct },
    { key: "base_monthly_volume", label: t("seg.assumptions.colVolume"), type: "number", format: formatCount },
    { key: "volume_note", label: t("seg.assumptions.colVolumeNote"), type: "text", className: "wrap-note", value: (c) => c.volume_note.replace(/^Estimated: /, "") },
  ];
  const archetypes = createSortableTable($("archetypes-table"), {
    columns: archetypeColumns,
    caption: t("seg.assumptions.archetypesCaption"),
    sort: { key: "base_monthly_volume", direction: "desc" },
  });
  const archetypeCsv = [
    { label: "customer_id", key: "id" }, { label: "customer", key: "name" }, { label: "industry", key: "industry" },
    { label: "home_country", key: "home_country" }, { label: "size_tier", key: "size_tier" },
    { label: "discount_tier", key: "discount_tier" }, { label: "base_monthly_volume", key: "base_monthly_volume" },
    { label: "countries", csv: (c) => Object.keys(c.footprint.countries).join(" ") },
    { label: "channels", csv: (c) => c.footprint.channels.join(" ") },
    { label: "volume_note", key: "volume_note" },
  ];
  $("archetypes-csv").addEventListener("click", () => downloadCsv("customer_archetypes.csv", toCsv(archetypeCsv, archetypes.sortedRows())));

  // --- Scenario order (from the engine itself, so it cannot drift) ---------------------

  $("method-steps").replaceChildren(...STEPS.map((step) => {
    const li = el("li");
    li.append(el("strong", "", step.label), ` ${step.description}`);
    return li;
  }));

  /** A customer matches the filters if its footprint and industry do. */
  function customerMatches(c, f) {
    return (
      (f.country === "all" || f.country in c.footprint.countries) &&
      (f.channel === "all" || c.footprint.channels.includes(f.channel)) &&
      (f.industry === "all" || c.industry === f.industry)
    );
  }

  /** @param {object} currentFilters the global filter state */
  function render(currentFilters) {
    filters = currentFilters;
    const shown = assumptions.filter(
      (a) =>
        (groupSelect.value === "all" || a.group === groupSelect.value) &&
        (statusSelect.value === "all" || a.status === statusSelect.value) &&
        matchesFilters(a, filters),
    );
    table.render(shown);
    archetypes.render(customers.filter((c) => customerMatches(c, filters)));

    const count = (s) => assumptions.filter((a) => a.status === s).length;
    const narrowed = shown.length < assumptions.length ? t("seg.assumptions.narrowed", { count: shown.length }) : "";
    $("assumptions-summary").textContent = t("seg.assumptions.summary", {
      total: assumptions.length, sourced: count("sourced"), estimated: count("estimated"), placeholder: count("placeholder"),
    }) + narrowed + t("seg.assumptions.sourceLanguageNote");
  }

  return { render };
}
