// xlsx.js: reads the cell text of an Excel workbook and writes simple ones,
// so a statement or a segment table can be opened from a file and a
// template downloaded, without any library. Only what the paste import
// needs: each sheet as rows of cell text. Formulas are read as the value
// Excel saved with them; formatting is ignored.
//
// Pure (no DOM): runs in browsers and in Node (tests).

import { readZip, writeZip } from "./zip.js";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decodes XML text: entities, numeric references and Excel's _x000D_ escapes. */
function xmlText(text) {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e] ?? m;
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

const escapeXml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The text of a string item: all <t> runs, without phonetic hints. */
function runsText(xml) {
  return [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join("");
}

const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;

/** "C12" → 2 (zero-based column). */
function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

/**
 * A stored number as text the paste parser reads without doubt: no
 * thousands separators, "." for decimals, and never exactly three decimals
 * (which would read as thousands): 1234.567 → "1234.5670".
 */
export function numberText(value) {
  const n = Math.round(Number(value) * 1e6) / 1e6;
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  const text = String(n);
  return (text.split(".")[1] ?? "").length === 3 ? `${text}0` : text;
}

function readSheet(xml, shared) {
  const rows = [];
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(row[1], "r")) || rows.length + 1;
    const cells = [];
    for (const c of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      const col = ref ? columnIndex(ref) : cells.length;
      const type = attr(c[1], "t") ?? "n";
      const body = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let text = "";
      if (type === "s") text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = runsText(body);
      else if (type === "str") text = xmlText(v ?? "");
      else if (type === "b") text = v === "1" ? "TRUE" : "FALSE";
      else if (type === "n" && v !== undefined) text = numberText(v);
      cells[col] = text.replace(/[\t\r\n]+/g, " ").trim();
    }
    rows[r - 1] = Array.from(cells, (x) => x ?? "");
  }
  return Array.from(rows, (x) => x ?? []);
}

/**
 * Reads every sheet of a workbook as rows of cell text.
 * @param {Uint8Array} bytes the .xlsx file
 * @returns {Promise<{name: string, rows: string[][]}[]>} in workbook order
 * @throws {Error} when the file is not an .xlsx workbook
 */
export async function readWorkbook(bytes) {
  const zip = await readZip(bytes);
  const decoder = new TextDecoder();
  const file = (name) => (zip.has(name) ? decoder.decode(zip.get(name)) : null);
  const workbook = file("xl/workbook.xml");
  if (!workbook) throw new Error("Not an Excel workbook (.xlsx)");
  const rels = file("xl/_rels/workbook.xml.rels") ?? "";
  const targets = Object.fromEntries([...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [attr(m[1], "Id"), attr(m[1], "Target")]));
  const sharedXml = file("xl/sharedStrings.xml") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runsText(m[1]));

  return [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => {
    const target = targets[attr(m[1], "r:id")] ?? "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const xml = file(path);
    return { name: xmlText(attr(m[1], "name") ?? ""), rows: xml ? readSheet(xml, shared) : [] };
  });
}

/**
 * The sheet to import: the first with at least one amount in it (a number
 * that is not a year, so a blank template's year headers do not count),
 * else the first.
 * @param {{name: string, rows: string[][]}[]} sheets
 */
export function pickSheet(sheets) {
  const isAmount = (c) => /^-?\d+(\.\d+)?$/.test(c) && !/^(19|20)\d\d$/.test(c);
  const hasNumber = (s) => s.rows.some((row) => row.slice(1).some(isAmount));
  return sheets.find(hasNumber) ?? sheets[0] ?? { name: "", rows: [] };
}

/** Rows of cells as tab-separated text, as Excel puts it on the clipboard. */
export function gridToText(rows) {
  return rows.map((row) => row.join("\t")).join("\n");
}

const CONTENT_TYPES = (count) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({ length: count }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;

// Cell styles: 0 normal, 1 bold, 2 whole numbers with thousands separators, 3 wrapped text.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const colName = (i) => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

function sheetXml({ rows, widths = [], boldRows = 1, wrap = false }) {
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const body = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => {
    const ref = `${colName(c)}${r + 1}`;
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "number") return `<c r="${ref}" s="2"><v>${value}</v></c>`;
    const style = r < boldRows ? 1 : wrap ? 3 : 0;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews>${cols}<sheetData>${body}</sheetData></worksheet>`;
}

/**
 * Writes a workbook.
 * @param {{name: string, rows: (string|number|null)[][], widths?: number[], boldRows?: number, wrap?: boolean}[]} sheets
 *   name: at most 31 characters, none of []:*?/\ ; boldRows: how many top rows are bold (default 1);
 *   wrap: wrap long text (for a sheet of notes)
 * @returns {Uint8Array} the .xlsx file
 */
export function writeWorkbook(sheets) {
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${escapeXml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return writeZip([
    ["[Content_Types].xml", CONTENT_TYPES(sheets.length)],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", workbook],
    ["xl/_rels/workbook.xml.rels", rels],
    ["xl/styles.xml", STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ]);
}
