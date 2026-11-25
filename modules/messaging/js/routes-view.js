// routes-view.js: the Routes tab (country × channel heatmap and routes table).

import { routeProfitability } from "./calc.js";
import { createSortableTable } from "./tables.js";
import { toCsv, downloadCsv } from "./export.js";
import { formatEur, formatPct, formatSignedPct, formatCount, toneClass } from "../../../src/shared/format.js";
import { t } from "../../../src/shared/i18n.js";

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
  badge.textContent = t("seg.routes.lossBadge");
  return badge;
}

/** Headroom cell: "+25.1%" in green, or "−6.9%" in red when the route already loses money. */
function headroomCell(route) {
  const span = document.createElement("span");
  const v = route.costHeadroom;
  span.className = toneClass(v);
  span.textContent = formatSignedPct(v);
  return span;
}

/** Margin cell: the percentage, plus the loss badge when the route loses money. */
function marginCell(route) {
  const span = document.createElement("span");
  span.className = toneClass(route.grossMarginPct);
  span.textContent = formatPct(route.grossMarginPct);
  if (route.lossMaking) span.append(lossBadge());
  return span;
}

/**
 * Fills an element with a sentence made of plain text and coloured figures.
 * @param {HTMLElement} target
 * @param {(string|{text: string, cls: string})[]} parts
 */
function setSentence(target, parts) {
  target.replaceChildren(
    ...parts.map((p) => {
      if (typeof p === "string") return document.createTextNode(p);
      const span = document.createElement("span");
      span.className = p.cls;
      span.textContent = p.text;
      return span;
    }),
  );
}

/** A margin as a coloured sentence part. */
const pct = (v) => ({ text: formatPct(v), cls: toneClass(v) });
/** An amount as a coloured sentence part. */
const eur = (v) => ({ text: formatEur(v), cls: toneClass(v) });

export function createRoutesView(model) {
  const { countryNames, dimensions } = model;
  const routeName = (r) => t("seg.routes.routeName", { country: countryNames[r.country], channel: model.channelName(r.channel) });

  const columns = [
    { key: "route", label: t("seg.routes.colRoute"), type: "text", value: routeName },
    { key: "volume", label: t("seg.routes.colMessages"), type: "number", format: formatCount },
    { key: "revenue", label: t("seg.routes.colRevenue"), type: "number", format: formatEur },
    { key: "deliveryCost", label: t("seg.routes.colDelivery"), type: "number", format: formatEur },
    { key: "platformCost", label: t("seg.routes.colPlatform"), type: "number", format: formatEur },
    { key: "grossProfit", label: t("seg.routes.colGrossProfit"), type: "number", format: formatEur },
    { key: "grossMarginPct", label: t("seg.routes.colMargin"), type: "number", cell: marginCell },
    { key: "costHeadroom", label: t("seg.routes.colHeadroom"), type: "number", cell: headroomCell },
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
    { label: "cost_headroom", key: "costHeadroom" },
    { label: "loss_making", csv: (r) => (r.lossMaking ? "yes" : "no") },
  ];

  const table = createSortableTable($("routes-table"), {
    columns,
    caption: t("seg.routes.tableCaption"),
    sort: { key: "grossProfit", direction: "asc" },
    rowClass: (r) => (r.lossMaking ? "is-loss" : ""),
  });
  let fileTag = "all";
  $("routes-csv").addEventListener("click", () => {
    downloadCsv(`routes_${fileTag}.csv`, toCsv(csvColumns, table.sortedRows()));
  });

  function renderSummary(routes) {
    const box = $("routes-summary");
    if (routes.length === 0) {
      box.textContent = t("seg.routes.noRoutes");
      return;
    }
    const losers = routes.filter((r) => r.lossMaking);
    const best = routes.reduce((a, b) => (b.grossProfit > a.grossProfit ? b : a));
    const bestPart = [t("seg.routes.best", { route: routeName(best) }), eur(best.grossProfit), t("seg.routes.bestEnd")];
    if (routes.length === 1) {
      const only = routes[0];
      const lead = t(only.lossMaking ? "seg.routes.onlyLoses" : "seg.routes.onlyProfitable", { route: routeName(only) });
      setSentence(box, [lead, pct(only.grossMarginPct), t("seg.routes.onlyMarginOn"), formatEur(only.revenue), t("seg.routes.onlyRevenue")]);
      return;
    }
    if (losers.length === 0) {
      const thinnest = routes.reduce((a, b) => (b.grossMarginPct < a.grossMarginPct ? b : a));
      setSentence(box, [t("seg.routes.allProfitable", { count: routes.length, route: routeName(thinnest) }), pct(thinnest.grossMarginPct), ".", ...bestPart]);
      return;
    }
    const list = losers.flatMap((r, i) => [i === 0 ? "" : ", ", `${routeName(r)} (`, pct(r.grossMarginPct), ", ", eur(r.grossProfit), ")"]);
    setSentence(box, [t("seg.routes.losers", { count: losers.length, total: routes.length }), ...list, ".", ...bestPart]);
  }

  // The heatmap grid is built once; each render only updates the cells, so
  // their colour can fade smoothly from one selection to the next (CSS transition).
  const cells = new Map();

  function buildHeatmap() {
    const tableEl = document.createElement("table");
    const caption = document.createElement("caption");
    caption.className = "sr-only";
    caption.textContent = t("seg.routes.heatmapCaption");
    const head = document.createElement("tr");
    const corner = document.createElement("td");
    corner.className = "corner";
    head.append(corner);
    for (const channel of dimensions.channels) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = model.channelName(channel);
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
        const td = document.createElement("td");
        const margin = document.createElement("span");
        margin.className = "cell-margin";
        const revenue = document.createElement("span");
        revenue.className = "cell-revenue";
        td.append(margin, revenue);
        cells.set(`${code}|${channel}`, { td, margin, revenue });
        tr.append(td);
      }
      tbody.append(tr);
    }
    tableEl.append(caption, thead, tbody);
    $("heatmap").replaceChildren(tableEl);
  }

  function renderHeatmap(routes) {
    const byKey = new Map(routes.map((r) => [`${r.country}|${r.channel}`, r]));
    for (const [key, cell] of cells) updateCell(cell, byKey.get(key));
  }

  /** Updates one heatmap cell in place: colour, figures, loss flag and tooltip. */
  function updateCell({ td, margin, revenue }, route) {
    td.classList.toggle("is-empty", !route);
    td.classList.toggle("is-loss", Boolean(route?.lossMaking));
    if (!route) {
      td.style.backgroundColor = "";
      margin.textContent = "—";
      revenue.textContent = "";
      td.title = t("seg.routes.noTrafficCell");
      return;
    }
    td.style.backgroundColor = heatColor(route.grossMarginPct);
    margin.textContent = `${route.lossMaking ? "▼ " : ""}${formatPct(route.grossMarginPct)}`;
    revenue.textContent = formatEur(route.revenue);
    td.title = t("seg.routes.cellTitle", {
      route: routeName(route), margin: formatPct(route.grossMarginPct), revenue: formatEur(route.revenue), profit: formatEur(route.grossProfit),
    }) + (route.lossMaking ? t("seg.routes.cellLoss") : "");
  }

  buildHeatmap();

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
