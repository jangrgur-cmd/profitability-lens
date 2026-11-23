// main.js: app bootstrap, tab routing, filter bar and the Overview tab.

import { loadModel } from "./data.js";
import { filterRows, availableFilterValues, summarize, monthlyTotals, channelTotals } from "./calc.js";
import { createTrendChart, updateTrendChart, createMixChart, updateMixChart } from "./charts.js";
import { formatEur, formatPct, formatPerMessage, formatCount, formatInteger } from "./format.js";
import { TABS, parseHash, serializeHash, filtersAreDefault, defaultState } from "./state.js";
import { createRoutesView } from "./routes-view.js";
import { createCustomersView } from "./customers-view.js";

const $ = (id) => document.getElementById(id);

/** Longer channel names for the filter, where the short name is not self-explanatory. */
const CHANNEL_LABELS = { Voice: "Voice (passcode calls)" };

const app = {
  model: null,
  state: defaultState(),
  charts: {},
  views: {},
};

/** Short file-name tag for CSV exports, e.g. "HR_SMS_m3-8" or "all". */
function filterTag({ monthFrom, monthTo, country, channel, category, industry }) {
  const parts = [country, channel, category, industry].filter((v) => v !== "all");
  if (monthFrom !== 1 || monthTo !== 12) parts.push(`m${monthFrom}-${monthTo}`);
  return parts.length ? parts.join("_").replace(/[^\w-]/g, "") : "all";
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

/** Shows the selected tab panel and updates the tab buttons. */
function showTab(tab) {
  for (const name of TABS) {
    const button = $(`tab-${name}`);
    const selected = name === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`panel-${name}`).hidden = !selected;
  }
}

/** Keyboard support for the tab list: arrow keys, Home and End move between tabs. */
function onTabKeydown(event) {
  const index = TABS.indexOf(event.target.dataset.tab);
  const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 };
  if (!(event.key in moves)) return;
  event.preventDefault();
  const next = TABS[(moves[event.key] + TABS.length) % TABS.length];
  setState({ tab: next });
  $(`tab-${next}`).focus();
}

function initTabs() {
  const tablist = $("tablist");
  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest("[role=tab]")?.dataset.tab;
    if (tab) setState({ tab });
  });
  tablist.addEventListener("keydown", onTabKeydown);
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

/** Creates one <option>. */
function makeOption(value, label, disabled = false) {
  const option = document.createElement("option");
  option.value = String(value);
  option.textContent = label;
  option.disabled = disabled;
  return option;
}

/** Fills a <select> with options: [{ value, label }], and remembers the full list. */
function fillSelect(select, options) {
  select.allOptions = options;
  select.replaceChildren(...options.map(({ value, label }) => makeOption(value, label)));
}

/**
 * Rebuilds a dropdown so that options with traffic (given the other filters)
 * come first, and the rest sit in a separate, disabled group at the bottom.
 * The current selection always stays selectable.
 */
function arrangeOptions(select, available, current) {
  const [all, ...values] = select.allOptions;
  const hasTraffic = (o) => available.has(String(o.value)) || String(o.value) === current;
  const withTraffic = values.filter(hasTraffic);
  const withoutTraffic = values.filter((o) => !hasTraffic(o));

  const children = [makeOption(all.value, all.label), ...withTraffic.map((o) => makeOption(o.value, o.label))];
  if (withoutTraffic.length > 0) {
    const group = document.createElement("optgroup");
    group.label = "No traffic with these filters";
    group.append(...withoutTraffic.map((o) => makeOption(o.value, o.label, true)));
    children.push(group);
  }
  select.replaceChildren(...children);
}

