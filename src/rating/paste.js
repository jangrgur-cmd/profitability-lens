// paste.js (rating): turns statement lines pasted from Excel or a CSV file
// into the rating's fields, for one to five years.
//
//   Prihodi od prodaje     1.180.000   1.250.000
//   Materijalni troškovi     610.000     640.000
//   Troškovi osoblja         320.000     335.000
//   ...
//
// Labels are matched in English and Croatian (GFI-POD wording) after
// normalising them (lower case, no diacritics or numbering, see
// normalizeLabel). Each field has tiers of labels: the first tier found in
// the paste wins, so "Prihodi od prodaje" beats the broader "Poslovni
// prihodi". Fields that a statement splits over several lines (operating
// expenses by nature, bank loans short and long term…) add up every line of
// the winning tier; the others take one line. Costs are read as positive
// amounts whatever their sign in the paste.
//
// The label lists below are matching data, not interface text: they must
// recognise both languages whatever the interface language is.

import { normalizeLabel, parseGrid, cellNumber, isNumberCell } from "../shared/paste.js";
import { MAX_YEARS, YEAR_FIELD_IDS } from "./years.js";

/**
 * Label tiers per field (already normalised). `sum`: the field adds up all
 * lines of its winning tier. `cost`: amounts are taken as positive.
 */
export const LABELS = {
  revenue: {
    sum: true,
    tiers: [
      ["revenue", "revenues", "net revenue", "sales revenue", "sales", "net sales", "turnover",
        "prihodi od prodaje", "prihod od prodaje", "prihodi od prodaje proizvoda i usluga"],
      ["total revenue", "total revenues", "operating revenue", "operating income revenue", "poslovni prihodi", "ukupni poslovni prihodi"],
    ],
  },
  cogs: {
    sum: true,
    cost: true,
    tiers: [["cost of goods sold", "cogs", "cost of sales", "cost of revenue", "cost of revenues",
      "trosak prodanih proizvoda i robe", "trosak prodanih proizvoda", "troskovi prodanih proizvoda i robe"]],
  },
  opex: {
    sum: true,
    cost: true,
    tiers: [["operating expenses", "operating expenses excl d and a", "opex", "other operating expenses",
      "selling general and administrative expenses", "selling general and administrative", "sg and a",
      "selling and distribution expenses", "administrative expenses", "staff costs", "personnel expenses",
      "employee benefits expense", "materijalni troskovi", "troskovi osoblja", "ostali troskovi",
      "vrijednosna uskladenja", "rezerviranja", "ostali poslovni rashodi"]],
  },
  da: {
    sum: true,
    cost: true,
    tiers: [["depreciation and amortisation", "depreciation and amortization", "depreciation amortisation",
      "depreciation amortization", "d and a", "depreciation", "amortisation", "amortization", "amortizacija"]],
  },
  otherIncome: {
    sum: true,
    tiers: [["other financial income net", "net financial income", "financial income", "finance income",
      "other financial income", "financijski prihodi"]],
  },
  interest: {
    sum: true,
    cost: true,
    tiers: [
      ["interest expense", "interest expenses", "interest paid", "interest", "rashodi s osnove kamata",
        "rashodi od kamata", "troskovi kamata", "kamate"],
      ["finance costs", "financial expenses", "financijski rashodi"],
    ],
  },
  tax: {
    tiers: [["income tax", "income tax expense", "corporate income tax", "tax", "taxes", "porez na dobit", "porez na dobitak"]],
  },
  assets: {
    tiers: [["total assets", "assets", "ukupna aktiva", "ukupno aktiva", "aktiva ukupno", "ukupna imovina", "aktiva"]],
  },
  equity: {
    tiers: [["total equity", "equity", "shareholders equity", "total shareholders equity", "stockholders equity",
      "kapital i rezerve", "ukupni kapital", "vlastiti kapital", "kapital"]],
  },
  currentLiabilities: {
    tiers: [["current liabilities", "total current liabilities", "kratkorocne obveze", "ukupno kratkorocne obveze"]],
  },
  debt: {
    sum: true,
    tiers: [["interest bearing debt", "borrowings", "bank loans", "loans", "financial debt", "debt", "total debt",
      "obveze prema bankama i drugim financijskim institucijama", "obveze prema bankama", "krediti",
      "obveze po kreditima", "obveze za zajmove depozite i slicno"]],
  },
  cash: {
    tiers: [["cash and cash equivalents", "cash", "cash at bank and in hand", "novac u banci i blagajni",
      "novac i novcani ekvivalenti", "novac"]],
  },
};

