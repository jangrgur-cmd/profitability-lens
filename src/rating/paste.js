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
import { MAX_YEARS, YEAR_FIELD_IDS, validateYears } from "./years.js";
import { deriveStatement } from "./ratios.js";

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
  otherOpIncome: {
    sum: true,
    tiers: [["other operating income", "other operating revenue", "other operating revenues", "own work capitalised",
      "ostali poslovni prihodi", "prihodi na temelju upotrebe vlastitih proizvoda"], ["other income"]],
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
      "employee benefits expense", "poslovni rashodi bez amortizacije", "materijalni troskovi", "troskovi osoblja", "ostali troskovi",
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
      "other financial income", "ostali financijski prihodi neto", "ostali financijski prihodi", "financijski prihodi"]],
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
    tiers: [["interest bearing debt", "kamatonosne obveze", "borrowings", "bank loans", "loans", "financial debt", "debt", "total debt",
      "obveze prema bankama i drugim financijskim institucijama", "obveze prema bankama", "krediti",
      "obveze po kreditima", "obveze za zajmove depozite i slicno"]],
  },
  cash: {
    tiers: [["cash and cash equivalents", "cash", "cash at bank and in hand", "novac u banci i blagajni",
      "novac i novcani ekvivalenti", "novac"]],
  },
};

/**
 * Guesses for lines no label matches, by key words (normalised text). The
 * first rule that fits wins, so cash comes before loans ("novac u banci") and
 * interest income before interest expense. A guess is only a suggestion: the
 * preview marks it and the user can change it.
 */
const SUGGEST_RULES = [
  ["cash", /\b(novac|novca|novcan\w*|blagajn\w*|cash)\b/],
  ["currentLiabilities", /\b(kratkorocn\w* obvez\w*|current liabilit\w*|short term liabilit\w*)/],
  ["debt", /\b(kredit\w*|zajm\w*|zajam|loans?|borrowings?|leasing\w*|lease liabilit\w*|bonds?|obveznic\w*)\b/],
];
const SUGGEST_RULES_AFTER_BALANCE = [
  ["equity", /\b(kapital i rezerve|equity|glavnica)\b/],
  ["assets", /\b(aktiva)\b/],
  ["da", /\b(amorti[sz]\w*|depreci\w*|deprecijac\w*)\b/],
  ["otherIncome", /\b(financijsk\w* prihod\w*|prihod\w* od kamat\w*|interest income|finance income|financial income|investment income|dividend\w*)\b/],
  ["interest", /\b(kamat\w*|interest)\b/],
  ["tax", /\b(porez\w* na dobit\w*|income tax\w*|corporate tax\w*|tax expense)\b/],
  ["cogs", /\b(cost of (goods|sales|revenue|products)|nabavn\w* vrijednost\w*|prodan\w* rob\w*)\b/],
  ["otherOpIncome", /\b(ostal\w* poslovn\w* prihod\w*|other operating (income|revenue)s?|subvencij\w*|potpor\w*|grants?|subsid\w*)\b/],
  ["revenue", /\b(prihod\w*|revenues?|sales|turnover)\b/],
  ["opex", /\b(trosk\w*|rashod\w*|expenses?|costs?|wages|salar\w*|rent|najam\w*|zakup\w*|energij\w*|marketing)\b/],
];
/**
 * Subtotals, results and parts of a total: never guessed into a field, where
 * they would double count (*Poslovni rashodi* holds D&A too, *Upisani kapital*
 * is only part of equity).
 */
const NO_GUESS = /\b(dobit\w*|gubit\w*|profit|loss|ebitda|ebit|ebt|rezultat\w*|result|pasiva|ukupn\w*|total|subtotal|margin\w*|marz\w*|bruto|neto|net|gross|upisani|temeljni|share capital|poslovn\w* rashod\w*|financijsk\w* rashod\w*|financial expenses?|finance costs?)\b/;
/** Balance-sheet lines that belong to none of the fields (payables, receivables, stock…). */
const OTHER_BALANCE = /\b(obvez\w*|liabilit\w*|payables?|dobavljac\w*|rezerviranj\w*|provisions?|potrazivanj\w*|receivables?|zalih\w*|inventor\w*|imovin\w*|assets?)\b/;

/**
 * Suggests a field for a line that no label matches, or null.
 *   "Troškovi prodaje" → opex, "Prihodi od kamata" → otherIncome,
 *   "Dobit razdoblja" → null (a result), "Obveze prema dobavljačima" → null
 * @param {string} text the label as pasted
 * @returns {string|null} field id
 */
export function suggestField(text) {
  const label = normalizeLabel(text);
  if (!label || NO_GUESS.test(label)) return null;
  for (const [fieldId, rule] of SUGGEST_RULES) if (rule.test(label)) return fieldId;
  if (OTHER_BALANCE.test(label)) return null;
  for (const [fieldId, rule] of SUGGEST_RULES_AFTER_BALANCE) if (rule.test(label)) return fieldId;
  return null;
}

