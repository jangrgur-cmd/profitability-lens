// file-import.js: opening a table from a file, for both paste dialogs.
//
// UI helpers: read an .xlsx, .csv, .tsv or .txt file in the browser into
// the tab-separated text the paste import reads, offer a template as a
// download, and accept a file dropped anywhere on the page. Nothing is
// uploaded: the file is read with the File API and DecompressionStream.

import { gridToText, pickSheet, readWorkbook, writeWorkbook } from "./xlsx.js";
import { downloadFile } from "./export.js";
import { t } from "./i18n.js";
import { h } from "./dom.js";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** The file types the table import opens. */
export const TABLE_FILE_TYPES = ".xlsx,.csv,.tsv,.txt";

const extension = (file) => (/\.([^.]+)$/.exec(file.name)?.[1] ?? "").toLowerCase();

/**
 * Reads a table file as tab- or comma-separated text.
 * @param {File} file
 * @returns {Promise<{text: string, note: string}>} note: which sheet or file was read, for the dialog
 * @throws {Error} with a message for the user when the file cannot be read
 */
export async function readTableFile(file) {
  const ext = extension(file);
  if (ext === "xls") throw new Error(t("fileImport.oldXls"));
  if (ext === "xlsx") {
    let sheets;
    try {
      sheets = await readWorkbook(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new Error(t("fileImport.notWorkbook", { file: file.name }));
    }
    const sheet = pickSheet(sheets);
    return { text: gridToText(sheet.rows), note: t("fileImport.readSheet", { sheet: sheet.name, file: file.name }) };
  }
  if (!["csv", "tsv", "txt", ""].includes(ext)) throw new Error(t("fileImport.unsupported", { file: file.name }));
  return { text: (await file.text()).replace(/^﻿/, ""), note: t("fileImport.readFile", { file: file.name }) };
}

/**
 * Offers a workbook as a download.
 * @param {string} filename
 * @param {Parameters<typeof writeWorkbook>[0]} sheets
 */
export function downloadWorkbook(filename, sheets) {
  downloadFile(filename, [writeWorkbook(sheets)], XLSX_TYPE);
}

/**
 * The "Open a file… · Download template" row of a paste dialog.
 * @param {{id: string, onFile: (file: File) => void, onTemplate: () => void}} options
 *   id: a unique prefix for the hidden file input
 * @returns {HTMLElement}
 */
export function fileControls({ id, onFile, onTemplate }) {
  const input = h("input", {
    type: "file", id: `${id}-file`, accept: TABLE_FILE_TYPES, hidden: true,
    on: { change: (e) => { const file = e.target.files[0]; e.target.value = ""; if (file) onFile(file); } },
  });
  return h("div", { class: "file-import" },
    h("button", { type: "button", class: "button", on: { click: () => input.click() } }, t("fileImport.open")),
    h("button", { type: "button", class: "button-quiet", on: { click: onTemplate } }, t("fileImport.template")),
    h("p", { class: "file-import__note" }, t("fileImport.note")),
    input);
}

/**
 * Calls `onFile` with a file dropped anywhere on the page, and marks the page
 * while a file is dragged over it.
 * @param {(file: File) => void} onFile
 */
export function listenForFileDrop(onFile) {
  const root = document.documentElement;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
  let depth = 0;
  document.body.dataset.dropHint = t("fileImport.dropHint");
  document.addEventListener("dragenter", (e) => { if (hasFiles(e)) { depth += 1; root.classList.add("file-drag"); } });
  document.addEventListener("dragleave", (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; root.classList.remove("file-drag"); } });
  document.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    root.classList.remove("file-drag");
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  });
}
