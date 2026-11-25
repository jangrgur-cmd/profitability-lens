// main.js: app bootstrap, tab routing, filter bar and the Overview tab.

import { loadModel } from "./data.js";
import { filterRows, availableFilterValues, summarize, monthlyTotals, channelTotals } from "./calc.js";
import { createTrendChart, updateTrendChart, createMixChart, updateMixChart, restyleCharts, chartOn } from "./charts.js";
import { formatEur, formatPct, formatPerMessage, formatCount, formatInteger, toneClass } from "../../../src/shared/format.js";
import { TABS, parseHash, serializeHash, filtersAreDefault, defaultState } from "./state.js";
import { createRoutesView } from "./routes-view.js";
import { createCustomersView } from "./customers-view.js";
import { createScenariosView } from "./scenarios-view.js";
import { createAssumptionsView } from "./assumptions-view.js";
import { createChecksView } from "./checks-view.js";
import { renderMarginContributions, initHandoffLink } from "./learn-view.js";
import { mountSiteHeader } from "../../../src/shared/site-header.js";
import { isLearnMode } from "../../../src/shared/prefs.js";
import { t, hasText } from "../../../src/shared/i18n.js";
import { inCountry } from "./labels.js";

const $ = (id) => document.getElementById(id);

/** Longer channel name for the filter, where the short name is not self-explanatory (seg.channelLong). */
const channelFilterLabel = (channel) => (hasText(`seg.channelLong.${channel}`) ? t(`seg.channelLong.${channel}`) : app.model.channelName(channel));

const app = {
  model: null,
  state: defaultState(),
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
    group.label = t("seg.filters.noTraffic");
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
    { value: "all", label: t("seg.filters.allCountries") },
    ...[...dimensions.countries].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.code, label: c.name })),
  ]);
  fillSelect($("f-channel"), [
    { value: "all", label: t("seg.filters.allChannels") },
    ...dimensions.channels.map((c) => ({ value: c, label: channelFilterLabel(c) })),
  ]);
  fillSelect($("f-category"), [
    { value: "all", label: t("seg.filters.allCategories") },
    ...dimensions.categories.map((c) => ({ value: c.id, label: app.model.categoryLabels[c.id] })),
  ]);
  fillSelect($("f-industry"), [
    { value: "all", label: t("seg.filters.allIndustries") },
    ...dimensions.industries.map((i) => ({ value: i, label: app.model.industryName(i) })),
  ]);

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
  if (monthFrom === 1 && monthTo === labels.length) return t("seg.overview.fullYear");
  if (monthFrom === monthTo) return labels[monthFrom - 1];
  return `${labels[monthFrom - 1]}–${labels[monthTo - 1]}`;
}

/** Describes the filtered slice, e.g. "SMS in Germany, marketing traffic, Banking customers". */
function scopeText({ country, channel, category, industry }) {
  const { countryNames, categoryLabels } = app.model;
  const parts = [];
  const where = country === "all" ? null : inCountry(country, countryNames[country]);
  const channelName = channel === "Voice" ? t("seg.overview.voiceInSentence") : app.model.channelName(channel);
  if (channel !== "all") parts.push(where ? t("seg.overview.channelIn", { channel: channelName, where }) : channelName);
  else if (where) parts.push(t("seg.overview.allChannelsIn", { where }));
  if (category !== "all") parts.push(t("seg.overview.categoryTraffic", { category: categoryLabels[category].toLowerCase() }));
  if (industry !== "all") parts.push(t("seg.overview.industryCustomers", { industry: app.model.industryName(industry) }));
  return parts.length ? parts.join(t("common.listSeparator")) : t("seg.overview.allTraffic");
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
    el.append(t("seg.overview.noTraffic"));
    return;
  }
  const isLoss = totals.grossProfit < 0;
  const figure = document.createElement("span");
  figure.className = `figure figure--${isLoss ? "loss" : "profit"}`;
  figure.textContent = isLoss
    ? t("seg.overview.grossLoss", { amount: formatEur(Math.abs(totals.grossProfit)) })
    : t("seg.overview.grossProfit", { amount: formatEur(totals.grossProfit) });
  const margin = document.createElement("span");
  margin.className = toneClass(totals.grossMarginPct);
  margin.textContent = formatPct(totals.grossMarginPct);
  el.append(figure, t("seg.overview.onRevenue", { amount: formatEur(totals.revenue) }), margin, t("seg.overview.margin"));
}

