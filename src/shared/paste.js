// paste.js: reads a table pasted from Excel, LibreOffice or a CSV file.
//
// Used by both modules: the Company rating maps statement lines to its
// fields (src/rating/paste.js), the segment module reads a segment table
// (src/segments/segments.js). Pure functions, no DOM.
//
// Cells are split on tabs (what a spreadsheet puts on the clipboard), else
// on semicolons (Croatian CSV), else on commas; double quotes protect a
// delimiter inside a cell. Amounts are read with parseAmount, so 1.234,56 and
// 1,234.56 both work.

import { parseAmount } from "./parse.js";

/** Picks the cell delimiter used by most lines: tab, then semicolon, then comma. */
export function detectDelimiter(lines) {
  for (const d of ["\t", ";", ","]) if (lines.some((line) => line.includes(d))) return d;
  return null;
}

/** Splits one line into cells, honouring double quotes ("a;b" stays one cell, "" is a quote). */
function splitLine(line, delimiter) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") quoted = true;
    else if (ch === delimiter) { cells.push(cell); cell = ""; } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

/**
 * A line without any delimiter, such as "Revenue 1.234.567": the text before
 * the trailing amount is the label.
 */
function splitLoose(line) {
  const m = line.match(/^(.*?[^\d\s.,()\-−'’])\s+([(−-]?\s*[\d][\d\s.,'’]*\)?)$/);
  return m ? [m[1].trim(), m[2].trim()] : [line.trim()];
}

/**
 * Splits pasted text into rows of trimmed cells. Blank lines are dropped;
 * rows keep their own length (no padding).
 * @param {string} text
 * @returns {string[][]}
 */
export function parseGrid(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim() !== "");
  const delimiter = detectDelimiter(lines);
  return lines.map((line) => (delimiter ? splitLine(line, delimiter) : splitLoose(line)));
}

/** A cell's amount, or null when it is blank or not a number. */
export function cellNumber(cell) {
  const { value, error } = parseAmount(cell);
  return error ? null : value;
}

/** True when the cell holds a number. */
export function isNumberCell(cell) {
  return cellNumber(cell) !== null;
}

/**
 * A label in a form that can be compared: lower case, no diacritics (č → c,
 * đ → d), "&" read as "and", leading numbering removed ("2.", "IV.", "a)",
 * "AOP 125"), other punctuation as spaces.
 *   "IV. NOVAC U BANCI I BLAGAJNI" → "novac u banci i blagajni"
 *   "Shareholders' equity"        → "shareholders equity"
 * @param {string} text
 */
export function normalizeLabel(text) {
  let s = String(text ?? "").toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/&/g, " and ").replace(/['’`]/g, "");
  for (let i = 0; i < 3; i += 1) s = s.replace(/^\s*(aop\s*\d+|\d+(\.\d+)*[.)]?|[ivxlc]+[.)]|[a-z][.)])\s+/, "");
  return s.replace(/[^a-z0-9]+/g, " ").trim();
}
