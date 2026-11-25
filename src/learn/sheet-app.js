// sheet-app.js: the formula cheat sheet page (cheatsheet.html). UI only: the
// content comes from cheatSheet() in cheatsheet.js, which reads it from the
// rating engine. "Print or save as PDF" uses the browser's print dialog (the
// print stylesheet fits the sheet on one A4 page); "Download as text" saves
// cheatSheetText() as a .txt file made in the browser.

import { cheatSheet, cheatSheetText } from "./cheatsheet.js";
import { t } from "../shared/i18n.js";
import { h, replaceChildren } from "../shared/dom.js";
import { downloadFile } from "../shared/export.js";
import { mountSiteHeader } from "../shared/site-header.js";

const $ = (id) => document.getElementById(id);

function sectionNode(s) {
  return h("section", { class: "sheet__section", "aria-labelledby": `sheet-${s.id}` },
    h("h3", { id: `sheet-${s.id}` }, s.title),
    s.lines ? h("ul", { class: "sheet__lines" }, s.lines.map((line) => h("li", {}, line))) : null,
    s.ratios ? h("table", { class: "sheet__table" },
      h("tbody", {}, s.ratios.map((r) => h("tr", {},
        h("th", { scope: "row" }, r.label),
        h("td", { class: "sheet__ratio-formula" }, r.formula),
        h("td", {}, String(r.weight)))))) : null,
    s.table ? h("table", { class: "sheet__table" },
      h("thead", {}, h("tr", {}, s.table.columns.map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", {}, s.table.rows.map((row) => h("tr", {},
        h("th", { scope: "row" }, row.label), row.cells.map((c) => h("td", {}, c)))))) : null,
    s.note ? h("p", { class: "sheet__note" }, s.note) : null);
}

function render() {
  const sheet = cheatSheet();
  replaceChildren($("sheet"),
    h("h2", { class: "sheet__title", id: "sheet-title" }, sheet.title),
    h("p", { class: "sheet__subtitle" }, sheet.subtitle),
    h("div", { class: "sheet__grid" }, sheet.sections.map(sectionNode)),
    h("p", { class: "sheet__footer" }, sheet.footer));
}

mountSiteHeader($("site-header"), { active: "learn", root: "./" });
render();
$("sheet-print").addEventListener("click", () => window.print());
$("sheet-download").addEventListener("click", () => {
  downloadFile(t("learn.sheet.fileName"), ["﻿", cheatSheetText()], "text/plain;charset=utf-8");
  $("announcer").textContent = t("learn.sheet.announceDownloaded");
});