/** Every label with its field and tier, longest first so the most specific match wins. */
const INDEX = Object.entries(LABELS)
  .flatMap(([fieldId, def]) => def.tiers.flatMap((tier, t) => tier.map((label) => ({ fieldId, tier: t, label }))))
  .sort((a, b) => b.label.length - a.label.length);

/**
 * The field a statement line belongs to: its normalised label equals a known
 * label or starts with one ("prihodi od prodaje izvan grupe").
 * @param {string} text the label as pasted
 * @returns {{fieldId: string, tier: number}|null}
 */
export function matchLabel(text) {
  const label = normalizeLabel(text);
  if (!label) return null;
  const hit = INDEX.find((e) => label === e.label || label.startsWith(`${e.label} `));
  return hit ? { fieldId: hit.fieldId, tier: hit.tier } : null;
}

/** Header words that mark a column of codes or notes, not amounts. */
const CODE_HEADER = /^(aop|aop oznaka|oznaka|rbr|r br|redni broj|rbr biljeske|biljeska|biljeske|br biljeske|note|notes|code)$/;
const YEAR = /\b(19\d\d|20\d\d)\b/;
const PRIOR_WORDS = /\b(prethodna|prethodno|prosla|prior|previous|last year)\b/;
const CURRENT_WORDS = /\b(tekuca|tekuce|ova|current|this year)\b/;

/**
 * @typedef {object} PasteColumn
 * @property {number} index column in the pasted grid
 * @property {string} header header text, or ""
 * @property {number|null} year a year named in the header
 * @property {-1|0|null} relative "prior year" (−1) or "current year" (0) in the header
 */

/**
 * @typedef {object} PasteRow
 * @property {string} label as pasted
 * @property {(number|null)[]} amounts one per value column
 * @property {string|null} fieldId the field this line was matched to, or null
 * @property {"matched"|"also"|"unknown"} status "also": the label is known but another line already fills that field
 * @property {string|null} suggestion for "also": the field it looks like
 */

/**
 * Reads a pasted statement.
 * @param {string} text
 * @returns {{columns: PasteColumn[], rows: PasteRow[], extraColumns: number,
 *            newestFirst: boolean|null, latestYear: number|null}}
 *   newestFirst/latestYear are null when the headers do not say; extraColumns
 *   counts value columns beyond MAX_YEARS that were left out
 */
