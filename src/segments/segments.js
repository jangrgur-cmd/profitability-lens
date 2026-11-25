// segments.js: segment profitability for any table the user pastes or types:
// customers, products, channels, regions…
//
//   Contribution margin = Revenue − Variable costs
//   CM ratio            = Contribution margin ÷ Revenue
//   Segment profit      = Contribution margin − Direct fixed costs   (0 when blank)
//
// Segments are ranked by segment profit. The cumulative profitability
// ("whale") curve and the top-20% share come from src/shared/concentration.js,
// the same code the messaging case study uses. Pure functions, no DOM.

import { margin, safeDivide, marginContributions } from "../shared/margin.js";
import { profitCurve, topShare } from "../shared/concentration.js";
import { normalizeLabel, parseGrid, cellNumber, isNumberCell } from "../shared/paste.js";
import { formatEur, formatPct } from "../shared/format.js";
import { toCsv } from "../shared/export.js";
import { t } from "../shared/i18n.js";

/** At most this many segments in one table. */
export const MAX_SEGMENTS = 200;

/** The table's columns, in order. `fixedCosts` is optional. */
export const COLUMNS = ["name", "revenue", "variableCosts", "fixedCosts"];

/** What the rows are; changes only the column heading. Labels in the interface language. */
export const SEGMENT_KINDS = ["customer", "product", "channel", "region", "segment"].map((id) => ({
  id,
  get label() { return t(`segments.kinds.${id}`); },
}));

/**
 * Header words for each column, normalised (see normalizeLabel), English and
 * Croatian. Matching data, not interface text.
 */
const HEADERS = {
  name: ["segment", "name", "customer", "client", "product", "channel", "region", "route", "item",
    "naziv", "kupac", "klijent", "proizvod", "artikl", "kanal", "regija", "podrucje", "ruta"],
  revenue: ["revenue", "revenues", "sales", "turnover", "net sales", "prihodi", "prihod", "prihodi od prodaje", "prodaja"],
  variableCosts: ["variable costs", "variable cost", "direct costs", "direct cost", "cost of sales", "cogs",
    "varijabilni troskovi", "varijabilni trosak", "izravni troskovi", "izravni trosak", "trosak prodanog"],
  fixedCosts: ["direct fixed costs", "fixed costs", "fixed cost", "attributable fixed costs", "cost to serve",
    "izravni fiksni troskovi", "fiksni troskovi", "fiksni trosak", "trosak usluzivanja"],
};

/** The column a header cell names, or null. */
function headerColumn(cell) {
  const label = normalizeLabel(cell);
  if (!label) return null;
  // Longest header first, so "direct fixed costs" is not read as "direct costs".
  const all = Object.entries(HEADERS).flatMap(([col, words]) => words.map((w) => ({ col, w }))).sort((a, b) => b.w.length - a.w.length);
  return all.find(({ w }) => label === w || label.startsWith(`${w} `))?.col ?? null;
}

/**
 * @typedef {object} Segment
 * @property {string} name
 * @property {number} revenue
 * @property {number} variableCosts
 * @property {number|null} fixedCosts direct fixed costs, null when not given
 */

/**
 * Reads a pasted segment table. With a header row, columns are found by name
 * (in English or Croatian); without one they are taken in order: name,
 * revenue, variable costs, direct fixed costs. Costs are read as positive
 * amounts whatever their sign.
 * @param {string} text
 * @returns {{segments: Segment[], skipped: {line: number, text: string}[], header: boolean, truncated: boolean}}
 */
export function readSegmentPaste(text) {
  const grid = parseGrid(text);
  let map = { name: 0, revenue: 1, variableCosts: 2, fixedCosts: 3 };
  let start = 0;
  const first = grid[0] ?? [];
  const header = first.length > 1 && first.slice(1).every((c) => c === "" || !isNumberCell(c));
  if (header) {
    start = 1;
    const found = {};
    first.forEach((cell, i) => {
      const col = headerColumn(cell);
      if (col && found[col] === undefined) found[col] = i;
    });
    if (found.revenue !== undefined) map = { name: found.name ?? 0, revenue: found.revenue, variableCosts: found.variableCosts ?? -1, fixedCosts: found.fixedCosts ?? -1 };
  }
  const segments = [];
  const skipped = [];
  const cell = (row, i) => (i >= 0 ? row[i] ?? "" : "");
  for (let r = start; r < grid.length; r += 1) {
    const row = grid[r];
    const name = cell(row, map.name);
    const revenue = cellNumber(cell(row, map.revenue));
    if (!name || revenue === null) {
      skipped.push({ line: r + 1, text: row.join(" ") });
      continue;
    }
    const variable = cellNumber(cell(row, map.variableCosts));
    const fixed = cellNumber(cell(row, map.fixedCosts));
    segments.push({
      name,
      revenue,
      variableCosts: variable === null ? 0 : Math.abs(variable),
      fixedCosts: fixed === null ? null : Math.abs(fixed),
    });
  }
  return { segments: segments.slice(0, MAX_SEGMENTS), skipped, header, truncated: segments.length > MAX_SEGMENTS };
}

