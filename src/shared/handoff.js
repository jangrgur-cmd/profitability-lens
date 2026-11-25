// handoff.js: passes figures from the segment module to the Company rating.
//
// "Send to Company rating" in the messaging dashboard opens the rating page
// with the full-year figures in the URL hash:
//   index.html#from=messaging&revenue=112345678&cogs=86543210
// The figures are totals of the fictional case study, never user data.
// The rating page reads them once, fills the form and removes the hash.

import { t } from "./i18n.js";

/** Where the figures can come from, and how the rating page describes them (texts in the interface language). */
export const HANDOFF_SOURCES = {
  messaging: {
    id: "messaging",
    industryId: "telecom",
    backLink: "modules/messaging/#tab=routes",
    get label() { return t("rating.handoff.messagingSource"); },
    get companyName() { return t("rating.handoff.messagingCompany"); },
    get backLabel() { return t("rating.handoff.messagingBack"); },
  },
};

/** The form fields a hand-off may fill. */
const HANDOFF_FIELDS = ["revenue", "cogs"];

/**
 * Builds the hash for the rating page.
 * @param {"messaging"} source
 * @param {{revenue: number, cogs: number}} figures in EUR; rounded to whole euros
 * @returns {string} e.g. "#from=messaging&revenue=1000&cogs=600"
 */
export function encodeHandoff(source, figures) {
  if (!HANDOFF_SOURCES[source]) throw new Error(`Unknown hand-off source: ${source}`);
  const params = new URLSearchParams({ from: source });
  for (const id of HANDOFF_FIELDS) {
    if (!Number.isFinite(figures[id])) throw new Error(`Hand-off needs a number for ${id}`);
    params.set(id, String(Math.round(figures[id])));
  }
  return `#${params}`;
}

/**
 * Reads a hand-off hash. Anything else (an empty hash, another page's hash,
 * a bad number) gives null, so a stray link never fills the form with junk.
 * @param {string} hash location.hash
 * @returns {{source: object, values: {revenue: number, cogs: number}}|null}
 */
export function decodeHandoff(hash) {
  const params = new URLSearchParams(String(hash ?? "").replace(/^#/, ""));
  const source = HANDOFF_SOURCES[params.get("from")];
  if (!source) return null;
  const values = {};
  for (const id of HANDOFF_FIELDS) {
    const text = params.get(id);
    const value = text === null || text.trim() === "" ? Number.NaN : Number(text);
    if (!Number.isFinite(value) || value < 0) return null;
    values[id] = value;
  }
  if (values.revenue <= 0) return null;
  return { source, values };
}
