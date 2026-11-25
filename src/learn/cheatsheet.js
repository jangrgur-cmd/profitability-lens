// cheatsheet.js: the one-page formula cheat sheet, as data.
//
// Everything on the sheet comes from the code that does the calculating:
// ratio names, formulas and weights from RATIOS, score points from
// SCORE_ANCHORS, the grade scale from GRADES, flag limits from FLAG_LIMITS and
// the example thresholds from the "General" industry. Only the wording of the
// statement lines lives in the language files (learn.formulas, shared with the
// glossary). The page (sheet-app.js) lays the sections out for screen and
// print; cheatSheetText() gives the same content as a plain-text download.
// Pure module: no DOM.

import { RATIOS } from "../rating/ratios.js";
import { FLAG_LIMITS, gradeScaleText } from "../rating/rating.js";
import { INDUSTRY_BY_ID, BENCHMARK_SOURCE } from "../rating/benchmarks.js";
import { SCORE_ANCHORS } from "../shared/margin.js";
import { formatMultiple, formatPct, formatPercentValue } from "../shared/format.js";
import { t, getLang } from "../shared/i18n.js";

/** The industry whose thresholds the sheet prints as an example. */
export const SHEET_INDUSTRY_ID = "general";

/** Statement lines, top to bottom (keys of learn.formulas). */
const STATEMENT_LINES = ["grossProfit", "ebitda", "ebit", "ebt", "netIncome", "taxRate", "nopat", "average", "capitalEmployed", "investedCapital"];
/** Segment lines (keys of learn.formulas). */
const SEGMENT_LINES = ["contributionMargin", "cmRatio", "segmentProfit", "topShare"];

/** "gross margin" → "Gross margin" (short ratio names are written for use inside a sentence). */
const capitalise = (text) => text.charAt(0).toLocaleUpperCase(getLang()) + text.slice(1);

/**
 * @typedef {object} SheetSection
 * @property {string} id
 * @property {string} title
 * @property {string[]} [lines] formula lines
 * @property {{label: string, formula: string, weight: number}[]} [ratios]
 * @property {{columns: string[], rows: {label: string, cells: string[]}[]}} [table]
 * @property {string} [note]
 */

/**
 * The cheat sheet in the interface language.
 * @returns {{title: string, subtitle: string, sections: SheetSection[], footer: string}}
 */
export function cheatSheet() {
  const f = (id) => t(`learn.formulas.${id}`);
  const [floor, poor, fair, good, excellent] = SCORE_ANCHORS;
  const industry = INDUSTRY_BY_ID[SHEET_INDUSTRY_ID];
  const bandColumns = ["colWeak", "colFair", "colGood", "colExcellent"].map((k) => t(`rating.page.${k}`));

  return {
    title: t("learn.sheet.title"),
    subtitle: t("learn.sheet.subtitle"),
    sections: [
      { id: "statement", title: t("learn.sheet.statementTitle"), lines: STATEMENT_LINES.map(f) },
      {
        id: "ratios",
        title: t("learn.sheet.ratiosTitle"),
        ratios: RATIOS.map((r) => ({ label: r.label, formula: r.formula, weight: r.weight })),
        note: t("learn.sheet.ratiosNote"),
      },
      { id: "dupont", title: t("rating.dupont.title"), lines: [f("dupont"), f("assetTurnover"), f("equityMultiplier")] },
      {
        id: "scoring",
        title: t("learn.sheet.scoringTitle"),
        lines: [
          t("learn.sheet.scorePoints", { floor, poor, fair, good, excellent }),
          t("learn.sheet.scoreOverall"),
          t("learn.sheet.scoreGrades", { grades: gradeScaleText() }),
        ],
      },
      {
        id: "flags",
        title: t("learn.sheet.flagsTitle"),
        lines: [
          t("learn.sheet.flagLoss"),
          t("learn.sheet.flagOperating"),
          t("learn.sheet.flagCover", { min: formatMultiple(FLAG_LIMITS.minInterestCover, 1) }),
          t("learn.sheet.flagLeverage", { max: formatMultiple(FLAG_LIMITS.maxEquityMultiplier, 1) }),
          t("learn.sheet.flagDa", { share: formatPct(FLAG_LIMITS.maxDaShareOfEbitda, 0) }),
          t("learn.sheet.flagCoverage", { share: formatPct(FLAG_LIMITS.lowCoverageShare, 0) }),
        ],
      },
      {
        id: "thresholds",
        title: t("learn.sheet.thresholdsTitle", { industry: industry.label }),
        table: {
          columns: [t("rating.page.colRatio"), ...bandColumns],
          rows: RATIOS.map((r) => ({ label: capitalise(r.shortLabel), cells: industry.thresholds[r.id].map((x) => formatPercentValue(x)) })),
        },
        note: t("learn.sheet.thresholdsNote", { source: BENCHMARK_SOURCE.label }),
      },
      { id: "segments", title: t("learn.sheet.segmentsTitle"), lines: SEGMENT_LINES.map(f) },
    ],
    footer: t("learn.sheet.footer"),
  };
}

/**
 * The cheat sheet as plain text, for "Download as text".
 * @returns {string}
 */
export function cheatSheetText() {
  const sheet = cheatSheet();
  const out = [sheet.title, sheet.subtitle, ""];
  for (const s of sheet.sections) {
    out.push(s.title.toUpperCase());
    for (const line of s.lines ?? []) out.push(`  ${line}`);
    for (const r of s.ratios ?? []) out.push(`  ${r.label}: ${r.formula}  ${t("learn.sheet.weight", { weight: r.weight })}`);
    if (s.table) {
      out.push(`  ${s.table.columns.join(" | ")}`);
      for (const row of s.table.rows) out.push(`  ${[row.label, ...row.cells].join(" | ")}`);
    }
    if (s.note) out.push(`  ${s.note}`);
    out.push("");
  }
  out.push(sheet.footer);
  return `${out.join("\n")}\n`;
}
