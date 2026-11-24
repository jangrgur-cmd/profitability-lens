// assumptions-view.js: the Assumptions & method tab.

import { createSortableTable } from "./tables.js";
import { toCsv, downloadCsv } from "./export.js";
import { STEPS } from "./scenarios.js";
import { formatCount, formatPct } from "../../../src/shared/format.js";

const $ = (id) => document.getElementById(id);

const STATUS_LABELS = { sourced: "Sourced", estimated: "Estimated", placeholder: "Placeholder" };

/** Creates an element with optional class and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Shows a value as stored: numbers without rounding noise, text as is. */
function showValue(value) {
  return typeof value === "number" ? String(Number(value.toPrecision(6))) : String(value);
}

/** Status as a word inside a tinted badge (the word carries the meaning, not the colour). */
function statusBadge(status) {
  return el("span", `status status--${status}`, STATUS_LABELS[status] ?? status);
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
  const { assumptions, customers, countryNames } = model;
  let filters = null;

  // --- Group and status selects ----------------------------------------------------

  const groups = [...new Set(assumptions.map((a) => a.group))];
  const groupSelect = $("a-group");
  groupSelect.replaceChildren(el("option", "", "All groups"), ...groups.map((g) => el("option", "", g)));
  groupSelect.options[0].value = "all";
  const statusSelect = $("a-status");
  statusSelect.replaceChildren(el("option", "", "All statuses"), ...Object.entries(STATUS_LABELS).map(([v, l]) => {
    const o = el("option", "", l);
    o.value = v;
    return o;
  }));
  statusSelect.options[0].value = "all";
  for (const select of [groupSelect, statusSelect]) select.addEventListener("change", () => filters && render(filters));

  // --- Assumptions table -------------------------------------------------------------

  const columns = [
    { key: "label", label: "Assumption", type: "text", className: "wrap-label" },
    { key: "value", label: "Value", type: "number", value: (a) => (typeof a.value === "number" ? a.value : null), format: (_, a) => showValue(a.value) },
    { key: "unit", label: "Unit", type: "text", className: "wrap-unit" },
    { key: "status", label: "Status", type: "text", cell: (a) => statusBadge(a.status) },
    { key: "source", label: "Source", type: "text", cell: (a) => sourceLink(a.source) },
    { key: "note", label: "Note", type: "text", className: "wrap-note" },
  ];
  const table = createSortableTable($("assumptions-table"), {
    columns,
    caption: "Every input assumption with its value, unit, status and source",
    sort: { key: "label", direction: "asc" },
  });
  const csvColumns = ["id", "group", "label", "value", "unit", "status", "source", "note"].map((key) => ({ label: key, key }));
  $("assumptions-csv").addEventListener("click", () => downloadCsv("assumptions.csv", toCsv(csvColumns, table.sortedRows())));

  // --- Customer archetypes table --------------------------------------------------------

  const archetypeColumns = [
    { key: "name", label: "Customer", type: "text" },
    { key: "industry", label: "Industry", type: "text" },
    { key: "home", label: "Home", type: "text", value: (c) => countryNames[c.home_country] },
    { key: "size_tier", label: "Size", type: "text" },
    { key: "discount", label: "Discount", type: "number", value: (c) => model.ctx.discountByCustomer[c.id], format: formatPct },
    { key: "base_monthly_volume", label: "Messages a month", type: "number", format: formatCount },
    { key: "volume_note", label: "How the volume was estimated", type: "text", className: "wrap-note", value: (c) => c.volume_note.replace(/^Estimated: /, "") },
  ];
  const archetypes = createSortableTable($("archetypes-table"), {
    columns: archetypeColumns,
    caption: "Customer archetypes with their estimated monthly volume",
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
    const narrowed = shown.length < assumptions.length ? ` Showing ${shown.length} that match the filters.` : "";
    $("assumptions-summary").textContent =
      `${assumptions.length} assumptions: ${count("sourced")} read from public sources, ${count("estimated")} estimated ` +
      `with the reasoning in the note, ${count("placeholder")} placeholders.${narrowed}`;
  }

  return { render };
}
