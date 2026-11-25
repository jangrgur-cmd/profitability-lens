// learn-view.js: Learn mode on the Overview tab (how channel margins add up
// to the gross margin) and the "Send to Company rating" link.

import { summarize, channelTotals } from "./calc.js";
import { marginContributions } from "../../../src/shared/margin.js";
import { encodeHandoff } from "../../../src/shared/handoff.js";
import { formatPct, formatPp } from "../../../src/shared/format.js";
import { t } from "../../../src/shared/i18n.js";

const $ = (id) => document.getElementById(id);

function cell(tag, text, className = "") {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

/** Contribution in percentage points, without a "+" for positive values. */
const points = (share) => formatPp(share).replace(/^\+/, "");

/**
 * Renders the table: channel share of revenue × channel margin = contribution,
 * adding up to the gross margin of the filtered selection.
 * @param {object[]} rows filtered traffic rows
 * @param {object} ctx calculation context
 */
export function renderMarginContributions(rows, ctx, channelName) {
  const { rows: lines, total } = marginContributions(
    channelTotals(rows, ctx).map((c) => ({ label: channelName(c.channel), revenue: c.revenue, grossProfit: c.grossProfit })));
  const container = $("contrib-table");
  if (lines.length === 0) {
    container.replaceChildren(cell("p", t("seg.noTraffic"), "block-note"));
    return;
  }

  const table = document.createElement("table");
  table.className = "data-table contrib-table";
  table.append(cell("caption", t("seg.overview.contribCaption"), "sr-only"));
  const head = document.createElement("tr");
  const headings = [t("seg.overview.contribChannel"), t("seg.overview.contribShare"), "×", t("seg.overview.contribMargin"), "=", t("seg.overview.contribContribution")];
  for (const label of headings) {
    const th = cell("th", label);
    th.scope = "col";
    if (label === "×" || label === "=") th.setAttribute("aria-hidden", "true");
    head.append(th);
  }
  table.append(document.createElement("thead"));
  table.tHead.append(head);
  const body = document.createElement("tbody");
  for (const line of lines) {
    const tr = document.createElement("tr");
    const th = cell("th", line.label);
    th.scope = "row";
    tr.append(th, cell("td", formatPct(line.revenueShare)), cell("td", "×", "op"),
      cell("td", formatPct(line.margin)), cell("td", "=", "op"), cell("td", points(line.contribution)));
    body.append(tr);
  }
  const foot = document.createElement("tr");
  const th = cell("th", t("seg.overview.contribTotal"));
  th.scope = "row";
  foot.append(th, cell("td", formatPct(1)), cell("td", "", "op"), cell("td", ""), cell("td", "=", "op"), cell("td", formatPct(total.margin)));
  table.append(body, document.createElement("tfoot"));
  table.tFoot.append(foot);
  for (const op of table.querySelectorAll("td.op")) op.setAttribute("aria-hidden", "true");

  const scroller = document.createElement("div");
  scroller.className = "table-scroll";
  scroller.append(table);
  container.replaceChildren(scroller);
}

/**
 * Points "Send to Company rating" at the rating page with the full-year
 * totals of all rows: revenue, and delivery plus platform cost as cost of sales.
 * @param {{rows: object[], ctx: object}} model
 */
export function initHandoffLink(model) {
  const totals = summarize(model.rows, model.ctx);
  $("send-to-rating").href = `../../index.html${encodeHandoff("messaging", {
    revenue: totals.revenue,
    cogs: totals.deliveryCost + totals.platformCost,
  })}`;
}
