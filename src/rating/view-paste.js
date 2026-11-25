// view-paste.js: "Paste from Excel" on the Company rating page.
//
// UI only: a dialog where the user pastes statement lines or opens a file.
// The lines are read at once: each line's field is matched or suggested
// (readStatementPaste), the result is checked and rated (checkPaste,
// rateYears), and the grade shows before anything goes into the form. The
// user can change any line's field and the grade follows. The lines can come
// from an .xlsx or CSV file (src/shared/file-import.js), and the dialog offers
// the Excel template. Nothing leaves the browser.

import { readStatementPaste, checkPaste } from "./paste.js";
import { FIELD_BY_ID } from "./fields.js";
import { YEAR_FIELD_IDS, rateYears } from "./years.js";
import { INDUSTRIES, INDUSTRY_BY_ID } from "./benchmarks.js";
import { formatAmountInput, formatEurFull } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { h, replaceChildren } from "../shared/dom.js";
import { captureMotion, playMotion, motionKey } from "../shared/motion.js";
import { pill, GRADE_TONES } from "../shared/status.js";
import { downloadWorkbook, fileControls, readTableFile } from "../shared/file-import.js";
import { ratingTemplate } from "./template.js";

/** How long typing in the box pauses before the lines are read again (ms). */
const READ_DELAY = 300;

const CHECK_PILLS = {
  error: () => pill("poor", "✕", t("rating.paste.checkError")),
  warning: () => pill("fair", "!", t("rating.paste.checkWarning")),
  ok: () => pill("good", "✓", t("rating.paste.checkOk")),
};

/** One finding of checkPaste as a sentence in the current language. */
function checkText({ key, params: p }) {
  const line = p.id ? t(`rating.paste.resultLine.${p.id}`) : "";
  switch (key) {
    case "cannotRate": return t("rating.paste.check.cannotRate", { year: p.year, problems: p.problems.join(" ") });
    case "yearsLeftOut": return t("rating.paste.check.yearsLeftOut", { count: p.years.length, years: p.years.join(", "), year: p.year, problem: p.problems[0] });
    case "resultMatches": return t("rating.paste.check.resultMatches", { line, count: p.count });
    case "resultDiffers": return [
      t("rating.paste.check.resultDiffers", {
        line, year: p.year, pasted: formatEurFull(p.pasted), calculated: formatEurFull(p.calculated), difference: formatEurFull(p.difference),
      }),
      p.others > 0 ? t("rating.paste.check.otherYears", { count: p.others }) : "",
    ].filter(Boolean).join(" ");
    case "balanceMatches": return t("rating.paste.check.balanceMatches", { count: p.count });
    case "balanceDiffers": return t("rating.paste.check.balanceDiffers", { year: p.year, pasted: formatEurFull(p.pasted), assets: formatEurFull(p.calculated) });
    case "biggerThanAssets": return t("rating.paste.check.biggerThanAssets", { year: p.year, field: FIELD_BY_ID[p.fieldId].label });
    case "placedByCheck": return t("rating.paste.check.placedByCheck", { count: p.count });
    case "suggested": return t("rating.paste.check.suggested", { count: p.count });
    case "notAdded": return t("rating.paste.check.notAdded", { count: p.count, field: FIELD_BY_ID[p.fieldId].label });
    default: return t("rating.paste.check.noProblems");
  }
}

/**
 * Creates the dialog (once) and returns a function that opens it.
 * @param {{latestYear: () => number, industryId: () => string,
 *          onApply: (years: {year: number, values: object}[], industryId: string) => void}} options
 *   latestYear: the form's latest year, used when the headers name none;
 *   industryId: the form's industry, the dialog's starting choice
 * @returns {{open: (file?: File) => void}} open, optionally reading a file at once
 */
