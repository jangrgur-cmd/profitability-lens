// format.js: every number, percentage and currency shown in either module.
//
// Formatting follows the interface language (src/shared/i18n.js); the
// separators, units and patterns come from the "format" section of the
// language files:
//   English   €1.2M   €2,400,000   22.1%    +1.2 pp     2.50×
//   Croatian  1,2 mil. €   2.400.000 €   22,1 %   +1,2 p. b.   2,50×
//
// Conventions:
// - Shares are fractions (0.2214), shown as percentages.
// - Negative numbers get a typographic minus sign, never a hyphen.
// - Missing values (null, undefined, NaN) are shown as "n/a" ("n/d" in Croatian).
// - EUR amounts are abbreviated (€1.2M, €45.3k) unless formatted in full.

import { t } from "./i18n.js";

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

/** Puts the thousands separator into a string of digits. */
function group(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, t("format.group"));
}

/**
 * A non-negative number with a fixed number of decimals, in the language's
 * separators: 1234.5 → "1234.50" (EN) or "1234,50" (HR) with 2 decimals, or
 * "1,234.50" / "1.234,50" when grouped.
 * @param {number} abs
 * @param {number} decimals
 * @param {boolean} [grouped=false] whether to add thousands separators (only
 *   full amounts and whole numbers have them; percentages and multiples do not)
 */
function digits(abs, decimals, grouped = false) {
  const [whole, fraction] = abs.toFixed(decimals).split(".");
  const head = grouped ? group(whole) : whole;
  return fraction === undefined ? head : `${head}${t("format.decimal")}${fraction}`;
}

/** "1.2M", "45.3k", "512" (EN) or "1,2 mil.", "45,3 tis.", "512" (HR): an absolute value in short form. */
function shortForm(abs) {
  if (abs >= 1e9) return `${digits(abs / 1e9, 1)}${t("format.billion")}`;
  if (abs >= 1e6) return `${digits(abs / 1e6, 1)}${t("format.million")}`;
  if (abs >= 1e3) return `${digits(abs / 1e3, 1)}${t("format.thousand")}`;
  return digits(abs, 0);
}

/** The text for a missing value: "n/a". */
export function notAvailable() {
  return t("format.na");
}

/**
 * Formats a euro amount in short form.
 * 1 234 567 → "€1.2M", 45 300 → "€45.3k", 512 → "€512", −15 244 → "−€15.2k".
 * @param {number|null} value
 * @returns {string}
 */
export function formatEur(value) {
  if (isMissing(value)) return notAvailable();
  return signed(t("format.eur", { n: shortForm(Math.abs(value)) }), value);
}

/**
 * Formats a euro amount in full, rounded to whole euros: 1 234 567 → "€1,234,567",
 * −1 500 → "−€1,500". Used where the user should recognise their own figures.
 * @param {number|null} value
 * @returns {string}
 */
export function formatEurFull(value) {
  if (isMissing(value)) return notAvailable();
  const rounded = Math.round(value);
  return signed(t("format.eur", { n: digits(Math.abs(rounded), 0, true) }), rounded);
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
  if (isMissing(share)) return notAvailable();
  return signed(t("format.pct", { n: digits(Math.abs(share * 100), decimals) }), share);
}

/**
 * A value that is already in percent, with as many decimals as it has:
 * 2.5 → "2.5%", 15 → "15%". Used for benchmark thresholds.
 * @param {number} percent
 */
export function formatPercentValue(percent) {
  if (isMissing(percent)) return notAvailable();
  const abs = Math.abs(percent);
  const decimals = (String(abs).split(".")[1] ?? "").length;
  return signed(t("format.pct", { n: digits(abs, decimals) }), percent);
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
  if (isMissing(diff)) return notAvailable();
  const text = t("format.pp", { n: digits(Math.abs(diff * 100), 1) });
  return diff > 0 ? `+${text}` : signed(text, diff);
}

/** Formats a per-message amount: 0.012345 → "0.0123 €/msg". */
export function formatPerMessage(value) {
  if (isMissing(value)) return notAvailable();
  return signed(t("format.perMessage", { n: digits(Math.abs(value), 4) }), value);
}

/** Formats a count in short form: 821 584 062 → "821.6M". */
export function formatCount(value) {
  if (isMissing(value)) return notAvailable();
  return signed(shortForm(Math.abs(value)), value);
}

/** Formats a whole number with thousands separators: 1234567 → "1,234,567". */
export function formatInteger(value) {
  if (isMissing(value)) return notAvailable();
  return signed(digits(Math.abs(Math.round(value)), 0, true), value);
}

/**
 * Formats a plain number with a fixed number of decimals and the language's
 * decimal separator, without thousands separators: 1.13 → "1.130" (EN) or
 * "1,130" (HR) with 3 decimals.
 * @param {number|null} value
 * @param {number} decimals
 */
export function formatNumber(value, decimals) {
  if (isMissing(value)) return notAvailable();
  return signed(digits(Math.abs(value), decimals), value);
}

/**
 * Formats a multiple, such as asset turnover or interest cover: 2.5 → "2.50×".
 * @param {number|null} value
 * @param {number} [decimals=2]
 */
export function formatMultiple(value, decimals = 2) {
  if (isMissing(value)) return notAvailable();
  return signed(`${digits(Math.abs(value), decimals)}×`, value);
}

/**
 * An amount per euro, two decimals: 0.096 → "€0.10" (EN) or "0,10 €" (HR).
 * @param {number|null} value
 */
export function formatPerEuro(value) {
  if (isMissing(value)) return notAvailable();
  return signed(t("format.eur", { n: digits(Math.abs(value), 2) }), value);
}

/**
 * An amount as it is written into a form field, so the user can read it and
 * the parser reads it back: 2400000 → "2,400,000" (EN) or "2.400.000" (HR),
 * at most two decimals, with a plain hyphen for negatives. Blank for null.
 * @param {number|null} value
 */
export function formatAmountInput(value) {
  if (isMissing(value)) return "";
  const abs = Math.abs(value);
  const decimals = Number.isInteger(Math.round(abs * 100) / 100) ? 0 : 2;
  let text = digits(abs, decimals, true);
  if (decimals === 2) text = text.replace(/0$/, "");
  return value < 0 ? `-${text}` : text;
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
