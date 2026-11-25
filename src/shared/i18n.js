// i18n.js: the language of the interface (English or Croatian).
//
// Every piece of text a user sees lives in src/shared/lang/en.js and hr.js,
// under the same keys. Code asks for text with t(key, params), e.g.
//
//   t("rating.flags.netLoss.title")                   → "Net loss" / "Neto gubitak"
//   t("rating.validation.required", { label: "Revenue" }) → "Revenue is required."
//   t("rating.page.attention", { count: 3 })              → plural form chosen by count
//
// A text with placeholders writes them as {name}. A text that depends on a
// number is an object of plural forms ({ one, few, other }), chosen with
// Intl.PluralRules for the language (English has one/other, Croatian
// one/few/other).
//
// The language is read once when the page loads: the choice stored in
// localStorage, or else the browser's language (Croatian for "hr…", English
// otherwise). Changing it stores the choice and reloads the page, so every
// module starts again in the new language. In Node (the tests) the language is
// English unless a test calls useLanguage().
//
// The language also decides number formatting (src/shared/format.js):
// English 1,234.56 and 22.1%, Croatian 1.234,56 and 22,1 %.

import en from "./lang/en.js";
import hr from "./lang/hr.js";

/** The languages, in switch order. */
export const LANGUAGES = [
  { id: "en", short: "EN", name: "English" },
  { id: "hr", short: "HR", name: "Hrvatski" },
];

const DICTIONARIES = { en, hr };
const STORAGE_KEY = "profitability-lens/lang";
const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";

/** The stored choice, or the browser's language, or English. */
function detectLanguage() {
  if (!inBrowser) return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && DICTIONARIES[stored]) return stored;
  } catch {
    // Storage unavailable: fall back to the browser's language.
  }
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language ?? "en"];
  return preferred.some((l) => /^hr\b/i.test(l)) ? "hr" : "en";
}

let current = detectLanguage();
let pluralRules = new Intl.PluralRules(current);
if (inBrowser) document.documentElement.lang = current;

/** The current language id: "en" or "hr". */
export function getLang() {
  return current;
}

/**
 * Switches the language in memory, without storing or reloading. For tests
 * and for code that builds text in a given language.
 * @param {"en"|"hr"} lang
 */
export function useLanguage(lang) {
  if (!DICTIONARIES[lang]) throw new Error(`Unknown language: ${lang}`);
  current = lang;
  pluralRules = new Intl.PluralRules(lang);
}

/**
 * Stores the user's choice and reloads the page in that language.
 * @param {"en"|"hr"} lang
 */
export function setLanguage(lang) {
  if (!DICTIONARIES[lang]) throw new Error(`Unknown language: ${lang}`);
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not stored: the page still reloads in English or the browser's language.
  }
  window.location.reload();
}

/** Looks up a dotted key in a dictionary; undefined when absent. */
function lookup(dict, key) {
  return key.split(".").reduce((node, part) => (node === undefined || node === null ? undefined : node[part]), dict);
}

/** True when the key exists in the current language. */
export function hasText(key) {
  return lookup(DICTIONARIES[current], key) !== undefined;
}

/** Fills {placeholders} with params; a missing param stays visible as {name}. */
function interpolate(text, params) {
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
}

/**
 * The text for a key in the current language.
 * @param {string} key dotted path, e.g. "rating.flags.netLoss.title"
 * @param {Record<string, string|number>} [params] placeholder values; `count` picks the plural form
 * @returns {string}
 * @throws {Error} for an unknown key, so a missing text is found by the tests, never shown as a key
 */
export function t(key, params = {}) {
  let entry = lookup(DICTIONARIES[current], key);
  if (entry === undefined) throw new Error(`Missing text "${key}" in language "${current}"`);
  if (typeof entry === "object" && entry !== null && "other" in entry) {
    entry = entry[pluralRules.select(Number(params.count))] ?? entry.other;
  }
  if (typeof entry !== "string") throw new Error(`Text "${key}" is not a string`);
  return interpolate(entry, params);
}

/**
 * Fills static page text from the language files:
 *   data-i18n → textContent
 *   data-i18n-html → innerHTML (only for our own texts with <strong>, <code>, <a>)
 *   data-i18n-attr → attributes, as "attr: key; attr: key" (aria-label, title…)
 * @param {ParentNode} [root=document]
 */
export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

/** Both dictionaries, for the tests that check they have the same keys. */
export const DICTIONARIES_FOR_TESTS = DICTIONARIES;
