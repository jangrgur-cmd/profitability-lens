// template.js (segments): the Excel template for Segment profitability.
//
// Sheet 1 is the table's header row in the interface language (names the
// import recognises), ready to fill in; sheet 2 is a filled-in fictional
// example; sheet 3 says how to use it. Pure.

import { COLUMNS, SEGMENT_KINDS } from "./segments.js";
import { SEGMENT_SAMPLES } from "./samples.js";
import { t } from "../shared/i18n.js";

/**
 * The template's sheets, for writeWorkbook.
 * @param {{kind: string}} options the segment kind chosen on the page (names the first column)
 * @returns {{name: string, rows: (string|number|null)[][], widths: number[], wrap?: boolean}[]}
 */
export function segmentTemplate({ kind }) {
  const header = (kindId) => COLUMNS.map((c) => (c === "name"
    ? (SEGMENT_KINDS.find((k) => k.id === kindId) ?? SEGMENT_KINDS[0]).label
    : t(`segments.columns.${c}`)));
  const example = SEGMENT_SAMPLES[0];
  return [
    { name: t("segments.template.sheetTable"), rows: [header(kind)], widths: [34, 14, 16, 20] },
    {
      name: t("segments.template.sheetExample"),
      rows: [header(example.kind), ...example.segments.map((s) => [s.name, s.revenue, s.variableCosts, s.fixedCosts])],
      widths: [34, 14, 16, 20],
    },
    {
      name: t("segments.template.sheetHelp"),
      rows: [[t("segments.template.helpTitle")], ...["help1", "help2", "help3", "help4"].map((k) => [t(`segments.template.${k}`)])],
      widths: [100],
      wrap: true,
    },
  ];
}
