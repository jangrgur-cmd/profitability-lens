// fields.js: the input schema of the Company rating.
//
// One list drives the form, validation and JSON import/export, so a field is
// defined in exactly one place. Values are plain numbers in the user's
// currency; a blank optional field is null.

import { parseAmount } from "../shared/parse.js";

/**
 * @typedef {object} FieldDef
 * @property {string} id key in the values object and in exported JSON
 * @property {string} label form label
 * @property {"income"|"balance"|"prior"} group form section
 * @property {boolean} required
 * @property {"positive"|"nonNegative"|"any"} sign which values are allowed
 * @property {string} hr the Croatian term on financial statements
 * @property {string} help one or two sentences for the form
 */

/** @type {FieldDef[]} */
export const FIELDS = [
  {
    id: "revenue", label: "Revenue", group: "income", required: true, sign: "positive",
    hr: "poslovni prihodi / prihodi od prodaje",
    help: "Sales of goods and services for the year, excluding VAT.",
  },
  {
    id: "cogs", label: "Cost of goods sold", group: "income", required: false, sign: "nonNegative",
    hr: "nabavna vrijednost prodane robe / troškovi prodanih proizvoda",
    help: "Direct cost of what was sold. Leave blank if your statement lists costs by nature (materials, staff…): gross margin is then skipped and all costs go under operating expenses.",
  },
  {
    id: "opex", label: "Operating expenses (excl. D&A)", group: "income", required: false, sign: "nonNegative",
    hr: "poslovni rashodi bez amortizacije",
    help: "All other operating costs: staff, materials, services, rent, marketing. Do not include depreciation and amortisation.",
  },
  {
    id: "da", label: "Depreciation & amortisation", group: "income", required: false, sign: "nonNegative",
    hr: "amortizacija",
    help: "The year's write-down of fixed and intangible assets.",
  },
  {
    id: "otherIncome", label: "Other financial income, net", group: "income", required: false, sign: "any",
    hr: "ostali financijski prihodi umanjeni za financijske rashode (bez kamata)",
    help: "Financial income minus financial costs other than interest, e.g. exchange-rate gains and losses. May be negative.",
  },
  {
    id: "interest", label: "Interest expense", group: "income", required: false, sign: "nonNegative",
    hr: "rashodi s osnove kamata",
    help: "Interest paid or accrued on loans, bonds and leases.",
  },
  {
    id: "tax", label: "Income tax", group: "income", required: false, sign: "any",
    hr: "porez na dobit",
    help: "Corporate income tax for the year. Negative if it is a tax credit.",
  },
  {
    id: "assets", label: "Total assets", group: "balance", required: true, sign: "positive",
    hr: "ukupna aktiva",
    help: "Everything the company owns at year end; equals total liabilities plus equity.",
  },
  {
    id: "equity", label: "Total equity", group: "balance", required: true, sign: "any",
    hr: "kapital i rezerve",
    help: "Owners' capital at year end: share capital, reserves and retained earnings. Negative if accumulated losses exceed capital.",
  },
  {
    id: "currentLiabilities", label: "Current liabilities", group: "balance", required: false, sign: "nonNegative",
    hr: "kratkoročne obveze",
    help: "Obligations due within one year: suppliers, short-term loans, taxes, wages. Needed for ROCE.",
  },
  {
    id: "debt", label: "Interest-bearing debt", group: "balance", required: false, sign: "nonNegative",
    hr: "obveze po kreditima i zajmovima (kamatonosne obveze)",
    help: "Bank loans, bonds and leases, short and long term. Enter 0 if there are none. Needed for ROIC.",
  },
  {
    id: "cash", label: "Cash", group: "balance", required: false, sign: "nonNegative",
    hr: "novac u banci i blagajni",
    help: "Cash and cash equivalents at year end. Used for ROIC; treated as 0 if blank.",
  },
  {
    id: "priorAssets", label: "Total assets, prior year", group: "prior", required: false, sign: "positive",
    hr: "ukupna aktiva, prethodna godina",
    help: "Optional. Used to average assets over the year for ROA.",
  },
  {
    id: "priorEquity", label: "Total equity, prior year", group: "prior", required: false, sign: "any",
    hr: "kapital i rezerve, prethodna godina",
    help: "Optional. Used to average equity over the year for ROE.",
  },
];

/** Field definitions by id. */
export const FIELD_BY_ID = Object.fromEntries(FIELDS.map((f) => [f.id, f]));

/** Form sections in display order. */
export const GROUPS = [
  { id: "income", label: "Income statement (current year)" },
  { id: "balance", label: "Balance sheet (year end)" },
  { id: "prior", label: "Prior year (optional)" },
];

/** Version of the exported JSON format. Bump it when the format changes. */
export const EXPORT_VERSION = 1;
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
      if (field.required) errors[field.id] = `${field.label} is required.`;
    } else if (!Number.isFinite(value)) {
      errors[field.id] = `${field.label} must be a number.`;
    } else if (field.sign === "positive" && value <= 0) {
      errors[field.id] = `${field.label} must be greater than zero.`;
    } else if (field.sign === "nonNegative" && value < 0) {
      errors[field.id] = `${field.label} cannot be negative.`;
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
    if (error) parseErrors[field.id] = `${field.label}: ${error}`;
  }
  return { values, errors: { ...validateValues(values), ...parseErrors } };
}

/**
 * Builds the JSON text for "Export JSON".
 * @param {Record<string, number|null>} values
 * @param {{industryId: string, companyName?: string}} meta
 * @returns {string}
 */
export function exportJson(values, { industryId, companyName = "" }) {
  const inputs = {};
  for (const field of FIELDS) inputs[field.id] = values[field.id] ?? null;
  return `${JSON.stringify({ kind: EXPORT_KIND, version: EXPORT_VERSION, companyName, industryId, inputs }, null, 2)}\n`;
}

/**
 * Reads a file written by exportJson. Amounts may be numbers or typed text.
 * @param {string} text
 * @returns {{values: Record<string, number|null>, errors: Record<string, string>,
 *            industryId: string|null, companyName: string}}
 * @throws {Error} when the text is not a Profitability Lens rating file
 */
export function importJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (data?.kind !== EXPORT_KIND || typeof data.inputs !== "object" || data.inputs === null) {
    throw new Error("This file is not a Profitability Lens company rating export.");
  }
  if (data.version > EXPORT_VERSION) {
    throw new Error(`This file was made by a newer version (format ${data.version}); this page reads format ${EXPORT_VERSION}.`);
  }
  return {
    ...parseForm(data.inputs),
    industryId: typeof data.industryId === "string" ? data.industryId : null,
    companyName: typeof data.companyName === "string" ? data.companyName : "",
  };
}
