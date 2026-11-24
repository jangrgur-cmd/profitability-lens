// format.js: every number, percentage and currency shown in either module.
//
// Conventions:
// - Shares are fractions (0.2214), shown as percentages ("22.1%").
// - Negative numbers get a typographic minus sign, never a hyphen.
// - Missing values (null, undefined, NaN) are shown as "n/a".
// - EUR amounts are abbreviated (€1.2M, €45.3k).

/**
 * Typographic minus sign (same width as a digit), followed by a word joiner so
 * a line never breaks between the sign and the number.
 */
export const MINUS = "−⁠";

/** True for null, undefined and NaN: values the UI shows as "n/a". */
function isMissing(value) {
  return value === null || value === undefined || Number.isNaN(value);
}

/** Adds a typographic minus for negative numbers. */
function signed(text, value) {
  return value < 0 ? MINUS + text : text;
}

/** "1.2M", "45.3k", "512": an absolute value in short form, without a sign. */
function shortForm(abs) {
  if (abs >= 1e9) return `${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(abs / 1e3).toFixed(1)}k`;
  return abs.toFixed(0);
}

/**
 * Formats a euro amount in short form.
 * 1 234 567 → "€1.2M", 45 300 → "€45.3k", 512 → "€512", −15 244 → "−€15.2k".
 * @param {number|null} value
 * @returns {string}
 */
export function formatEur(value) {
  if (isMissing(value)) return "n/a";
  return signed(`€${shortForm(Math.abs(value))}`, value);
}

/** Like formatEur, with an explicit "+" for gains: "+€1.2M", "−€310.5k". */
export function formatSignedEur(value) {
  return value > 0 ? `+${formatEur(value)}` : formatEur(value);
}

/**
 * Formats a share as a percentage: 0.2214 → "22.1%" (one decimal by default).
 * null (for example a margin on zero revenue) → "n/a".
 * @param {number|null} share
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPct(share, decimals = 1) {
  if (isMissing(share)) return "n/a";
  return signed(`${Math.abs(share * 100).toFixed(decimals)}%`, share);
}

/** A share with an explicit sign: "+15.0%", "−10.0%", "0.0%". */
export function formatSignedPct(share) {
  return share > 0 ? `+${formatPct(share)}` : formatPct(share);
}

/**
 * A change between two shares in percentage points: 0.012 → "+1.2 pp".
 * @param {number|null} diff difference of two shares
 */
export function formatPp(diff) {
  if (isMissing(diff)) return "n/a";
  const text = `${Math.abs(diff * 100).toFixed(1)} pp`;
  return diff > 0 ? `+${text}` : signed(text, diff);
}

/** Formats a per-message amount: 0.012345 → "0.0123 €/msg". */
export function formatPerMessage(value) {
  if (isMissing(value)) return "n/a";
  return signed(`${Math.abs(value).toFixed(4)} €/msg`, value);
}

/** Formats a count in short form: 821 584 062 → "821.6M". */
export function formatCount(value) {
  if (isMissing(value)) return "n/a";
  return signed(shortForm(Math.abs(value)), value);
}

/** Formats a whole number with thousands separators: 1234567 → "1,234,567". */
export function formatInteger(value) {
  if (isMissing(value)) return "n/a";
  return signed(Math.abs(Math.round(value)).toLocaleString("en-US"), value);
}

/**
 * Formats a multiple, such as asset turnover or interest cover: 2.5 → "2.50×".
 * @param {number|null} value
 * @param {number} [decimals=2]
 */
export function formatMultiple(value, decimals = 2) {
  if (isMissing(value)) return "n/a";
  return signed(`${Math.abs(value).toFixed(decimals)}×`, value);
}

/**
 * CSS class for colouring a figure by sign: "pos" (green) for a gain or a
 * positive margin, "neg" (red) for a loss, "" for zero or n/a.
 * Pass `higherIsBetter = false` for figures where an increase hurts profit
 * (e.g. a cost increase), so the colour always means "good" or "bad".
 */
export function toneClass(value, higherIsBetter = true) {
  if (isMissing(value) || value === 0) return "";
  return (value > 0) === higherIsBetter ? "pos" : "neg";
}
