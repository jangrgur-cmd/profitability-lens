// labels.js: names from the data files (countries, months, channels,
// categories, industries, size tiers, customers, assumption groups) in the
// interface language.
//
// English names come from data/assumptions.json itself. Croatian names are in
// the "data" section of src/shared/lang/hr.js; a name without a translation
// falls back to the data file, so new data never breaks the page.

import { hasText, t } from "../../../src/shared/i18n.js";

/**
 * A name from the data in the interface language.
 * @param {string} kind section under "data" in the language file, e.g. "country"
 * @param {string|number} id the item's id in the data file, e.g. "HR"
 * @param {string} fallback the name in the data file
 * @returns {string}
 */
export function dataLabel(kind, id, fallback) {
  const key = `data.${kind}.${id}`;
  return hasText(key) ? t(key) : fallback;
}

/**
 * "in Germany" / "u Njemačkoj": a country inside a sentence.
 * @param {string} code country code
 * @param {string} name the country's display name
 */
export function inCountry(code, name) {
  const key = `data.countryIn.${code}`;
  return hasText(key) ? t(key) : t("seg.overview.inCountry", { country: name });
}