function initFilters() {
  const { dimensions, monthLabels } = app.model;
  const months = monthLabels.map((label, i) => ({ value: i + 1, label }));
  fillSelect($("f-from"), months);
  fillSelect($("f-to"), months);
  fillSelect($("f-country"), [
    { value: "all", label: "All countries" },
    ...[...dimensions.countries].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.code, label: c.name })),
  ]);
  fillSelect($("f-channel"), [
    { value: "all", label: "All channels" },
    ...dimensions.channels.map((c) => ({ value: c, label: CHANNEL_LABELS[c] ?? c })),
  ]);
  fillSelect($("f-category"), [
    { value: "all", label: "All categories" },
    ...dimensions.categories.map((c) => ({ value: c.id, label: c.label })),
  ]);
  fillSelect($("f-industry"), [{ value: "all", label: "All industries" }, ...dimensions.industries.map((i) => ({ value: i, label: i }))]);

  $("filters").addEventListener("change", (event) => {
    const { name, value } = event.target;
    const filters = { ...app.state.filters };
    filters[name] = name === "monthFrom" || name === "monthTo" ? Number(value) : value;
    // Keep the month range valid: moving one end past the other moves both.
    if (name === "monthFrom" && filters.monthFrom > filters.monthTo) filters.monthTo = filters.monthFrom;
    if (name === "monthTo" && filters.monthTo < filters.monthFrom) filters.monthFrom = filters.monthTo;
    setState({ filters });
  });
  $("f-reset").addEventListener("click", () => setState({ filters: defaultState().filters }));
}

/**
 * Writes the current filter state back into the form controls. Options that
 * would return no traffic given the other filters move to a disabled group.
 */