/**
 * Result and total lines a statement often shows. They are not inputs, but
 * the check compares them with what the engine calculates from the inputs.
 * `kind`: "signed" (a loss is negative), "profit" (profit only, 0 in a loss
 * year) or "loss" (a loss shown as a positive amount).
 */
export const RESULT_LABELS = {
  grossProfit: [["gross profit", "signed"]],
  ebitda: [["ebitda", "signed"]],
  ebit: [["ebit", "signed"], ["operating profit", "signed"], ["operating result", "signed"], ["profit from operations", "signed"],
    ["dobit ili gubitak iz poslovanja", "signed"], ["dobit iz poslovanja", "signed"], ["poslovni rezultat", "signed"],
    ["rezultat iz poslovanja", "signed"]],
  ebt: [["ebt", "signed"], ["profit before tax", "signed"], ["profit before income tax", "signed"], ["profit or loss before tax", "signed"],
    ["earnings before tax", "signed"], ["dobit ili gubitak prije oporezivanja", "signed"], ["dobit prije oporezivanja", "profit"],
    ["gubitak prije oporezivanja", "loss"], ["rezultat prije oporezivanja", "signed"]],
  netIncome: [["net income", "signed"], ["net profit", "signed"], ["profit for the year", "signed"], ["profit or loss for the year", "signed"],
    ["profit after tax", "signed"], ["net earnings", "signed"], ["net loss", "loss"], ["dobit ili gubitak razdoblja", "signed"],
    ["dobit ili gubitak nakon oporezivanja", "signed"], ["dobit razdoblja", "profit"], ["neto dobit", "profit"],
    ["dobit nakon oporezivanja", "profit"], ["gubitak razdoblja", "loss"], ["neto rezultat", "signed"]],
  liabilitiesAndEquity: [["total liabilities and equity", "signed"], ["total equity and liabilities", "signed"],
    ["ukupna pasiva", "signed"], ["ukupno pasiva", "signed"], ["pasiva ukupno", "signed"], ["pasiva", "signed"]],
};

const RESULT_INDEX = Object.entries(RESULT_LABELS)
  .flatMap(([id, labels]) => labels.map(([label, kind]) => ({ id, label, kind })))
  .sort((a, b) => b.label.length - a.label.length);

/**
 * The result line a label names, if any ("Dobit ili gubitak razdoblja" → net income).
 * @param {string} text the label as pasted
 * @returns {{id: string, kind: "signed"|"profit"|"loss"}|null}
 */
export function matchResult(text) {
  const { field, result } = lookup(text);
  return result && !(field && field.label.length >= result.label.length) ? { id: result.id, kind: result.kind } : null;
}

/** Every label with its field and tier, longest first so the most specific match wins. */
const INDEX = Object.entries(LABELS)
  .flatMap(([fieldId, def]) => def.tiers.flatMap((tier, t) => tier.map((label) => ({ fieldId, tier: t, label }))))
  .sort((a, b) => b.label.length - a.label.length);

/**
 * The field a statement line belongs to: its normalised label equals a known
 * label or starts with one ("prihodi od prodaje izvan grupe"), unless a
 * longer result label fits (see lookup).
 * @param {string} text the label as pasted
 * @returns {{fieldId: string, tier: number}|null}
 */
export function matchLabel(text) {
  const { field, result } = lookup(text);
  return field && !(result && result.label.length > field.label.length) ? { fieldId: field.fieldId, tier: field.tier } : null;
}

/**
 * The longest field label and the longest result label a line starts with.
 * The longer of the two decides: "Total equity and liabilities" is a total,
 * not "Total equity".
 */
