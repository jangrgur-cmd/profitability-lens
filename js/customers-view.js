// customers-view.js: the Customers tab (whale curve, customer table, detail panel).

import { customerProfitability, whaleCurve, routeProfitability } from "./calc.js";
import { createSortableTable } from "./tables.js";
import { toCsv, downloadCsv } from "./export.js";
import { createWhaleChart, updateWhaleChart } from "./charts.js";
import { formatEur, formatPct, formatCount } from "./format.js";

const $ = (id) => document.getElementById(id);

/** Creates an element with optional class and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createCustomersView(model) {
  const { customersById, countryNames } = model;
  const nameOf = (id) => customersById[id]?.name ?? id;
  let selectedId = null;
  let currentRows = [];
  let fileTag = "all";
  let chart = null;

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
      key: "name", label: "Customer", type: "text",
      value: (c) => nameOf(c.customer_id),
      cell: (c) => {
        const button = el("button", "row-button", nameOf(c.customer_id));
        button.type = "button";
        button.setAttribute("aria-pressed", String(c.customer_id === selectedId));
        button.addEventListener("click", () => selectCustomer(c.customer_id));
        return button;
      },
    },
    { key: "industry", label: "Industry", type: "text", value: (c) => customersById[c.customer_id].industry },
    { key: "tier", label: "Size", type: "text", value: (c) => customersById[c.customer_id].size_tier },
    { key: "discount", label: "Discount", type: "number", format: (v) => formatPct(v) },
    { key: "revenue", label: "Revenue", type: "number", format: formatEur },
    { key: "grossProfit", label: "Gross profit", type: "number", format: formatEur },
    {
      key: "grossMarginPct", label: "Margin", type: "number",
      cell: (c) => {
        const span = el("span", "", formatPct(c.grossMarginPct));
        if (c.lossMaking) span.append(el("span", "loss-badge", "▼ Loss"));
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
    caption: "Customers ranked by gross profit",
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
      box.textContent = "No customers have traffic with these filters.";
      return;
    }
    const losers = customers.filter((c) => c.lossMaking);
    const topCount = Math.max(1, Math.round(customers.length * 0.2));
    const topShare = curve.points[topCount - 1]?.profitSharePct;
    const concentration = topShare === null || topShare === undefined
      ? ""
      : `The top ${topCount} of ${customers.length} customers earn ${formatPct(topShare)} of gross profit. `;
    const loss = losers.length === 0
      ? "None loses money in this selection."
      : `${losers.length} ${losers.length === 1 ? "customer loses" : "customers lose"} money: ${losers.map((c) => nameOf(c.customer_id)).join(", ")}.`;
    box.textContent = concentration + loss;
  }

  /** The panel on the right: one customer's figures and where its profit comes from. */
  function renderDetail(customers) {
    const panel = $("customer-detail");
    if (!selectedId) {
      panel.replaceChildren(el("p", "detail-empty", "Select a customer in the table to see where its revenue and profit come from."));
      return;
    }
    const customer = customersById[selectedId];
    const totals = customers.find((c) => c.customer_id === selectedId);
    const heading = el("h3", "", customer.name);
    const discountText = formatPct(model.ctx.discountByCustomer[selectedId]);
    const meta = el("p", "detail-meta", `${customer.industry} · ${countryNames[customer.home_country]} · ${customer.size_tier} · ${discountText} volume discount`);
    const note = el("p", "detail-note", customer.volume_note);
    if (!totals) {
      panel.replaceChildren(heading, meta, el("p", "detail-empty", "This customer has no traffic with the current filters."));
      return;
    }

    const kpis = el("dl");
    const add = (label, value, loss = false) => {
      const wrap = el("div");
      wrap.append(el("dt", "", label), el("dd", loss ? "is-loss" : "", value));
      kpis.append(wrap);
    };
    add("Revenue", formatEur(totals.revenue));
    add("Gross profit", formatEur(totals.grossProfit), totals.lossMaking);
    add("Margin", `${formatPct(totals.grossMarginPct)}${totals.lossMaking ? " ▼ loss" : ""}`, totals.lossMaking);
    add("Messages", formatCount(totals.volume));

    const routes = routeProfitability(currentRows.filter((r) => r.customer_id === selectedId), model.ctx)
      .sort((a, b) => b.revenue - a.revenue);
    const breakdown = el("table");
    breakdown.append(el("caption", "", "By route"));
    const head = el("tr");
    for (const [label, num] of [["Route", false], ["Revenue", true], ["Margin", true]]) {
      const th = el("th", num ? "num" : "", label);
      th.scope = "col";
      head.append(th);
    }
    breakdown.append(head);
    for (const r of routes) {
      const tr = el("tr");
      const th = el("th", "", `${countryNames[r.country]} ${r.channel}`);
      th.scope = "row";
      tr.append(th, el("td", "num", formatEur(r.revenue)), el("td", "num", `${r.lossMaking ? "▼ " : ""}${formatPct(r.grossMarginPct)}`));
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
    if (!chart) chart = createWhaleChart($("whale-chart"));
    $("whale-note").textContent = updateWhaleChart(chart, curve, nameOf);
    renderSummary(customers, curve);
    table.render(customers);
    renderDetail(customers);
  }

  return { render };
}
