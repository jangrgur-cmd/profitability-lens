// fields.js: the input schema of the Company rating.
//
// One list drives the form, validation and JSON import/export, so a field is
// defined in exactly one place. Values are plain numbers in the user's
// currency; a blank optional field is null. Labels, help texts and messages
// live in the language files (src/shared/lang/, under rating.fields).

import { parseAmount } from "../shared/parse.js";
import { t } from "../shared/i18n.js";

/**
 * @typedef {object} FieldDef
 * @property {string} id key in the values object and in exported JSON
 * @property {"income"|"balance"|"prior"} group form section
 * @property {boolean} required
 * @property {"positive"|"nonNegative"|"any"} sign which values are allowed
 * @property {string} label form label, in the interface language
 * @property {string} help one or two sentences for the form
 * @property {string} altTerm the same item in the other language: the Croatian
 *   term on financial statements in the English interface, the English term in
 *   the Croatian one (its language is t("rating.altLang"))
 */

/**
 * Builds a field definition. Texts are getters, so they are read in the
 * current interface language each time (see src/shared/i18n.js).
 * @returns {FieldDef}
 */
function field(id, group, required, sign) {
  return {
    id, group, required, sign,
    get label() { return t(`rating.fields.${id}.label`); },
    get help() { return t(`rating.fields.${id}.help`); },
    get altTerm() { return t(`rating.fields.${id}.alt`); },
  };
}

/** @type {FieldDef[]} */
export const FIELDS = [
  field("revenue", "income", true, "positive"),
  field("cogs", "income", false, "nonNegative"),
  field("opex", "income", false, "nonNegative"),
  field("da", "income", false, "nonNegative"),
  field("otherIncome", "income", false, "any"),
  field("interest", "income", false, "nonNegative"),
  field("tax", "income", false, "any"),
  field("assets", "balance", true, "positive"),
  field("equity", "balance", true, "any"),
  field("currentLiabilities", "balance", false, "nonNegative"),
  field("debt", "balance", false, "nonNegative"),
  field("cash", "balance", false, "nonNegative"),
  field("priorAssets", "prior", false, "positive"),
  field("priorEquity", "prior", false, "any"),
];

/** Field definitions by id. */
export const FIELD_BY_ID = Object.fromEntries(FIELDS.map((f) => [f.id, f]));

/** Form sections in display order. */
export const GROUPS = ["income", "balance", "prior"].map((id) => ({
  id,
  get label() { return t(`rating.groups.${id}`); },
}));

/**
 * Version of the exported JSON format. Bump it when the format changes.
 * 1: one year as `inputs` (Phase 2). 2: up to five years as `years: [{year, inputs}]`, newest first.
 */
export const EXPORT_VERSION = 2;
const EXPORT_KIND = "profitability-lens/company-rating";

/**
 * Checks values that are already numbers (or null for blank).
 * @param {Record<string, number|null>} values
 * @returns {Record<string, string>} field id → error message; empty when valid
 */
export function validateValues(values) {
  const errors = {};
  for (const field of FIELDS) {
    const value = values[field.id] ?? null;
    if (value === null) {
      if (field.required) errors[field.id] = t("rating.validation.required", { label: field.label });
    } else if (!Number.isFinite(value)) {
      errors[field.id] = t("rating.validation.notNumber", { label: field.label });
    } else if (field.sign === "positive" && value <= 0) {
      errors[field.id] = t("rating.validation.positive", { label: field.label });
    } else if (field.sign === "nonNegative" && value < 0) {
      errors[field.id] = t("rating.validation.nonNegative", { label: field.label });
    }
  }
  return errors;
}

/**
 * Parses and validates the raw text of the form.
 * Unknown keys are ignored; missing keys count as blank.
 * @param {Record<string, string|number|null|undefined>} raw field id → typed text
 * @returns {{values: Record<string, number|null>, errors: Record<string, string>}}
 */
export function parseForm(raw) {
  const values = {};
  const parseErrors = {};
  for (const field of FIELDS) {
    const { value, error } = parseAmount(raw[field.id]);
    values[field.id] = value;
    if (error) parseErrors[field.id] = t("rating.validation.parse", { label: field.label, error });
  }
  return { values, errors: { ...validateValues(values), ...parseErrors } };
}

/** Every field of one year, blank as null. */
function inputsOf(values) {
  return Object.fromEntries(FIELDS.map((field) => [field.id, values[field.id] ?? null]));
}

/**
 * Builds the JSON text for "Export JSON".
 * @param {{year: number|null, values: Record<string, number|null>}[]} years newest first
 * @param {{industryId: string, companyName?: string}} meta
 * @returns {string}
 */
export function exportJson(years, { industryId, companyName = "" }) {
  const data = {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    companyName,
    industryId,
    years: years.map((y) => ({ year: y.year ?? null, inputs: inputsOf(y.values) })),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

const isObject = (x) => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Reads a file written by exportJson (format version 1 or 2). Amounts may be
 * numbers or typed text.
 * @param {string} text
 * @returns {{years: {year: number|null, values: Record<string, number|null>, errors: Record<string, string>}[],
 *            values: Record<string, number|null>, errors: Record<string, string>,
 *            industryId: string|null, companyName: string}}
 *   `values` and `errors` are those of the latest year (the first in `years`)
 * @throws {Error} when the text is not a Profitability Lens rating file
 */
export function importJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t("rating.importErrors.notJson"));
  }
  if (data?.kind !== EXPORT_KIND) throw new Error(t("rating.importErrors.notExport"));
  if (data.version > EXPORT_VERSION) {
    throw new Error(t("rating.importErrors.newer", { found: data.version, supported: EXPORT_VERSION }));
  }
  let entries;
  if (Array.isArray(data.years) && data.years.length > 0 && data.years.every((y) => isObject(y) && isObject(y.inputs))) {
    entries = data.years.map((y) => ({ year: Number.isInteger(y.year) ? y.year : null, inputs: y.inputs }));
  } else if (isObject(data.inputs)) {
    entries = [{ year: null, inputs: data.inputs }];
  } else {
    throw new Error(t("rating.importErrors.notExport"));
  }
  const years = entries.map((e) => ({ year: e.year, ...parseForm(e.inputs) }));
  return {
    years,
    values: years[0].values,
    errors: years[0].errors,
    industryId: typeof data.industryId === "string" ? data.industryId : null,
    companyName: typeof data.companyName === "string" ? data.companyName : "",
  };
}
