// status.js: how bands, grades and flag severities look, shared by both modules.
// Every status has an icon and a word, so it never depends on colour alone.

import { h } from "./dom.js";
import { t } from "./i18n.js";

/** Benchmark bands (ids from margin.js BANDS): icon shown before the label. */
export const BAND_ICONS = { poor: "✕", weak: "▼", fair: "●", good: "▲", excellent: "★" };

/** The band colour that goes with each grade letter. */
export const GRADE_TONES = { A: "excellent", B: "good", C: "fair", D: "weak", E: "poor" };

/** Flag severities: icon (the label is rating.severities.<id> in the language files). */
export const SEVERITY_ICONS = { critical: "■", serious: "▲", warning: "●", info: "i" };

/**
 * A pill with an icon and a label, coloured by tone.
 * @param {string} tone a band id, a severity, or "none"
 * @param {string} icon
 * @param {string} label
 */
export function pill(tone, icon, label) {
  return h("span", { class: `pill tone-${tone}` }, h("span", { class: "pill__icon", "aria-hidden": "true" }, icon), label);
}

/** A benchmark band pill: "▲ Good". */
export function bandPill(band) {
  return pill(band.id, BAND_ICONS[band.id], band.label);
}

/** A severity pill: "■ Critical". */
export function severityPill(severity) {
  return pill(severity, SEVERITY_ICONS[severity], t(`rating.severities.${severity}`));
}
