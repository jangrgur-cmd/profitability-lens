// calc.js: every business calculation in the dashboard.
//
// All functions are pure: they take rows and a "context" (exchange rate and
// customer discounts) and return new values. Nothing here reads files, touches
// the page or mutates its inputs, so the same functions serve the dashboard,
// the scenario engine and the unit tests.
//
// A traffic row looks like:
//   { month, customer_id, country, channel, category, volume,
//     price_eur, cost_local, cost_currency, platform_cost_eur }
//
// A context looks like:
//   { eurUsd: 1.08, discountByCustomer: { C01: 0.2, C02: 0.2, ... } }

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Builds the calculation context from the parsed assumptions file.
 * - eurUsd: the base EUR/USD rate (how many US dollars one euro buys).
 * - discountByCustomer: each customer's volume discount as a share of list price,
 *   looked up from the customer's discount tier.
 * @param {object} assumptionsFile parsed data/assumptions.json
 * @returns {{eurUsd: number, discountByCustomer: Record<string, number>}}
 */
export function buildCalcContext(assumptionsFile) {
  const values = new Map(assumptionsFile.assumptions.map((a) => [a.id, a.value]));
  const discountByCustomer = {};
  for (const customer of assumptionsFile.customers) {
    if (!values.has(customer.discount_tier)) {
      throw new Error(`Unknown discount tier ${customer.discount_tier} for ${customer.id}`);
    }
    discountByCustomer[customer.id] = values.get(customer.discount_tier);
  }
  return { eurUsd: values.get("fx_eur_usd"), discountByCustomer };
}

// ---------------------------------------------------------------------------
// Row-level formulas
// ---------------------------------------------------------------------------

/**
 * Converts one unit of a cost currency into euros.
 * EUR costs need no conversion. USD costs are divided by the EUR/USD rate:
 * if 1 EUR = 1.08 USD, then 1 USD = 1 / 1.08 = 0.926 EUR.
 * @param {string} currency "EUR" or "USD"
 * @param {number} eurUsd USD per EUR
 * @returns {number} euros per one unit of `currency`
 */
export function fxToEur(currency, eurUsd) {
  if (currency === "EUR") return 1;
  if (currency === "USD") return 1 / eurUsd;
  throw new Error(`Unsupported cost currency: ${currency}`);
}

/**
 * Revenue of one row, in EUR.
 * revenue = volume × list price × (1 − customer discount)
 */
export function rowRevenue(row, ctx) {
  const discount = ctx.discountByCustomer[row.customer_id] ?? 0;
  return row.volume * row.price_eur * (1 - discount);
}

/**
 * Delivery cost of one row, in EUR: what we pay the operator (SMS, Voice),
 * Meta (WhatsApp) or Viber to deliver the messages.
 * delivery_cost_eur = volume × cost in local currency × FX rate to EUR
 */
export function rowDeliveryCost(row, ctx) {
  return row.volume * row.cost_local * fxToEur(row.cost_currency, ctx.eurUsd);
}

/**
 * Platform cost of one row, in EUR: our own infrastructure and support cost.
 * platform_cost = volume × platform cost per message
 */
export function rowPlatformCost(row) {
  return row.volume * row.platform_cost_eur;
}

/**
 * All money figures for one row.
 * gross_profit = revenue − delivery cost − platform cost
 * @returns {{volume:number, revenue:number, deliveryCost:number, platformCost:number, grossProfit:number}}
 */