function lookup(text) {
  const label = normalizeLabel(text);
  const fits = (e) => label === e.label || label.startsWith(`${e.label} `);
  return label ? { field: INDEX.find(fits) ?? null, result: RESULT_INDEX.find(fits) ?? null } : { field: null, result: null };
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
 * @property {"matched"|"suggested"|"also"|"result"|"unknown"} status
 *   "suggested": no label matched, a key word did (suggestField) and the field was empty;
 *   "also": the line looks like a field that other lines already fill, so it is not added;
 *   "result": a result or total line (matchResult), used only by checkPaste
 * @property {string|null} suggestion for "suggested" and "also": the field it looks like
 * @property {{id: string, kind: string}|null} result for "result": which result line
 * @property {boolean} guessed the field came from a key word (suggestField), not a label
 * @property {boolean} byCheck an "also" line that resolveByResults added because only then do the result lines agree
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
    const row = { label, amounts, fieldId: null, status: "unknown", suggestion: null, result: null, guessed: false, byCheck: false };
    if (!match) {
      row.result = matchResult(label);
      if (row.result) row.status = "result";
      return row;
    }
    const { fieldId, tier } = match;
    const ok = tier === bestTier[fieldId] && (LABELS[fieldId].sum || !taken.has(fieldId));
    if (!ok) return { ...row, status: "also", suggestion: fieldId };
    taken.add(fieldId);
    return { ...row, fieldId, status: "matched" };
  });

  // Lines no label matched: a key-word guess goes in only while its field is
  // still empty, so a part of a line already matched ("Troškovi sirovina"
  // under "Materijalni troškovi") is never counted twice.
  const filled = new Set(taken);
  for (const row of out) {
    if (row.status !== "unknown") continue;
    const guess = suggestField(row.label);
    if (!guess) continue;
    row.suggestion = guess;
    row.guessed = true;
    if (filled.has(guess)) { row.status = "also"; continue; }
    row.fieldId = guess;
    row.status = "suggested";
    if (!LABELS[guess].sum) filled.add(guess);
  }
  resolveByResults(out, used.length);

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
  for (let c = 0; c < columnCount; c += 1) years.push(columnValues(rows, c));
  if (!newestFirst) years.reverse();
  return years.map((values, i) => ({ year: latestYear - i, values }));
}

/** One column's field values: the rows assigned to a field added up, costs as positive amounts. */
function columnValues(rows, column) {
  const values = Object.fromEntries([...YEAR_FIELD_IDS, "priorAssets", "priorEquity"].map((id) => [id, null]));
  for (const row of rows) {
    const amount = row.amounts[column];
    if (!row.fieldId || amount === null || amount === undefined) continue;
    const signed = LABELS[row.fieldId]?.cost ? Math.abs(amount) : amount;
    values[row.fieldId] = (values[row.fieldId] ?? 0) + signed;
  }
  return values;
}

/** Result lines that the income statement's inputs decide (total equity and liabilities is checked against assets instead). */
const STATEMENT_RESULTS = ["grossProfit", "ebitda", "ebit", "ebt", "netIncome"];
/** At most this many lines are tried in resolveByResults (2^12 combinations). */
const MAX_TRIED = 12;

/**
 * Compares the statement's result lines with what the engine calculates, in every column.
 * @returns {boolean|null} null when no result line could be compared
 */
function resultsAgree(rows, columnCount) {
  let compared = 0;
  for (let c = 0; c < columnCount; c += 1) {
    const values = columnValues(rows, c);
    if (values.revenue === null) continue;
    const statement = deriveStatement(values);
    for (const id of STATEMENT_RESULTS) {
      const pasted = resultAmount(rows, id, c);
      if (pasted === null || statement[id] === null) continue;
      compared += 1;
      if (Math.abs(pasted - statement[id]) > tolerance(values)) return false;
    }
  }
  return compared > 0 ? true : null;
}

/**
 * Lines that look like a field other lines already fill ("also") may be a
 * part of those lines (*Troškovi sirovina* under *Materijalni troškovi*) or
 * a cost of their own (*Troškovi marketinga* next to it). Labels cannot tell;
 * the statement's own result lines can. When the paste has net profit, EBIT
 * or a similar line that the lines do not add up to, the smallest set of
 * these lines that makes every result line agree is added (marked byCheck).
 * Nothing changes when the results already agree, cannot be compared, or no
 * set of lines makes them agree. Changes rows in place.
 * @param {PasteRow[]} rows
 * @param {number} columnCount
 */
export function resolveByResults(rows, columnCount) {
  const tried = rows.filter((r) => r.status === "also" && r.suggestion && LABELS[r.suggestion].sum).slice(0, MAX_TRIED);
  if (tried.length === 0 || resultsAgree(rows, columnCount) !== false) return;
  const masks = Array.from({ length: 2 ** tried.length - 1 }, (_, i) => i + 1);
  const bits = (m) => m.toString(2).replace(/0/g, "").length;
  masks.sort((a, b) => bits(a) - bits(b) || a - b);
  for (const mask of masks) {
    tried.forEach((r, i) => { r.fieldId = mask & (1 << i) ? r.suggestion : null; });
    if (resultsAgree(rows, columnCount)) {
      for (const r of tried) if (r.fieldId) Object.assign(r, { status: "suggested", byCheck: true });
      return;
    }
  }
  for (const r of tried) r.fieldId = null;
}

/**
 * A result line's amount in one column: the first "signed" line, else
 * profit lines less loss lines; null when the paste has no such line.
 */
function resultAmount(rows, id, column) {
  const lines = rows.filter((r) => r.status === "result" && r.result.id === id && r.amounts[column] !== null);
  if (lines.length === 0) return null;
  const signed = lines.find((r) => r.result.kind === "signed");
  if (signed) return signed.amounts[column];
  return lines.reduce((sum, r) => sum + (r.result.kind === "loss" ? -Math.abs(r.amounts[column]) : r.amounts[column]), 0);
}

