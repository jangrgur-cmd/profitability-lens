// concentration.js: how concentrated profit is across segments (customers,
// products, routes…): the cumulative profitability ("whale") curve and the
// share of profit earned by the top 20%. Shared by the messaging case study
// and the general segment module. Pure functions.

/**
 * Cumulative profitability curve.
 *
 * Items are sorted by profit, highest first. For each item we plot the
 * cumulative share of items (x) against the cumulative share of total
 * profit (y).
 *
 * When some items lose money, the curve rises above 100% and then falls back
 * to 100% at the end: the profitable items earn more than the total, and the
 * loss-makers give part of it back. The peak shows how much profit the
 * profitable items generate on their own.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => number} profitOf
 * @returns {{points: {rank: number, item: T, profit: number, cumulativeProfit: number,
 *                     itemShare: number, profitShare: number|null}[],
 *            peak: object|null, totalProfit: number}}
 *   profitShare is null when total profit is not positive (a share of a zero
 *   or negative total is not meaningful). Ties keep their input order.
 */
export function profitCurve(items, profitOf) {
  const sorted = [...items].sort((a, b) => profitOf(b) - profitOf(a));
  const totalProfit = sorted.reduce((s, item) => s + profitOf(item), 0);
  const n = sorted.length;
  let cumulative = 0;
  const points = sorted.map((item, i) => {
    const profit = profitOf(item);
    cumulative += profit;
    return {
      rank: i + 1,
      item,
      profit,
      cumulativeProfit: cumulative,
      itemShare: (i + 1) / n,
      profitShare: totalProfit > 0 ? cumulative / totalProfit : null,
    };
  });
  const peak = points.reduce((best, p) => (best === null || p.cumulativeProfit > best.cumulativeProfit ? p : best), null);
  return { points, peak, totalProfit };
}

/**
 * The share of total profit earned by the most profitable `fraction` of
 * items: the top round(n × fraction) items, at least one.
 * @param {ReturnType<typeof profitCurve>} curve
 * @param {number} [fraction=0.2]
 * @returns {{count: number, share: number|null}} share is null when total profit is not positive
 */
export function topShare(curve, fraction = 0.2) {
  const n = curve.points.length;
  if (n === 0) return { count: 0, share: null };
  const count = Math.max(1, Math.round(n * fraction));
  return { count, share: curve.points[count - 1].profitShare };
}