/** Renders the row of five headline figures. */
function renderKpis(totals) {
  const isLoss = totals.grossProfit < 0;
  const items = [
    { label: t("seg.overview.kpiRevenue"), value: formatEur(totals.revenue), detail: t("seg.overview.kpiRevenueDetail") },
    {
      label: t("seg.overview.kpiGrossProfit"),
      value: formatEur(totals.grossProfit),
      tone: toneClass(totals.grossProfit),
      loss: isLoss,
      detail: t("seg.overview.kpiGrossProfitDetail", { delivery: formatEur(totals.deliveryCost), platform: formatEur(totals.platformCost) }),
    },
    {
      label: t("seg.overview.kpiMargin"), value: formatPct(totals.grossMarginPct), tone: toneClass(totals.grossMarginPct), loss: isLoss,
      detail: t("seg.overview.kpiMarginDetail"),
    },
    { label: t("seg.overview.kpiMessages"), value: formatCount(totals.volume), detail: t("seg.overview.kpiMessagesDetail", { count: formatInteger(totals.volume) }) },
    {
      label: t("seg.overview.kpiRevenuePerMessage"),
      value: formatPerMessage(totals.revenuePerMessage),
      detail: t("seg.overview.kpiCostPerMessage", { cost: formatPerMessage(totals.costPerMessage) }),
    },
  ];
  $("kpis").replaceChildren(
    ...items.map((item) => {
      const group = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = item.label;
      const dd = document.createElement("dd");
      const value = document.createElement("span");
      value.className = `value ${item.tone ?? ""}`.trim();
      value.textContent = item.value;
      if (item.loss) {
        const mark = document.createElement("span");
        mark.className = "loss-mark";
        mark.textContent = t("seg.overview.lossMark");
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

  const trendChart = chartOn($("trend-chart")) ?? createTrendChart($("trend-chart"));
  const mixChart = chartOn($("mix-chart")) ?? createMixChart($("mix-chart"), dimensions.channels, app.model.channelName);

  const months = monthlyTotals(rows, ctx, monthLabels.length).slice(filters.monthFrom - 1, filters.monthTo);
  updateTrendChart(trendChart, months, monthLabels);

  const note = updateMixChart(mixChart, channelTotals(rows, ctx));
  $("mix-note").hidden = !note;
  $("mix-note").textContent = note ?? "";
  if (isLearnMode()) renderMarginContributions(rows, ctx, app.model.channelName);
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
  // Tabs work before the data has loaded (or if it failed to load); there is nothing else to draw yet.
  if (!model) return;
  syncFilterControls(state.filters);

  const rows = filterRows(model.rows, state.filters, model.customersById);
  $("filter-count").textContent = t("seg.filters.rowCount", { shown: formatInteger(rows.length), total: formatInteger(model.rows.length) });

  const tag = filterTag(state.filters);
  if (state.tab === "overview") renderOverview(rows);
  if (state.tab === "routes") app.views.routes.render(rows, tag);
  if (state.tab === "customers") app.views.customers.render(rows, tag);
  if (state.tab === "scenarios") app.views.scenarios.render(state);
  if (state.tab === "assumptions") app.views.assumptions.render(state.filters);
  if (state.tab === "checks") app.views.checks.render(rows);
}

async function init() {
  mountSiteHeader($("site-header"), { active: "messaging", root: "../../" });
  initTabs();
  try {
    app.model = await loadModel();
  } catch (error) {
    const box = $("load-error");
    box.hidden = false;
    box.textContent = t("seg.loadError", { message: error.message });
    return;
  }
  initFilters();
  app.views.routes = createRoutesView(app.model);
  app.views.customers = createCustomersView(app.model);
  app.views.scenarios = createScenariosView(app.model, (scenario) => setState({ scenario }));
  app.views.assumptions = createAssumptionsView(app.model);
  app.views.checks = createChecksView(app.model);
  initHandoffLink(app.model);
  app.state = parseHash(location.hash, app.model.dimensions);
  window.addEventListener("learnmodechange", render);
  window.addEventListener("themechange", () => {
    // Charts read their colours when they are created: rebuild them in the new theme.
    restyleCharts();
    render();
  });
  window.addEventListener("hashchange", () => {
    app.state = parseHash(location.hash, app.model.dimensions);
    render();
  });
  render();
}

init();
