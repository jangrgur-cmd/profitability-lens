// parse.js: turns a typed amount into a number, in Croatian or English format.
//
// Accepted, all meaning the same kind of thing:
//   "1.234.567,89"  Croatian: dot for thousands, comma for decimals
//   "1,234,567.89"  English: comma for thousands, dot for decimals
//   "1 234 567"     spaces (or non-breaking spaces) for thousands
//   "(12.500)"      accounting brackets: a negative number
//   "€ 1.000", "1.000 EUR", "-500 kn"   currency symbols and codes are ignored
//
// Which separator is the decimal one:
// - Both "." and "," appear: the last one is the decimal separator.
// - Only one kind appears, more than once ("1.234.567"): thousands separator.
// - Only one kind appears, once: thousands if exactly three digits follow and
//   the digits before it form a valid first group (1–3 digits, not "0");
//   otherwise decimal. So "1.234" = 1234, "1,5" = 1.5, "0,125" = 0.125,
//   "12.50" = 12.5, "1234.567" = 1234.567.
// - Spaces were used for thousands ("1 234,567"): a lone "." or "," is decimal.

import { t } from "./i18n.js";

const CURRENCY = /€|\$|£|(?<![a-z])(?:eur|usd|gbp|hrk|kn)(?![a-z])/gi;
const SPACES = /[\s  ]/g;
const MINUS_SIGNS = /^[-−–]/;

/**
 * Parses a typed amount.
 * Blank input (empty, only spaces) is not an error: it means "not given".
 * @param {string|number|null|undefined} input
 * @returns {{value: number|null, error: string|null}}
 *   value: the number, or null when the input is blank or invalid;
 *   error: a short message for the user when the input is not a number.
 */
export function parseAmount(input) {
  if (input === null || input === undefined) return blank();
  if (typeof input === "number") {
    return Number.isFinite(input) ? { value: input, error: null } : invalid();
  }
  let text = String(input).replace(CURRENCY, "").trim();
  if (text === "") return blank();

  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  if (MINUS_SIGNS.test(text)) {
    if (negative) return invalid();
    negative = true;
    text = text.slice(1).trim();
  } else if (text.startsWith("+")) {
    text = text.slice(1).trim();
  }

  const spaceGrouped = /\d[\s  ]+\d/.test(text);
  if (spaceGrouped && !/^\d{1,3}([\s  ]+\d{3})*([.,]\d*)?$/.test(text)) return invalid();
  text = text.replace(SPACES, "");

  const normalized = normalizeSeparators(text, spaceGrouped);
  if (normalized === null || !/^(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return invalid();

  const value = Number(normalized);
  return { value: negative && value !== 0 ? -value : value, error: null };
}

/**
 * Rewrites a digits-and-separators string with "." as the only (decimal)
 * separator, or returns null when the grouping is not valid.
 * @param {string} text no spaces, no sign
 * @param {boolean} spaceGrouped true when spaces already served as thousands separators
 * @returns {string|null}
 */
function normalizeSeparators(text, spaceGrouped) {
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot === -1 && lastComma === -1) return text;

  if (lastDot !== -1 && lastComma !== -1) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    const decimalAt = text.lastIndexOf(decimal);
    const whole = text.slice(0, decimalAt);
    if (whole.includes(decimal) || !isGrouped(whole, thousands)) return null;
    return `${whole.split(thousands).join("")}.${text.slice(decimalAt + 1)}`;
  }

  const sep = lastDot !== -1 ? "." : ",";
  const parts = text.split(sep);
  if (parts.length > 2) {
    return isGrouped(text, sep) ? parts.join("") : null;
  }
  const [whole, fraction] = parts;
  const looksLikeThousands = !spaceGrouped && fraction.length === 3 && /^[1-9]\d{0,2}$/.test(whole);
  return looksLikeThousands ? whole + fraction : `${whole}.${fraction}`;
}

/** True when `text` is digits grouped in threes by `sep`: "1,234,567" or "12". */
function isGrouped(text, sep) {
  const [first, ...rest] = text.split(sep);
  if (rest.length === 0) return /^\d+$/.test(first);
  return /^\d{1,3}$/.test(first) && rest.every((g) => /^\d{3}$/.test(g));
}

function blank() {
  return { value: null, error: null };
}

function invalid() {
  return { value: null, error: t("parse.notANumber") };
}
