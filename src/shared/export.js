// export.js: turns a table's rows into CSV and offers files as downloads,
// for both modules. CSV cells hold raw numbers (not "€1.2M"), so the file
// opens cleanly in a spreadsheet. Files are made in the browser; nothing is uploaded.

/** Quotes a CSV cell when it contains a comma, quote or line break. */
function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(Number(value.toFixed(6))) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Builds CSV text from column definitions and rows.
 * Each column has a `label` (header) and either a `csv(row)` function or a `key`.
 * @param {{label:string, key?:string, csv?:(row:object)=>unknown}[]} columns
 * @param {object[]} rows
 * @returns {string} CSV with a header line, lines separated by \r\n
 */
export function toCsv(columns, rows) {
  const header = columns.map((c) => csvCell(c.csvLabel ?? c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvCell(c.csv ? c.csv(row) : row[c.key])).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

/**
 * Starts a browser download of a text file.
 * @param {string} filename
 * @param {string|BlobPart[]} content
 * @param {string} type MIME type
 */
export function downloadFile(filename, content, type) {
  const blob = new Blob(Array.isArray(content) ? content : [content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Starts a browser download of `text` as a CSV file. */
export function downloadCsv(filename, text) {
  // A byte-order mark makes Excel read the file as UTF-8 (for "€" and accents).
  downloadFile(filename, ["﻿", text], "text/csv;charset=utf-8");
}
