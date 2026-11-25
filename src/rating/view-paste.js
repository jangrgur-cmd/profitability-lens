// view-paste.js: "Paste from Excel" on the Company rating page.
//
// UI only: a dialog where the user pastes statement lines, checks which
// field each line goes into (readStatementPaste guesses, the user can
// change it), sees the totals per year (pasteToYears) and fills the form.
// Nothing leaves the browser.

import { readStatementPaste, pasteToYears } from "./paste.js";
import { FIELD_BY_ID } from "./fields.js";
import { YEAR_FIELD_IDS } from "./years.js";
import { formatAmountInput, formatEurFull } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { h, replaceChildren } from "../shared/dom.js";
import { pill } from "../shared/status.js";

/**
 * Creates the dialog (once) and returns a function that opens it.
 * @param {{latestYear: () => number, onApply: (years: {year: number, values: object}[]) => void}} options
 *   latestYear: the form's latest year, used when the headers name none
 * @returns {{open: () => void}}
 */
export function createPasteDialog({ latestYear, onApply }) {
  /** @type {ReturnType<typeof readStatementPaste>|null} */
  let read = null;
  let rows = [];

  const textarea = h("textarea", {
    id: "paste-text", rows: 8, spellcheck: "false", "aria-describedby": "paste-help",
    placeholder: t("rating.paste.placeholder"),
  });
  const preview = h("div", { class: "paste__preview", "aria-live": "polite" });
  const apply = h("button", { type: "button", class: "button button--primary", disabled: true }, t("rating.paste.apply"));
  const orderSelect = h("select", { id: "paste-order" },
    h("option", { value: "oldest" }, t("rating.paste.orderLast")),
    h("option", { value: "newest" }, t("rating.paste.orderFirst")));
  const yearInput = h("input", { id: "paste-year", type: "number", min: 1990, max: 2100, step: 1, inputmode: "numeric" });

  const dialog = h("dialog", { class: "paste-dialog card", "aria-labelledby": "paste-title" },
    h("form", { method: "dialog", class: "paste" },
      h("div", { class: "paste__head" },
        h("h2", { id: "paste-title", class: "form-title" }, t("rating.paste.title")),
        h("button", { type: "submit", class: "icon-button", value: "cancel", "aria-label": t("rating.paste.close") }, "✕")),
      h("p", { id: "paste-help", class: "paste__intro" }, t("rating.paste.intro")),
      h("div", { class: "field field--text" },
        h("label", { for: "paste-text" }, t("rating.paste.label")),
        textarea),
      h("div", { class: "paste__read" },
        h("button", { type: "button", class: "button", on: { click: readText } }, t("rating.paste.read")),
        h("p", { class: "paste__privacy" }, t("rating.paste.privacy"))),
      preview,
      h("div", { class: "paste__foot" },
        h("button", { type: "submit", class: "button-quiet", value: "cancel" }, t("rating.paste.cancel")),
        apply)));
  document.body.append(dialog);

  const order = () => ({
    newestFirst: read.newestFirst ?? orderSelect.value === "newest",
    latestYear: Number.isInteger(Number(yearInput.value)) && yearInput.value !== "" ? Number(yearInput.value) : latestYear(),
  });
  const years = () => pasteToYears(rows, read.columns.length, order());

  function readText() {
    read = readStatementPaste(textarea.value);
    rows = read.rows.map((r) => ({ ...r }));
    yearInput.value = String(read.latestYear ?? latestYear());
    renderPreview();
  }

  function renderPreview() {
    if (!read || read.columns.length === 0 || rows.length === 0) {
      apply.disabled = true;
      replaceChildren(preview, h("p", { class: "paste__empty" }, t("rating.paste.nothing")));
      return;
    }
    const matched = rows.filter((r) => r.fieldId).length;
    apply.disabled = matched === 0;
    const columnLabel = (c, i) => c.header || t("rating.paste.column", { n: i + 1 });

    const controls = [];
    if (read.columns.length > 1 && read.newestFirst === null) {
      controls.push(h("div", { class: "field field--text" },
        h("label", { for: "paste-order" }, t("rating.paste.orderLabel")), orderSelect));
    }
    controls.push(h("div", { class: "field field--text" },
      h("label", { for: "paste-year" }, t("rating.paste.latestYear")), yearInput));

    const fieldSelect = (row, i) => h("select", {
      "aria-label": t("rating.paste.fieldFor", { label: row.label }),
      on: { change: (e) => { rows[i].fieldId = e.target.value || null; rows[i].status = rows[i].fieldId ? "matched" : rows[i].status === "matched" ? "unknown" : rows[i].status; renderPreview(); } },
    },
    h("option", { value: "" }, t("rating.paste.notUsed")),
    YEAR_FIELD_IDS.map((id) => h("option", { value: id, selected: row.fieldId === id }, FIELD_BY_ID[id].label)));

    const status = (row) => {
      if (row.fieldId) return pill("good", "✓", t("rating.paste.statusMatched"));
      if (row.status === "also") return pill("fair", "!", t("rating.paste.statusAlso", { field: FIELD_BY_ID[row.suggestion].label }));
      return pill("none", "–", t("rating.paste.statusUnknown"));
    };

    const result = years();
    replaceChildren(preview,
      h("p", { class: "paste__summary" }, t("rating.paste.summary", { count: rows.length, matched, columns: read.columns.length })),
      read.extraColumns > 0 ? h("p", { class: "paste__warn" }, t("rating.paste.extraColumns", { count: read.extraColumns })) : null,
      h("div", { class: "paste__controls" }, controls),
      h("div", { class: "table-scroll" },
        h("table", { class: "paste__table" },
          h("caption", {}, t("rating.paste.linesCaption")),
          h("thead", {}, h("tr", {},
            h("th", { scope: "col" }, t("rating.paste.colLine")),
            read.columns.map((c, i) => h("th", { scope: "col" }, columnLabel(c, i))),
            h("th", { scope: "col" }, t("rating.paste.colField")))),
          h("tbody", {}, rows.map((row, i) => h("tr", { class: row.fieldId ? "" : "paste__row--off" },
            h("th", { scope: "row" }, row.label || t("common.dash")),
            row.amounts.map((a) => h("td", {}, a === null ? "" : formatAmountInput(a))),
            h("td", { class: "paste__field" }, fieldSelect(row, i), status(row))))))),
      h("div", { class: "table-scroll" },
        h("table", { class: "paste__table paste__table--result" },
          h("caption", {}, t("rating.paste.resultCaption")),
          h("thead", {}, h("tr", {}, h("th", { scope: "col" }, t("rating.paste.colField")), result.map((y) => h("th", { scope: "col" }, String(y.year))))),
          h("tbody", {}, YEAR_FIELD_IDS.filter((id) => result.some((y) => y.values[id] !== null)).map((id) => h("tr", {},
            h("th", { scope: "row" }, FIELD_BY_ID[id].label),
            result.map((y) => h("td", {}, y.values[id] === null ? t("common.dash") : formatEurFull(y.values[id])))))))),
      h("p", { class: "paste__note" }, t("rating.paste.costsNote")));
  }

  orderSelect.addEventListener("change", renderPreview);
  yearInput.addEventListener("input", renderPreview);
  apply.addEventListener("click", () => {
    const result = years();
    dialog.close("apply");
    onApply(result);
  });

  return {
    open() {
      read = null;
      rows = [];
      textarea.value = "";
      replaceChildren(preview);
      apply.disabled = true;
      dialog.showModal();
      textarea.focus();
    },
  };
}