export function readStatementPaste(text) {
  const grid = parseGrid(text);
  const width = Math.max(0, ...grid.map((r) => r.length));

  // A row is a header when it comes before the first matched line and has no amounts,
  // or only years as numbers.
  const firstData = grid.findIndex((r) => matchLabel(r[0] ?? "") !== null);
  const headerRows = grid.slice(0, firstData === -1 ? 0 : firstData)
    .filter((r) => r.slice(1).every((c) => c === "" || !isNumberCell(c) || /^(19|20)\d\d\.?$/.test(c)));
  const body = grid.filter((r) => !headerRows.includes(r));
  const headerOf = (i) => headerRows.map((r) => r[i] ?? "").filter(Boolean).join(" ");

  // Value columns: mostly numbers, and not a column of codes. A code column
  // (AOP numbers, note numbers) is named so in the header, or, without a
  // year in its header, holds only one- to three-digit whole numbers and
  // comes before the last column of amounts.
  const candidates = [];
  for (let i = 1; i < width; i += 1) {
    const cells = body.map((r) => r[i] ?? "").filter((c) => c !== "");
    if (cells.length === 0 || cells.filter(isNumberCell).length < cells.length / 2) continue;
    const header = headerOf(i);
    const norm = normalizeLabel(header);
    if (CODE_HEADER.test(norm)) continue;
    const named = YEAR.test(header) || PRIOR_WORDS.test(norm) || CURRENT_WORDS.test(norm);
    candidates.push({ index: i, codeLike: !named && cells.every((c) => /^\d{1,3}$/.test(c)) });
  }
  const last = candidates.at(-1)?.index;
  const valueIndexes = candidates.filter((c) => !c.codeLike || c.index === last).map((c) => c.index);
  const used = valueIndexes.slice(0, MAX_YEARS);

  const columns = used.map((index) => {
    const header = headerOf(index);
    const norm = normalizeLabel(header);
    const year = header.match(YEAR);
    return {
      index,
      header,
      year: year ? Number(year[1]) : null,
      relative: PRIOR_WORDS.test(norm) ? -1 : CURRENT_WORDS.test(norm) ? 0 : null,
    };
  });

  const rows = body.map((r) => {
    const match = matchLabel(r[0] ?? "");
    return { label: r[0] ?? "", amounts: used.map((i) => cellNumber(r[i] ?? "")), match };
  }).filter((r) => r.amounts.some((a) => a !== null));

  // For each field, keep the best tier; single-line fields keep the first line of it.
  const bestTier = {};
  for (const r of rows) if (r.match) bestTier[r.match.fieldId] = Math.min(bestTier[r.match.fieldId] ?? Infinity, r.match.tier);
  const taken = new Set();
  const out = rows.map(({ label, amounts, match }) => {
    if (!match) return { label, amounts, fieldId: null, status: "unknown", suggestion: null };
    const { fieldId, tier } = match;
    const ok = tier === bestTier[fieldId] && (LABELS[fieldId].sum || !taken.has(fieldId));
    if (!ok) return { label, amounts, fieldId: null, status: "also", suggestion: fieldId };
    taken.add(fieldId);
    return { label, amounts, fieldId, status: "matched", suggestion: null };
  });

  let newestFirst = null;
  const years = columns.map((c) => c.year);
  const relatives = columns.map((c) => c.relative);
  if (columns.length > 1 && years.every((y) => y !== null)) newestFirst = years[0] > years[1];
  else if (columns.length > 1 && relatives.every((x) => x !== null)) newestFirst = relatives[0] > relatives[1];
  const latestYear = years.every((y) => y !== null) && years.length > 0 ? Math.max(...years) : null;

  return { columns, rows: out, extraColumns: Math.max(0, valueIndexes.length - MAX_YEARS), newestFirst, latestYear };
}

/**
 * Builds the years for the form from the (possibly corrected) rows.
 * Each field adds up the rows assigned to it; a field with no amount in a
 * year is blank. The oldest year has no prior-year fields.
 * @param {PasteRow[]} rows with `fieldId` as matched or as the user chose
 * @param {number} columnCount
 * @param {{newestFirst: boolean, latestYear: number}} order
 * @returns {{year: number, values: Record<string, number|null>}[]} newest first
 */
export function pasteToYears(rows, columnCount, { newestFirst, latestYear }) {
  const years = [];
  for (let c = 0; c < columnCount; c += 1) {
    const values = Object.fromEntries([...YEAR_FIELD_IDS, "priorAssets", "priorEquity"].map((id) => [id, null]));
    for (const row of rows) {
      const amount = row.amounts[c];
      if (!row.fieldId || amount === null || amount === undefined) continue;
      const signed = LABELS[row.fieldId]?.cost ? Math.abs(amount) : amount;
      values[row.fieldId] = (values[row.fieldId] ?? 0) + signed;
    }
    years.push(values);
  }
  if (!newestFirst) years.reverse();
  return years.map((values, i) => ({ year: latestYear - i, values }));
}