/**
 * Checks a table. Errors are keyed by row index, then column.
 * @param {Segment[]} segments
 * @returns {{rows: Record<number, Record<string, string>>, table: string|null}} table: an error about the whole table
 */
export function validateSegments(segments) {
  const rows = {};
  const add = (i, col, key) => { (rows[i] ??= {})[col] = t(`segments.validation.${key}`); };
  segments.forEach((s, i) => {
    if (!String(s.name ?? "").trim()) add(i, "name", "name");
    if (!Number.isFinite(s.revenue)) add(i, "revenue", "revenue");
    else if (s.revenue < 0) add(i, "revenue", "negative");
    if (!Number.isFinite(s.variableCosts)) add(i, "variableCosts", "number");
    else if (s.variableCosts < 0) add(i, "variableCosts", "negative");
    if (s.fixedCosts !== null && !Number.isFinite(s.fixedCosts)) add(i, "fixedCosts", "number");
    else if (s.fixedCosts < 0) add(i, "fixedCosts", "negative");
  });
  let table = null;
  if (segments.length === 0) table = t("segments.validation.empty");
  else if (segments.length > MAX_SEGMENTS) table = t("segments.validation.tooMany", { max: MAX_SEGMENTS });
  else if (segments.reduce((sum, s) => sum + (Number.isFinite(s.revenue) ? s.revenue : 0), 0) <= 0) table = t("segments.validation.noRevenue");
  return { rows, table };
}

/**
 * Segment profitability, ranked from most to least profitable.
 * @param {Segment[]} segments valid (see validateSegments)
 * @returns {object} rows, totals, curve, top20, peak, lossMakers and the
 *   margin contributions for Learn mode; see the return statement
 */
export function analyseSegments(segments) {
  const base = segments.map((s, index) => {
    const contribution = s.revenue - s.variableCosts;
    const profit = contribution - (s.fixedCosts ?? 0);
    return { index, ...s, contribution, cmRatio: margin(contribution, s.revenue), profit, profitMargin: margin(profit, s.revenue) };
  });
  const sum = (key) => base.reduce((total, r) => total + (r[key] ?? 0), 0);
  const totals = {
    revenue: sum("revenue"),
    variableCosts: sum("variableCosts"),
    fixedCosts: sum("fixedCosts"),
    contribution: sum("contribution"),
    profit: sum("profit"),
  };
  totals.cmRatio = margin(totals.contribution, totals.revenue);
  totals.profitMargin = margin(totals.profit, totals.revenue);

  const curve = profitCurve(base, (r) => r.profit);
  const rows = curve.points.map((p) => ({
    ...p.item,
    rank: p.rank,
    revenueShare: safeDivide(p.item.revenue, totals.revenue),
    profitShare: totals.profit > 0 ? p.item.profit / totals.profit : null,
    cumulativeShare: p.profitShare,
    lossMaking: p.item.profit < 0,
  }));
  const losers = rows.filter((r) => r.lossMaking);
  const profitable = rows.filter((r) => r.profit > 0);
  const earned = profitable.reduce((s, r) => s + r.profit, 0);

  return {
    rows,
    totals,
    hasFixedCosts: segments.some((s) => s.fixedCosts !== null),
    curve,
    top20: topShare(curve, 0.2),
    peak: { count: profitable.length, profit: earned, share: totals.profit > 0 ? earned / totals.profit : null },
    lossMakers: { count: losers.length, loss: losers.reduce((s, r) => s + r.profit, 0) },
    contributions: marginContributions(rows.map((r) => ({ label: r.name, revenue: r.revenue, grossProfit: r.profit }))),
  };
}

/**
 * The headline in one or two sentences:
 * "The top 2 of 10 segments (20%) earn 64.0% of total profit. 3 segments lose money, −€12.3k together."
 * @param {ReturnType<typeof analyseSegments>} a
 * @returns {string}
 */
export function segmentSummary(a) {
  const n = a.rows.length;
  let text;
  if (n === 1) text = t("segments.summary.one");
  else if (a.top20.share === null) text = t("segments.summary.noProfit", { profit: formatEur(a.totals.profit) });
  else text = t("segments.summary.top", { count: a.top20.count, total: n, share: formatPct(a.top20.share), topPct: formatPct(a.top20.count / n, 0) });
  if (a.lossMakers.count === 0) text += t("segments.summary.noLosers");
  else {
    text += t("segments.summary.losers", { count: a.lossMakers.count, loss: formatEur(a.lossMakers.loss) });
    if (a.peak.share !== null) text += t("segments.summary.peak", { share: formatPct(a.peak.share) });
  }
  return text;
}

/** CSV columns: machine-readable headers and raw numbers; names as entered. */
const CSV_COLUMNS = [
  ["rank", "rank"], ["segment", "name"], ["revenue", "revenue"], ["variable_costs", "variableCosts"],
  ["contribution", "contribution"], ["cm_ratio", "cmRatio"], ["direct_fixed_costs", "fixedCosts"],
  ["segment_profit", "profit"], ["profit_share", "profitShare"], ["cumulative_profit_share", "cumulativeShare"],
].map(([label, key]) => ({ label, key }));

/** The ranked table as CSV text. */
export function segmentsCsv(a) {
  return toCsv(CSV_COLUMNS, a.rows);
}