export function createPasteDialog({ latestYear, industryId, onApply }) {
  /** @type {ReturnType<typeof readStatementPaste>|null} */
  let read = null;
  let rows = [];
  /** @type {ReturnType<typeof checkPaste>|null} */
  let checked = null;
  let readTimer = 0;

  const textarea = h("textarea", {
    id: "paste-text", rows: 8, spellcheck: "false", "aria-describedby": "paste-help",
    placeholder: t("rating.paste.placeholder"),
  });
  const preview = h("div", { class: "paste__preview", "aria-live": "polite" });
  const fileNote = h("p", { class: "paste__file", "aria-live": "polite", hidden: true });
  const apply = h("button", { type: "button", class: "button button--primary", disabled: true }, t("rating.paste.apply"));
  const orderSelect = h("select", { id: "paste-order" },
    h("option", { value: "oldest" }, t("rating.paste.orderLast")),
    h("option", { value: "newest" }, t("rating.paste.orderFirst")));
  const yearInput = h("input", { id: "paste-year", type: "number", min: 1990, max: 2100, step: 1, inputmode: "numeric" });
  const industrySelect = h("select", { id: "paste-industry" }, INDUSTRIES.map((i) => h("option", { value: i.id }, i.label)));

  const dialog = h("dialog", { class: "paste-dialog card", "aria-labelledby": "paste-title" },
    h("form", { method: "dialog", class: "paste" },
      h("div", { class: "paste__head" },
        h("h2", { id: "paste-title", class: "form-title" }, t("rating.paste.title")),
        h("button", { type: "submit", class: "icon-button", value: "cancel", "aria-label": t("rating.paste.close") }, "✕")),
      h("p", { id: "paste-help", class: "paste__intro" }, t("rating.paste.intro")),
      h("div", { class: "field field--text" },
        h("label", { for: "paste-text" }, t("rating.paste.label")),
        textarea),
      fileControls({
        id: "paste",
        onFile: (file) => loadFile(file),
        onTemplate: () => downloadWorkbook(t("rating.template.filename"), ratingTemplate({ latestYear: latestYear() })),
      }),
      fileNote,
      h("p", { class: "paste__privacy" }, t("rating.paste.privacy")),
      preview,
      h("div", { class: "paste__foot" },
        h("button", { type: "submit", class: "button-quiet", value: "cancel" }, t("rating.paste.cancel")),
        apply)));
  document.body.append(dialog);

  const order = () => ({
    newestFirst: read.newestFirst ?? orderSelect.value === "newest",
    latestYear: Number.isInteger(Number(yearInput.value)) && yearInput.value !== "" ? Number(yearInput.value) : latestYear(),
  });

  function readText() {
    clearTimeout(readTimer);
    if (textarea.value.trim() === "") {
      read = null;
      rows = [];
      checked = null;
      apply.disabled = true;
      replaceChildren(preview);
      return;
    }
    read = readStatementPaste(textarea.value);
    rows = read.rows.map((r) => ({ ...r }));
    yearInput.value = String(read.latestYear ?? latestYear());
    renderPreview();
  }

  async function loadFile(file) {
    fileNote.hidden = false;
    fileNote.classList.remove("paste__file--error");
    try {
      const { text, note } = await readTableFile(file);
      textarea.value = text;
      fileNote.textContent = note;
      readText();
    } catch (error) {
      fileNote.textContent = error.message;
      fileNote.classList.add("paste__file--error");
    }
  }

  /** The grade the pasted figures would get, with what it rests on. */
  function gradeBlock() {
    if (checked.years.length === 0) return null;
    const trend = rateYears(checked.years, industrySelect.value);
    const { year, rating } = trend.years[0];
    return motionKey(h("div", { class: `paste__grade tone-${GRADE_TONES[rating.grade.letter]}` },
      motionKey(h("span", { class: "paste__letter", "aria-hidden": "true" }, rating.grade.letter), "paste-letter", { pop: true }),
      h("div", {},
        motionKey(h("p", { class: "paste__grade-title" }, t("rating.paste.gradeTitle", {
          year, letter: rating.grade.letter, score: rating.score, label: rating.grade.label,
        })), "paste-grade-title"),
        h("p", { class: "paste__grade-meta" }, t("rating.paste.gradeMeta", {
          coverage: rating.coverage.label, industry: INDUSTRY_BY_ID[industrySelect.value].label, count: trend.years.length,
        })))), "paste-grade", { enter: true });
  }

  function renderPreview() {
    if (!read || read.columns.length === 0 || rows.length === 0) {
      apply.disabled = true;
      checked = null;
      replaceChildren(preview, h("p", { class: "paste__empty" }, t("rating.paste.nothing")));
      return;
    }
    checked = checkPaste(rows, read.columns.length, order());
    apply.disabled = checked.years.length === 0;
    const matched = rows.filter((r) => r.fieldId).length;
    const columnLabel = (c, i) => c.header || t("rating.paste.column", { n: i + 1 });

    const controls = [];
    if (read.columns.length > 1 && read.newestFirst === null) {
      controls.push(h("div", { class: "field field--text" },
        h("label", { for: "paste-order" }, t("rating.paste.orderLabel")), orderSelect));
    }
    controls.push(h("div", { class: "field field--text" },
      h("label", { for: "paste-year" }, t("rating.paste.latestYear")), yearInput));
    controls.push(h("div", { class: "field field--text" },
      h("label", { for: "paste-industry" }, t("rating.page.industry")), industrySelect));

    const onFieldChange = (i) => (e) => {
      const row = rows[i];
      row.fieldId = e.target.value || null;
      row.status = row.fieldId ? "matched" : row.result ? "result" : "unknown";
      renderPreview();
    };
    const fieldSelect = (row, i) => h("select", {
      "aria-label": t("rating.paste.fieldFor", { label: row.label }),
      on: { change: onFieldChange(i) },
    },
    h("option", { value: "" }, t("rating.paste.notUsed")),
    YEAR_FIELD_IDS.map((id) => h("option", { value: id, selected: row.fieldId === id }, FIELD_BY_ID[id].label)));

    const status = (row) => {
      if (row.status === "suggested") return pill("fair", "?", t("rating.paste.statusSuggested"));
      if (row.fieldId) return pill("good", "✓", t("rating.paste.statusMatched"));
      if (row.status === "also") return pill("fair", "!", t("rating.paste.statusAlso", { field: FIELD_BY_ID[row.suggestion].label }));
      if (row.status === "result") return pill("none", "=", t("rating.paste.statusResult"));
      return pill("none", "–", t("rating.paste.statusUnknown"));
    };

    const result = checked.years;
    const before = captureMotion(preview);
    replaceChildren(preview,
      h("p", { class: "paste__summary" }, t("rating.paste.summary", { count: rows.length, matched, columns: read.columns.length })),
      read.extraColumns > 0 ? h("p", { class: "paste__warn" }, t("rating.paste.extraColumns", { count: read.extraColumns })) : null,
      gradeBlock(),
      h("section", { class: "paste__checks", "aria-labelledby": "paste-checks-title" },
        h("h3", { id: "paste-checks-title" }, t("rating.paste.checksTitle")),
        h("ul", {}, checked.issues.map((issue) => motionKey(h("li", { class: `paste__check paste__check--${issue.level}` },
          CHECK_PILLS[issue.level](), h("span", {}, checkText(issue))), `paste-check-${issue.key}-${issue.params.id ?? ""}`, { enter: true })))),
      h("div", { class: "paste__controls" }, controls),
      h("div", { class: "table-scroll" },
        h("table", { class: "paste__table" },
          h("caption", {}, t("rating.paste.linesCaption")),
          h("thead", {}, h("tr", {},
            h("th", { scope: "col" }, t("rating.paste.colLine")),
            read.columns.map((c, i) => h("th", { scope: "col" }, columnLabel(c, i))),
            h("th", { scope: "col" }, t("rating.paste.colField")))),
          h("tbody", {}, rows.map((row, i) => h("tr", { class: row.fieldId ? (row.status === "suggested" ? "paste__row--guess" : "") : "paste__row--off" },
            h("th", { scope: "row" }, row.label || t("common.dash")),
            row.amounts.map((a) => h("td", {}, a === null ? "" : formatAmountInput(a))),
            h("td", { class: "paste__field" }, fieldSelect(row, i), status(row))))))),
      result.length === 0 ? null : h("div", { class: "table-scroll" },
        h("table", { class: "paste__table paste__table--result" },
          h("caption", {}, t("rating.paste.resultCaption")),
          h("thead", {}, h("tr", {}, h("th", { scope: "col" }, t("rating.paste.colField")), result.map((y) => h("th", { scope: "col" }, String(y.year))))),
          h("tbody", {}, YEAR_FIELD_IDS.filter((id) => result.some((y) => y.values[id] !== null)).map((id) => h("tr", {},
            h("th", { scope: "row" }, FIELD_BY_ID[id].label),
            result.map((y) => h("td", {}, y.values[id] === null ? t("common.dash") : formatEurFull(y.values[id])))))))),
      h("p", { class: "paste__note" }, t("rating.paste.costsNote")));
    playMotion(preview, before);
  }

  textarea.addEventListener("input", () => {
    clearTimeout(readTimer);
    readTimer = setTimeout(readText, READ_DELAY);
  });
  orderSelect.addEventListener("change", renderPreview);
  yearInput.addEventListener("input", renderPreview);
  industrySelect.addEventListener("change", renderPreview);
  apply.addEventListener("click", () => {
    if (!checked || checked.years.length === 0) return;
    dialog.close("apply");
    onApply(checked.years, industrySelect.value);
  });

  return {
    open(file) {
      read = null;
      rows = [];
      checked = null;
      textarea.value = "";
      fileNote.hidden = true;
      industrySelect.value = industryId();
      replaceChildren(preview);
      apply.disabled = true;
      if (!dialog.open) dialog.showModal();
      textarea.focus();
      if (file) loadFile(file);
    },
  };
}