/** Amounts closer than this are the same (rounding in statements kept in whole euros or thousands). */
const tolerance = (values) => Math.max(1, 0.005 * Math.abs(values.revenue ?? 0));

/**
 * @typedef {object} PasteIssue
 * @property {"error"|"warning"|"ok"} level error: nothing can be rated
 * @property {string} key what was found (cannotRate, yearsLeftOut, resultMatches,
 *   resultDiffers, balanceMatches, balanceDiffers, biggerThanAssets, placedByCheck, suggested, notAdded, noProblems)
 * @property {object} params raw numbers and ids for the message
 */

/**
 * Checks what a paste would put into the form, before it is filled in:
 * which years can be rated, whether result lines in the paste (net profit,
 * EBIT, total equity and liabilities…) agree with what the engine calculates
 * from the assigned lines, and amounts that cannot be right.
 *
 * Years are used newest first up to the first year the form would refuse
 * (a required field missing or out of range); older years are left out and
 * said so, so one incomplete old column does not block the rating.
 * @param {PasteRow[]} rows as read, with the user's corrections
 * @param {number} columnCount
 * @param {{newestFirst: boolean, latestYear: number}} order
 * @returns {{years: {year: number, values: Record<string, number|null>}[], issues: PasteIssue[]}}
 *   years: ready for rateYears (empty when the latest year cannot be rated)
 */
export function checkPaste(rows, columnCount, order) {
  const all = pasteToYears(rows, columnCount, order);
  const issues = [];
  if (all.length === 0) return { years: [], issues };

  const errors = validateYears(all);
  const firstBad = all.findIndex((_, i) => errors[i]);
  const years = firstBad === -1 ? all : all.slice(0, firstBad);
  if (firstBad === 0) {
    issues.push({ level: "error", key: "cannotRate", params: { year: all[0].year, problems: Object.values(errors[0]) } });
    return { years, issues };
  }
  if (firstBad > 0) {
    const left = all.slice(firstBad).map((y) => y.year);
    issues.push({ level: "warning", key: "yearsLeftOut", params: { years: left, year: all[firstBad].year, problems: Object.values(errors[firstBad]) } });
  }

  // Result lines against the engine's derived statement, year by year.
  const columnOf = (i) => (order.newestFirst ? i : columnCount - 1 - i);
  for (const id of Object.keys(RESULT_LABELS)) {
    const compared = [];
    years.forEach((y, i) => {
      const pasted = resultAmount(rows, id, columnOf(i));
      if (pasted === null) return;
      const calculated = id === "liabilitiesAndEquity" ? y.values.assets : deriveStatement(y.values)[id];
      if (calculated === null) return;
      compared.push({ year: y.year, pasted, calculated, same: Math.abs(pasted - calculated) <= tolerance(y.values) });
    });
    if (compared.length === 0) continue;
    const differ = compared.filter((c) => !c.same);
    const balance = id === "liabilitiesAndEquity";
    if (differ.length === 0) {
      issues.push({ level: "ok", key: balance ? "balanceMatches" : "resultMatches", params: { id, count: compared.length } });
    } else {
      const { year, pasted, calculated } = differ[0];
      issues.push({ level: "warning", key: balance ? "balanceDiffers" : "resultDiffers",
        params: { id, year, pasted, calculated, difference: pasted - calculated, others: differ.length - 1 } });
    }
  }

  // Balance-sheet amounts that cannot exceed total assets.
  for (const fieldId of ["equity", "currentLiabilities", "debt", "cash"]) {
    const y = years.find((x) => (x.values[fieldId] ?? 0) > x.values.assets);
    if (y) issues.push({ level: "warning", key: "biggerThanAssets", params: { fieldId, year: y.year } });
  }

  const byCheck = rows.filter((r) => r.status === "suggested" && r.fieldId && r.byCheck).length;
  if (byCheck > 0) issues.unshift({ level: "ok", key: "placedByCheck", params: { count: byCheck } });
  const suggested = rows.filter((r) => r.status === "suggested" && r.fieldId && !r.byCheck).length;
  if (suggested > 0) issues.push({ level: "warning", key: "suggested", params: { count: suggested } });
  // Look-alike lines left out, with no result line confirming that was right.
  const notAdded = rows.filter((r) => r.status === "also" && r.guessed);
  if (notAdded.length > 0 && !issues.some((x) => x.key === "resultMatches")) {
    issues.push({ level: "warning", key: "notAdded", params: { count: notAdded.length, fieldId: notAdded[0].suggestion } });
  }
  if (!issues.some((x) => x.level !== "ok")) issues.push({ level: "ok", key: "noProblems", params: {} });
  return { years, issues };
}
