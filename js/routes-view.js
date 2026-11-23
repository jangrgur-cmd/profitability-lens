// routes-view.js: the Routes tab (country × channel heatmap and routes table).

import { routeProfitability } from "./calc.js";
import { createSortableTable } from "./tables.js";
import { toCsv, downloadCsv } from "./export.js";
import { formatEur, formatPct, formatCount } from "./format.js";

const $ = (id) => document.getElementById(id);

/**
 * Background colour for a heatmap cell: a green tint that deepens with the
 * margin, or a red tint for losses. Text stays dark ink, so contrast holds.
 */
export function heatColor(margin) {
  if (margin === null) return "transparent";
  if (margin < 0) {
    const strength = 14 + Math.min(Math.abs(margin) / 0.2, 1) * 34;
    return `color-mix(in srgb, var(--loss) ${strength.toFixed(0)}%, var(--surface))`;
  }
  const strength = 6 + Math.min(margin / 0.35, 1) * 42;
  return `color-mix(in srgb, var(--profit) ${strength.toFixed(0)}%, var(--surface))`;
}

/** Adds a "▼ Loss" badge so loss-making rows are never marked by colour alone. */
function lossBadge() {
  const badge = document.createElement("span");
  badge.className = "loss-badge";
  badge.textContent = "▼ Loss";
  return badge;
}

/** Margin cell: the percentage, plus the loss badge when the route loses money. */
function marginCell(route) {
  const span = document.createElement("span");
  span.textContent = formatPct(route.grossMarginPct);
  if (route.lossMaking) span.append(lossBadge());
  return span;
}

export function createRoutesView(model) {
  const { countryNames, dimensions } = model;
  const routeName = (r) => `${countryNames[r.country]} ${r.channel}`;

  const columns = [
    { key: "route", label: "Route", type: "text", value: routeName },
    { key: "volume", label: "Messages", type: "number", format: formatCount },
    { key: "revenue", label: "Revenue", type: "number", format: formatEur },
    { key: "deliveryCost", label: "Delivery cost", type: "number", format: formatEur },
    { key: "platformCost", label: "Platform cost", type: "number", format: formatEur },
    { key: "grossProfit", label: "Gross profit", type: "number", format: formatEur },
    { key: "grossMarginPct", label: "Margin", type: "number", cell: marginCell },
  ];
  const csvColumns = [
    { label: "country_code", key: "country" },
    { label: "country", csv: (r) => countryNames[r.country] },
    { label: "channel", key: "channel" },
    { label: "messages", key: "volume" },
    { label: "revenue_eur", key: "revenue" },
    { label: "delivery_cost_eur", key: "deliveryCost" },
    { label: "platform_cost_eur", key: "platformCost" },
    { label: "gross_profit_eur", key: "grossProfit" },
    { label: "gross_margin", key: "grossMarginPct" },
    { label: "loss_making", csv: (r) => (r.lossMaking ? "yes" : "no") },
  ];

  const table = createSortableTable($("routes-table"), {
    columns,
    caption: "Routes by country and channel",
    sort: { key: "grossProfit", direction: "asc" },
    rowClass: (r) => (r.lossMaking ? "is-loss" : ""),
  });
  let fileTag = "all";
  $("routes-csv").addEventListener("click", () => {
    downloadCsv(`routes_${fileTag}.csv`, toCsv(csvColumns, table.sortedRows()));
  });

  function renderSummary(routes) {
    const el = $("routes-summary");
    if (routes.length === 0) {
      el.textContent = "No routes have traffic with these filters.";
      return;
    }
    const losers = routes.filter((r) => r.lossMaking);
    const best = routes.reduce((a, b) => (b.grossProfit > a.grossProfit ? b : a));
    const bestText = `${routeName(best)} earns the most gross profit (${formatEur(best.grossProfit)}).`;
    if (losers.length === 0) {
      const thinnest = routes.reduce((a, b) => (b.grossMarginPct < a.grossMarginPct ? b : a));
      el.textContent = `All ${routes.length} routes are profitable in this selection; the thinnest is ${routeName(thinnest)} at ${formatPct(thinnest.grossMarginPct)}. ${bestText}`;
      return;
    }
    const list = losers.map((r) => `${routeName(r)} (${formatPct(r.grossMarginPct)}, ${formatEur(r.grossProfit)})`).join(", ");
    const verb = losers.length === 1 ? "loses" : "lose";
    el.textContent = `${losers.length} of ${routes.length} routes ${verb} money in this selection: ${list}. ${bestText}`;
  }

  function renderHeatmap(routes) {
    const byKey = new Map(routes.map((r) => [`${r.country}|${r.channel}`, r]));
    const tableEl = document.createElement("table");
    const caption = document.createElement("caption");
    caption.className = "sr-only";
    caption.textContent = "Gross margin by country (rows) and channel (columns)";
    const head = document.createElement("tr");
    const corner = document.createElement("td");
    corner.className = "corner";
    head.append(corner);
    for (const channel of dimensions.channels) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = channel;
      head.append(th);
    }
    const thead = document.createElement("thead");
    thead.append(head);
    const tbody = document.createElement("tbody");
    for (const { code } of dimensions.countries) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = countryNames[code];
      tr.append(th);
      for (const channel of dimensions.channels) {
        tr.append(heatCell(byKey.get(`${code}|${channel}`)));
      }
      tbody.append(tr);
    }
    tableEl.append(caption, thead, tbody);
    $("heatmap").replaceChildren(tableEl);
  }

  function heatCell(route) {
    const td = document.createElement("td");
    if (!route) {
      td.className = "is-empty";
      td.textContent = "—";
      td.setAttribute("aria-label", "No traffic");
      return td;
    }
    td.style.background = heatColor(route.grossMarginPct);
    if (route.lossMaking) td.classList.add("is-loss");
    const margin = document.createElement("span");
    margin.className = "cell-margin";
    margin.textContent = `${route.lossMaking ? "▼ " : ""}${formatPct(route.grossMarginPct)}`;
    const revenue = document.createElement("span");
    revenue.className = "cell-revenue";
    revenue.textContent = formatEur(route.revenue);
    td.append(margin, revenue);
    td.title = `${countryNames[route.country]} ${route.channel}: margin ${formatPct(route.grossMarginPct)}, revenue ${formatEur(route.revenue)}, gross profit ${formatEur(route.grossProfit)}${route.lossMaking ? " (loss-making)" : ""}`;
    return td;
  }

  /**
   * @param {object[]} rows filtered traffic rows
   * @param {string} tag short text describing the filters, used in the CSV file name
   */
  function render(rows, tag) {
    fileTag = tag;
    const routes = routeProfitability(rows, model.ctx);
    renderSummary(routes);
    renderHeatmap(routes);
    table.render(routes);
  }

  return { render };
}
