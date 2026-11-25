// track.js: geometry of the horizontal benchmark track shown next to a ratio.
//
// The track runs from the score's floor (poor − (fair − poor), where the score
// is 0) to as far above "excellent" as "excellent" is above "good". It is split
// into the five bands, with a tick at each threshold, a marker at the value and,
// when there is one, a reference mark at the published sector average.
// Positions are percentages of the track width, so the UI only sets CSS.

import { BANDS, assertThresholds } from "./margin.js";

/**
 * @param {number|null} value in the same unit as the thresholds (percent)
 * @param {number[]} thresholds [poor, fair, good, excellent], ascending
 * @param {number|null} [reference] a published sector average, in percent
 * @returns {{min: number, max: number,
 *            segments: {id: string, label: string, from: number, to: number}[],
 *            ticks: {value: number, at: number}[],
 *            marker: {at: number, outside: "below"|"above"|null}|null,
 *            reference: {at: number, outside: "below"|"above"|null}|null}}
 *   `from`, `to` and `at` are 0–100 (% of the track width).
 */
export function trackGeometry(value, thresholds, reference = null) {
  assertThresholds(thresholds);
  const [poor, fair, good, excellent] = thresholds;
  const min = poor - (fair - poor);
  const max = excellent + (excellent - good);
  const at = (v) => ((Math.min(Math.max(v, min), max) - min) / (max - min)) * 100;
  const edges = [min, ...thresholds, max];
  const segments = BANDS.map((band, i) => ({ ...band, from: at(edges[i]), to: at(edges[i + 1]) }));
  const ticks = thresholds.map((t) => ({ value: t, at: at(t) }));
  const place = (v) => (v !== null && v !== undefined && Number.isFinite(v)
    ? { at: at(v), outside: v < min ? "below" : v > max ? "above" : null }
    : null);
  return { min, max, segments, ticks, marker: place(value), reference: place(reference) };
}
