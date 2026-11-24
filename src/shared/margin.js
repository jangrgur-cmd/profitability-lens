// margin.js: safe division and benchmark bands, shared by both modules.
//
// Pure functions only. A ratio that cannot be computed is returned as null,
// never as 0, Infinity or NaN, so the UI can say "n/a" instead of a fake value.

/**
 * Divides two numbers, or returns null when the result has no meaning:
 * a zero denominator, or a missing or non-finite input.
 * @param {number|null|undefined} numerator
 * @param {number|null|undefined} denominator
 * @returns {number|null}
 */
export function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

/**
 * A margin: profit as a share of revenue (0.223 for 22.3%).
 * null when revenue is 0, because a margin on zero revenue has no meaning.
 * @param {number} profit
 * @param {number} revenue
 * @returns {number|null}
 */
export function margin(profit, revenue) {
  return safeDivide(profit, revenue);
}

/**
 * The five bands of a benchmark scale, from worst to best. A value at or
 * above a band's threshold is in that band (Poor has no threshold).
 */
export const BANDS = [
  { id: "poor", label: "Poor" },
  { id: "weak", label: "Weak" },
  { id: "fair", label: "Fair" },
  { id: "good", label: "Good" },
  { id: "excellent", label: "Excellent" },
];

/**
 * Checks a benchmark scale: four finite thresholds [poor, fair, good, excellent],
 * strictly ascending. Throws with a clear message otherwise.
 * @param {number[]} thresholds
 */
export function assertThresholds(thresholds) {
  if (!Array.isArray(thresholds) || thresholds.length !== 4 || !thresholds.every(Number.isFinite)) {
    throw new Error(`Thresholds must be four numbers [poor, fair, good, excellent], got ${JSON.stringify(thresholds)}`);
  }
  for (let i = 1; i < 4; i += 1) {
    if (!(thresholds[i] > thresholds[i - 1])) {
      throw new Error(`Thresholds must be strictly ascending, got ${JSON.stringify(thresholds)}`);
    }
  }
}

/**
 * The band a value falls in: ≥ excellent "excellent", ≥ good "good",
 * ≥ fair "fair", ≥ poor "weak", otherwise "poor".
 * @param {number} value in the same unit as the thresholds
 * @param {number[]} thresholds [poor, fair, good, excellent], ascending
 * @returns {{id: string, label: string}}
 */
export function bandFor(value, thresholds) {
  assertThresholds(thresholds);
  let index = 0;
  for (const t of thresholds) if (value >= t) index += 1;
  return BANDS[index];
}

/**
 * Scores a value from 0 to 100 against a benchmark scale, piecewise linearly
 * between these points:
 *
 *   floor = poor − (fair − poor) → 0
 *   poor → 20, fair → 50, good → 75, excellent → 100
 *
 * Below the floor the score is 0; above excellent it is 100.
 * Example with [0, 5, 10, 20]: floor −5 → 0, 2.5 → 35, 15 → 87.5.
 * @param {number} value in the same unit as the thresholds
 * @param {number[]} thresholds [poor, fair, good, excellent], ascending
 * @returns {number} 0–100
 */
export function scoreAgainstThresholds(value, thresholds) {
  assertThresholds(thresholds);
  const [poor, fair, good, excellent] = thresholds;
  const points = [
    [poor - (fair - poor), 0],
    [poor, 20],
    [fair, 50],
    [good, 75],
    [excellent, 100],
  ];
  if (value <= points[0][0]) return 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    if (value <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 100; // above excellent
}