export function rowMetrics(row, ctx) {
  const revenue = rowRevenue(row, ctx);
  const deliveryCost = rowDeliveryCost(row, ctx);
  const platformCost = rowPlatformCost(row);
  return {
    volume: row.volume,
    revenue,
    deliveryCost,
    platformCost,
    grossProfit: revenue - deliveryCost - platformCost,
  };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

/**
 * Gross margin as a share of revenue: gross_profit / revenue.
 * Returns null when revenue is 0 (the UI shows "n/a"), because a margin on
 * zero revenue has no meaning.
 * @returns {number|null} e.g. 0.223 for 22.3 %
 */
export function grossMarginPct(grossProfit, revenue) {
  return revenue === 0 ? null : grossProfit / revenue;
}

/** Safe division for per-message figures: null when there are no messages. */
function perMessage(amount, volume) {
  return volume === 0 ? null : amount / volume;
}

/**
 * Adds up a set of rows into one set of totals.
 * Besides the sums, it returns:
 * - grossMarginPct = gross profit / revenue
 * - revenuePerMessage = revenue / volume (average revenue per message)
 * - costPerMessage = (delivery cost + platform cost) / volume
 * - lossMaking = true when gross profit is below zero
 * @param {object[]} rows traffic rows
 * @param {object} ctx calculation context
 */
export function summarize(rows, ctx) {
  const t = { volume: 0, revenue: 0, deliveryCost: 0, platformCost: 0, grossProfit: 0 };
  for (const row of rows) {
    const m = rowMetrics(row, ctx);
    t.volume += m.volume;
    t.revenue += m.revenue;
    t.deliveryCost += m.deliveryCost;
    t.platformCost += m.platformCost;
    t.grossProfit += m.grossProfit;
  }
  return finalizeTotals(t);
}

/** Adds the derived ratios to a set of summed totals. */
function finalizeTotals(t) {
  const totalCost = t.deliveryCost + t.platformCost;
  return {
    ...t,
    totalCost,
    grossMarginPct: grossMarginPct(t.grossProfit, t.revenue),
    revenuePerMessage: perMessage(t.revenue, t.volume),
    costPerMessage: perMessage(totalCost, t.volume),
    lossMaking: t.grossProfit < 0,
  };
}

/**
 * Groups rows by a key and summarizes each group.
 * Example: groupAndSummarize(rows, ctx, (r) => r.channel) gives one total per channel.
 * @param {object[]} rows
 * @param {object} ctx
 * @param {(row: object) => string|number} keyFn
 * @returns {Map<string|number, object>} key → totals (insertion order = first appearance)
 */
export function groupAndSummarize(rows, ctx, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = new Map();
  for (const [key, groupRows] of groups) result.set(key, summarize(groupRows, ctx));
  return result;
}

/** Totals per month, as an array ordered Jan → Dec. Months without rows get zero totals. */
export function monthlyTotals(rows, ctx, monthCount = 12) {
  const byMonth = groupAndSummarize(rows, ctx, (r) => r.month);
  return Array.from({ length: monthCount }, (_, i) => ({
    month: i + 1,
    ...(byMonth.get(i + 1) ?? summarize([], ctx)),
  }));
}

/** Totals per channel, with average revenue and cost per message, sorted by revenue (largest first). */
export function channelTotals(rows, ctx) {
  return [...groupAndSummarize(rows, ctx, (r) => r.channel)]
    .map(([channel, totals]) => ({ channel, ...totals }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Route profitability. A route is one country × channel combination
 * (e.g. "Nigeria SMS"). A route is loss-making if its gross profit over the
 * selected rows is below zero.
 * @returns {object[]} one entry per route, sorted by gross profit (lowest first,
 *   so loss-making routes come first)
 */
export function routeProfitability(rows, ctx) {
  return [...groupAndSummarize(rows, ctx, (r) => `${r.country}|${r.channel}`)]
    .map(([key, totals]) => {
      const [country, channel] = key.split("|");
      return { country, channel, ...totals };
    })
    .sort((a, b) => a.grossProfit - b.grossProfit);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/**
 * Customer profitability: gross profit per customer, ranked from most to
 * least profitable (rank 1 = highest gross profit).
 * @returns {object[]} [{ customer_id, rank, discount, ...totals }]
 */
export function customerProfitability(rows, ctx) {
  return [...groupAndSummarize(rows, ctx, (r) => r.customer_id)]
    .map(([customer_id, totals]) => ({
      customer_id,
      discount: ctx.discountByCustomer[customer_id] ?? 0,
      ...totals,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit || a.customer_id.localeCompare(b.customer_id))
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

/**
 * Whale curve (cumulative profitability curve).
 *
 * Customers are sorted by gross profit, highest first. For each customer we
 * plot the cumulative share of customers (x) against the cumulative share of
 * total gross profit (y).
 *
 * When some customers lose money, the curve rises above 100 % and then falls
 * back to 100 % at the end: the profitable customers earn more than the total,
 * and the loss-makers give part of it back. The peak shows how much profit the
 * profitable customers generate on their own.
 *
 * @param {object[]} customers output of customerProfitability (already ranked)
 * @returns {{points: object[], peak: object|null, totalGrossProfit: number}}
 *   points: [{ rank, customer_id, grossProfit, cumulativeProfit,
 *              customerSharePct, profitSharePct }]
 *   peak: the point with the highest cumulative profit
 *   profitSharePct is null when total gross profit is not positive (a share of
 *   a zero or negative total is not meaningful).
 */
export function whaleCurve(customers) {
  const sorted = [...customers].sort((a, b) => b.grossProfit - a.grossProfit);
  const totalGrossProfit = sorted.reduce((s, c) => s + c.grossProfit, 0);
  const n = sorted.length;
  let cumulative = 0;
  const points = sorted.map((c, i) => {
    cumulative += c.grossProfit;
    return {
      rank: i + 1,
      customer_id: c.customer_id,
      grossProfit: c.grossProfit,
      cumulativeProfit: cumulative,
      customerSharePct: (i + 1) / n,
      profitSharePct: totalGrossProfit > 0 ? cumulative / totalGrossProfit : null,
    };
  });
  const peak = points.reduce((best, p) => (best === null || p.cumulativeProfit > best.cumulativeProfit ? p : best), null);
  return { points, peak, totalGrossProfit };
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Keeps only the rows that match the global filter bar.
 * Each filter is optional; a missing or "all" filter keeps every row.
 * @param {object[]} rows
 * @param {{monthFrom?:number, monthTo?:number, country?:string, channel?:string,
 *          category?:string, industry?:string}} filters
 * @param {Record<string, {industry:string}>} customersById needed for the industry filter
 * @returns {object[]} a new array (the input is not changed)
 */
export function filterRows(rows, filters = {}, customersById = {}) {
  const active = (v) => v !== undefined && v !== null && v !== "" && v !== "all";
  const from = filters.monthFrom ?? 1;
  const to = filters.monthTo ?? 12;
  return rows.filter(
    (r) =>
      r.month >= from &&
      r.month <= to &&
      (!active(filters.country) || r.country === filters.country) &&
      (!active(filters.channel) || r.channel === filters.channel) &&
      (!active(filters.category) || r.category === filters.category) &&
      (!active(filters.industry) || customersById[r.customer_id]?.industry === filters.industry),
  );
}

/**
 * For each dropdown filter, lists the values that still have traffic given
 * all the OTHER filters. Used to grey out options that would return no data
 * (e.g. Retail when Croatia is selected and no retail customer sends traffic there).
 * @returns {{country:Set<string>, channel:Set<string>, category:Set<string>, industry:Set<string>}}
 */
export function availableFilterValues(rows, filters = {}, customersById = {}) {
  const valueOf = {
    country: (r) => r.country,
    channel: (r) => r.channel,
    category: (r) => r.category,
    industry: (r) => customersById[r.customer_id]?.industry,
  };
  const result = {};
  for (const [field, getValue] of Object.entries(valueOf)) {
    const others = { ...filters, [field]: "all" };
    result[field] = new Set(filterRows(rows, others, customersById).map(getValue));
  }
  return result;
}