function syncFilterControls(filters) {
  const defaults = defaultState().filters;
  const { rows, customersById } = app.model;
  const available = availableFilterValues(rows, filters, customersById);

  for (const [name, value] of Object.entries(filters)) {
    const select = $("filters").elements[name];
    if (available[name]) arrangeOptions(select, available[name], String(value));
    select.value = String(value);
    select.classList.toggle("is-active", value !== defaults[name]);
  }
  $("f-reset").disabled = filtersAreDefault(filters);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/** Describes the selected period, e.g. "Full model year" or "Mar–Jun". */
function periodText({ monthFrom, monthTo }) {
  const labels = app.model.monthLabels;
  if (monthFrom === 1 && monthTo === labels.length) return "Full model year";
  if (monthFrom === monthTo) return labels[monthFrom - 1];
  return `${labels[monthFrom - 1]}–${labels[monthTo - 1]}`;
}

/** Describes the filtered slice, e.g. "SMS in Nigeria, marketing, Banking customers". */
function scopeText({ country, channel, category, industry }) {
  const { countryNames, categoryLabels } = app.model;
  const parts = [];
  const where = country === "all" ? null : `in ${countryNames[country]}`;
  const channelName = channel === "Voice" ? "voice passcode calls" : channel;
  if (channel !== "all") parts.push(where ? `${channelName} ${where}` : channelName);
  else if (where) parts.push(`all channels ${where}`);
  if (category !== "all") parts.push(`${categoryLabels[category].toLowerCase()} traffic`);
  if (industry !== "all") parts.push(`${industry} customers`);
  return parts.length ? parts.join(", ") : "all traffic";
}

/** Builds the headline sentence. Profit or loss is stated in words, not only by colour. */
function renderStatement(totals, filters) {
  const el = $("statement");
  const lead = `${periodText(filters)}, ${scopeText(filters)}: `;
  el.replaceChildren();
  const scope = document.createElement("span");
  scope.className = "scope";
  scope.textContent = lead;
  el.append(scope);

  if (totals.volume === 0) {
    el.append("no traffic matches these filters. Widen the month range or set a filter back to All.");
    return;
  }
  const isLoss = totals.grossProfit < 0;
  const figure = document.createElement("span");
  figure.className = `figure figure--${isLoss ? "loss" : "profit"}`;
  figure.textContent = isLoss
    ? `a ${formatEur(Math.abs(totals.grossProfit))} gross loss`
    : `${formatEur(totals.grossProfit)} gross profit`;
  el.append(figure, ` on ${formatEur(totals.revenue)} revenue, a ${formatPct(totals.grossMarginPct)} margin.`);
}

/** Renders the row of five headline figures. */
function renderKpis(totals) {
  const isLoss = totals.grossProfit < 0;
  const items = [
    { label: "Revenue", value: formatEur(totals.revenue), detail: "after customer discounts" },
    {
      label: "Gross profit",
      value: formatEur(totals.grossProfit),
      loss: isLoss,
      detail: `after ${formatEur(totals.deliveryCost)} delivery and ${formatEur(totals.platformCost)} platform cost`,
    },
    { label: "Gross margin", value: formatPct(totals.grossMarginPct), loss: isLoss, detail: "gross profit ÷ revenue" },
    { label: "Messages", value: formatCount(totals.volume), detail: `${formatInteger(totals.volume)} (voice counted per call)` },
    {
      label: "Revenue per message",
      value: formatPerMessage(totals.revenuePerMessage),
      detail: `cost ${formatPerMessage(totals.costPerMessage)}`,
    },
  ];
  $("kpis").replaceChildren(
    ...items.map((item) => {
      const group = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = item.label;
      const dd = document.createElement("dd");
      const value = document.createElement("span");
      value.className = `value${item.loss ? " value--loss" : ""}`;
      value.textContent = item.value;
      if (item.loss) {
        const mark = document.createElement("span");
        mark.className = "loss-mark";
        mark.textContent = "▼ loss";
        value.append(mark);
      }
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = item.detail;
      dd.append(value, detail);
      group.append(dt, dd);
      return group;
    }),
  );
}

function renderOverview(rows) {
  const { filters } = app.state;
  const { ctx, monthLabels, dimensions } = app.model;
  const totals = summarize(rows, ctx);
  renderStatement(totals, filters);
  renderKpis(totals);

  if (!app.charts.trend) app.charts.trend = createTrendChart($("trend-chart"));
  if (!app.charts.mix) app.charts.mix = createMixChart($("mix-chart"), dimensions.channels);

  const months = monthlyTotals(rows, ctx, monthLabels.length).slice(filters.monthFrom - 1, filters.monthTo);
  updateTrendChart(app.charts.trend, months, monthLabels);

  const note = updateMixChart(app.charts.mix, channelTotals(rows, ctx));
  $("mix-note").hidden = !note;
  $("mix-note").textContent = note ?? "";
}

// ---------------------------------------------------------------------------
// State and rendering
// ---------------------------------------------------------------------------

/** Merges a change into the state, stores it in the URL hash and re-renders. */
function setState(change) {
  app.state = { ...app.state, ...change };
  const hash = serializeHash(app.state);
  if (hash !== location.hash && !(hash === "" && location.hash === "")) {
    history.replaceState(null, "", hash || location.pathname + location.search);
  }
  render();
}

function render() {
  const { model, state } = app;
  showTab(state.tab);
  syncFilterControls(state.filters);

  const rows = filterRows(model.rows, state.filters, model.customersById);
  $("filter-count").textContent = `${formatInteger(rows.length)} of ${formatInteger(model.rows.length)} traffic rows`;

  const tag = filterTag(state.filters);
  if (state.tab === "overview") renderOverview(rows);
  if (state.tab === "routes") app.views.routes.render(rows, tag);
  if (state.tab === "customers") app.views.customers.render(rows, tag);
}

async function init() {
  initTabs();
  try {
    app.model = await loadModel();
  } catch (error) {
    const box = $("load-error");
    box.hidden = false;
    box.textContent = `The data could not be loaded: ${error.message}. Open the page through a local web server (for example "npx serve .") rather than as a file.`;
    return;
  }
  initFilters();
  app.views.routes = createRoutesView(app.model);
  app.views.customers = createCustomersView(app.model);
  app.state = parseHash(location.hash, app.model.dimensions);
  window.addEventListener("hashchange", () => {
    app.state = parseHash(location.hash, app.model.dimensions);
    render();
  });
  render();
}

init();
