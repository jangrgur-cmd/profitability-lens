// template.js (rating): the Excel template for the Company rating.
//
// Sheet 1 has one row per input field, labelled with the field names the
// paste import recognises, and a column per year (newest first). Sheet 2 is
// a filled-in fictional example; sheet 3 says how to use it. Opening the
// filled file on the page reads the first sheet that has numbers in it.
// Pure: texts are read in the interface language when the template is built.

import { FIELD_BY_ID } from "./fields.js";
import { YEAR_FIELD_IDS } from "./years.js";
import { SAMPLES } from "./samples.js";
import { t } from "../shared/i18n.js";

/** How many year columns the blank template has. */
export const TEMPLATE_YEARS = 3;

/**
 * The template's sheets, for writeWorkbook.
 * @param {{latestYear: number}} options the newest year column
 * @returns {{name: string, rows: (string|number|null)[][], widths: number[], wrap?: boolean}[]}
 */
export function ratingTemplate({ latestYear }) {
  const years = Array.from({ length: TEMPLATE_YEARS }, (_, i) => String(latestYear - i));
  const label = (id) => FIELD_BY_ID[id].label;
  const example = SAMPLES[0];
  return [
    {
      name: t("rating.template.sheetFigures"),
      rows: [[t("rating.template.corner"), ...years], ...YEAR_FIELD_IDS.map((id) => [label(id), ...years.map(() => null)])],
      widths: [38, 14, 14, 14],
    },
    {
      name: t("rating.template.sheetExample"),
      rows: [[t("rating.template.corner"), String(latestYear)], ...YEAR_FIELD_IDS.map((id) => [label(id), example.values[id] ?? null])],
      widths: [38, 14],
    },
    {
      name: t("rating.template.sheetHelp"),
      rows: [[t("rating.template.helpTitle")], ...["help1", "help2", "help3", "help4", "help5"].map((k) => [t(`rating.template.${k}`, { name: example.name })])],
      widths: [100],
      wrap: true,
    },
  ];
}
