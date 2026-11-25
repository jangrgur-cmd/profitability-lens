// customers-view.js: the Customers tab (whale curve, customer table, detail panel).

import { customerProfitability, whaleCurve, routeProfitability } from "./calc.js";
import { createSortableTable } from "./tables.js";
import { toCsv, downloadCsv } from "./export.js";
import { createWhaleChart, updateWhaleChart, chartOn } from "./charts.js";
import { formatEur, formatPct, formatCount, toneClass } from "../../../src/shared/format.js";
import { t } from "../../../src/shared/i18n.js";

const $ = (id) => document.getElementById(id);

/** Creates an element with optional class and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createCustomersView(model) {
  const { customersById, countryNames, customerNames } = model;
  const nameOf = (id) => customerNames[id] ?? id;
  let selectedId = null;
  let currentRows = [];
  let fileTag = "all";

  /** Shows a customer in the detail panel above the table and brings the panel into view. */
  const selectCustomer = (id) => {
    selectedId = id;
    render(currentRows, fileTag);
    const panel = $("customer-detail");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    panel.focus({ preventScroll: true });
  };

  const columns = [
    {
      key: "name", label: t("seg.customers.colCustomer"), type: "text",
      value: (c) => nameOf(c.customer_id),
      cell: (c) => {
        const button = el("button", "row-button", nameOf(c.customer_id));
        button.type = "button";
        button.setAttribute("aria-pressed", String(c.customer_id === selectedId));
        button.addEventListener("click", () => selectCustomer(c.customer_id));
        return button;
      },
    },
    { key: "industry", label: t("seg.customers.colIndustry"), type: "text", value: (c) => model.industryName(customersById[c.customer_id].industry) },
    { key: "tier", label: t("seg.customers.colSize"), type: "text", value: (c) => model.sizeName(customersById[c.customer_id].size_tier) },
    { key: "discount", label: t("seg.customers.colDiscount"), type: "number", format: (v) => formatPct(v) },
    { key: "revenue", label: t("seg.customers.colRevenue"), type: "number", format: formatEur },
    { key: "grossProfit", label: t("seg.customers.colGrossProfit"), type: "number", format: formatEur },
    {
      key: "grossMarginPct", label: t("seg.customers.colMargin"), type: "number",
      cell: (c) => {
        const span = el("span", toneClass(c.grossMarginPct), formatPct(c.grossMarginPct));
        if (c.lossMaking) span.append(el("span", "loss-badge", t("seg.customers.lossBadge")));
        return span;
      },
    },
  ];
  const csvColumns = [
    { label: "rank_by_gross_profit", key: "rank" },
    { label: "customer_id", key: "customer_id" },
    { label: "customer", csv: (c) => nameOf(c.customer_id) },
    { label: "industry", csv: (c) => customersById[c.customer_id].industry },
    { label: "home_country", csv: (c) => customersById[c.customer_id].home_country },
    { label: "size_tier", csv: (c) => customersById[c.customer_id].size_tier },
    { label: "discount", key: "discount" },
    { label: "messages", key: "volume" },
    { label: "revenue_eur", key: "revenue" },
    { label: "delivery_cost_eur", key: "deliveryCost" },
    { label: "platform_cost_eur", key: "platformCost" },
    { label: "gross_profit_eur", key: "grossProfit" },
    { label: "gross_margin", key: "grossMarginPct" },
  ];

  const table = createSortableTable($("customers-table"), {
    columns,
    caption: t("seg.customers.tableCaption"),
    sort: { key: "grossProfit", direction: "desc" },
    rowClass: (c) => (c.lossMaking ? "is-loss" : ""),
    isSelected: (c) => c.customer_id === selectedId,
    onRowClick: (c) => selectCustomer(c.customer_id),
  });
  $("customers-csv").addEventListener("click", () => {
    downloadCsv(`customers_${fileTag}.csv`, toCsv(csvColumns, table.sortedRows()));
  });
  $("customer-detail").tabIndex = -1;

  /** One-sentence summary: how concentrated profit is, and whether anyone loses money. */
  function renderSummary(customers, curve) {
    const box = $("customers-summary");
    if (customers.length === 0) {
      box.textContent = t("seg.customers.none");
      return;
    }
    const losers = customers.filter((c) => c.lossMaking);
    const n = customers.length;
    const topCount = Math.max(1, Math.round(n * 0.2));
    const topShare = curve.points[topCount - 1]?.profitSharePct;
    let concentration = "";
    if (n === 1) concentration = t("seg.customers.onlyOne", { name: nameOf(customers[0].customer_id) });
    else if (topShare !== null && topShare !== undefined) {
      concentration = topCount === 1
        ? t("seg.customers.topOne", { count: n, share: formatPct(topShare) })
        : t("seg.customers.top", { top: topCount, count: n, share: formatPct(topShare) });
    }
    const loss = losers.length === 0
      ? t("seg.customers.noLosers")
      : t("seg.customers.losers", { count: losers.length, names: losers.map((c) => nameOf(c.customer_id)).join(t("common.listSeparator")) });
    box.textContent = concentration + loss;
  }

  /** The panel above the table: one customer's figures and where its profit comes from. */
  function renderDetail(customers) {
    const panel = $("customer-detail");
    if (!selectedId) {
      panel.replaceChildren(el("p", "detail-empty", t("seg.customers.selectPrompt")));
      return;
    }
    const customer = customersById[selectedId];
    const totals = customers.find((c) => c.customer_id === selectedId);
    const heading = el("h3", "", nameOf(selectedId));
    const discount = model.ctx.discountByCustomer[selectedId];
    const discountText = discount > 0 ? t("seg.customers.discount", { share: formatPct(discount) }) : t("seg.customers.noDiscount");
    const meta = el("p", "detail-meta",
      [model.industryName(customer.industry), countryNames[customer.home_country], model.sizeName(customer.size_tier), discountText].join(" · "));
    // The volume note is data (English in every language, like the assumption notes).
    const note = el("p", "detail-note", customer.volume_note);
    note.lang = "en";
    if (!totals) {
      panel.replaceChildren(heading, meta, el("p", "detail-empty", t("seg.customers.noTraffic")));
      return;
    }

    const kpis = el("dl");
    const add = (label, value, tone = "") => {
      const wrap = el("div");
      wrap.append(el("dt", "", label), el("dd", tone, value));
      kpis.append(wrap);
    };
    add(t("seg.customers.revenue"), formatEur(totals.revenue));
    add(t("seg.customers.grossProfit"), formatEur(totals.grossProfit), toneClass(totals.grossProfit));
    add(t("seg.customers.margin"), `${formatPct(totals.grossMarginPct)}${totals.lossMaking ? t("seg.customers.lossSuffix") : ""}`, toneClass(totals.grossMarginPct));
    add(t("seg.customers.messages"), formatCount(totals.volume));

    const routes = routeProfitability(currentRows.filter((r) => r.customer_id === selectedId), model.ctx)
      .sort((a, b) => b.revenue - a.revenue);
    const breakdown = el("table");
    breakdown.append(el("caption", "", t("seg.customers.byRoute")));
    const head = el("tr");
    for (const [label, num] of [[t("seg.customers.route"), false], [t("seg.customers.revenue"), true], [t("seg.customers.margin"), true]]) {
      const th = el("th", num ? "num" : "", label);
      th.scope = "col";
      head.append(th);
    }
    breakdown.append(head);
    for (const r of routes) {
      const tr = el("tr");
      const th = el("th", "", t("seg.routes.routeName", { country: countryNames[r.country], channel: model.channelName(r.channel) }));
      th.scope = "row";
      tr.append(th, el("td", "num", formatEur(r.revenue)), el("td", `num ${toneClass(r.grossMarginPct)}`.trim(), `${r.lossMaking ? "▼ " : ""}${formatPct(r.grossMarginPct)}`));
      breakdown.append(tr);
    }
    panel.replaceChildren(heading, meta, note, kpis, breakdown);
  }

  /**
   * @param {object[]} rows filtered traffic rows
   * @param {string} tag short text describing the filters, used in the CSV file name
   */
  function render(rows, tag) {
    currentRows = rows;
    fileTag = tag;
    const customers = customerProfitability(rows, model.ctx);
    const curve = whaleCurve(customers);
    const chart = chartOn($("whale-chart")) ?? createWhaleChart($("whale-chart"));
    $("whale-note").textContent = updateWhaleChart(chart, curve, nameOf);
    renderSummary(customers, curve);
    table.render(customers);
    renderDetail(customers);
  }

  return { render };
}
