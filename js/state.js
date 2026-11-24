// state.js: the app's view state and how it is stored in the URL hash.
//
// The hash only lists settings that differ from the defaults, so the plain
// link stays clean and a shared link reproduces exactly the same view:
//   #tab=scenarios&country=DE&sc=15&scc=SMS&sco=HR,DE,FR,GB
// Scenario shares are stored as whole percentages (sc=15 means +15%).

import { DEFAULT_SCENARIO, LIMITS, makeScenario } from "./scenarios.js";

export const TABS = ["overview", "routes", "customers", "scenarios", "assumptions", "checks"];

export const DEFAULT_FILTERS = Object.freeze({
  monthFrom: 1,
  monthTo: 12,
  country: "all",
  channel: "all",
  category: "all",
  industry: "all",
});

/** Hash key for each filter field. */
const FILTER_KEYS = {
  monthFrom: "from",
  monthTo: "to",
  country: "country",
  channel: "channel",
  category: "category",
  industry: "industry",
};

/** Returns a fresh default state. */
export function defaultState() {
  return { tab: "overview", filters: { ...DEFAULT_FILTERS }, scenario: makeScenario() };
}

/** Hash keys for scenario shares (stored as whole percentages). */
const SCENARIO_PCT_KEYS = {
  volumeChange: ["sv", LIMITS.volumeChange],
  priceChange: ["sp", LIMITS.priceChange],
  costChange: ["sc", LIMITS.costChange],
  fxChange: ["fx", LIMITS.fxChange],
};
const MIGRATION_KEYS = { authentication: "ma", utility: "mu", marketing: "mm" };

/** Reads a whole-percentage hash value as a share, or null if missing or out of range. */
function readPct(params, key, [min, max]) {
  if (!params.has(key)) return null;
  const share = Number(params.get(key)) / 100;
  return Number.isFinite(share) && share >= min - 1e-9 && share <= max + 1e-9 ? share : null;
}

/** Reads the scenario part of the hash, ignoring invalid values. */
function parseScenario(params, dimensions) {
  const s = makeScenario();
  for (const [field, [key, limits]] of Object.entries(SCENARIO_PCT_KEYS)) {
    const v = readPct(params, key, limits);
    if (v !== null) s[field] = v;
  }
  for (const [category, key] of Object.entries(MIGRATION_KEYS)) {
    const v = readPct(params, key, LIMITS.migration);
    if (v !== null) s.migration[category] = v;
  }
  const ratio = Number(params.get("cr"));
  if (params.has("cr") && ratio >= LIMITS.conversionRatio[0] && ratio <= LIMITS.conversionRatio[1]) s.conversionRatio = ratio;

  const categories = dimensions.categories.map((c) => c.id);
  if (categories.includes(params.get("svc"))) s.volumeCategory = params.get("svc");
  if (dimensions.channels.includes(params.get("spc"))) s.priceChannel = params.get("spc");
  if (dimensions.channels.includes(params.get("scc"))) s.costChannel = params.get("scc");
  const codes = dimensions.countries.map((c) => c.code);
  if (params.has("sco")) s.costCountries = params.get("sco").split(",").filter((c) => codes.includes(c));
  return s;
}

/** Writes the non-default scenario settings into `params`. */
function serializeScenario(s, params) {
  const pct = (v) => String(Math.round(v * 100));
  for (const [field, [key]] of Object.entries(SCENARIO_PCT_KEYS)) {
    if (s[field] !== DEFAULT_SCENARIO[field]) params.set(key, pct(s[field]));
  }
  for (const [category, key] of Object.entries(MIGRATION_KEYS)) {
    if (s.migration[category] !== 0) params.set(key, pct(s.migration[category]));
  }
  if (s.conversionRatio !== DEFAULT_SCENARIO.conversionRatio) params.set("cr", String(s.conversionRatio));
  if (s.volumeCategory !== "all") params.set("svc", s.volumeCategory);
  if (s.priceChannel !== "all") params.set("spc", s.priceChannel);
  if (s.costChannel !== "all") params.set("scc", s.costChannel);
  if (s.costCountries.length > 0) params.set("sco", s.costCountries.join(","));
}

/**
 * Reads the state from a URL hash. Unknown or invalid values fall back to the
 * defaults, so a broken or old link still opens a working page.
 * @param {string} hash e.g. "#tab=routes&country=NG"
 * @param {object} dimensions from assumptions.json, used to validate values
 */
export function parseHash(hash, dimensions) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const state = defaultState();

  const tab = params.get("tab");
  if (TABS.includes(tab)) state.tab = tab;

  const months = dimensions.months.length;
  const from = Number(params.get(FILTER_KEYS.monthFrom));
  const to = Number(params.get(FILTER_KEYS.monthTo));
  if (Number.isInteger(from) && from >= 1 && from <= months) state.filters.monthFrom = from;
  if (Number.isInteger(to) && to >= 1 && to <= months) state.filters.monthTo = to;
  if (state.filters.monthFrom > state.filters.monthTo) {
    state.filters.monthFrom = DEFAULT_FILTERS.monthFrom;
    state.filters.monthTo = DEFAULT_FILTERS.monthTo;
  }

  const allowed = {
    country: dimensions.countries.map((c) => c.code),
    channel: dimensions.channels,
    category: dimensions.categories.map((c) => c.id),
    industry: dimensions.industries,
  };
  for (const [field, values] of Object.entries(allowed)) {
    const value = params.get(FILTER_KEYS[field]);
    if (values.includes(value)) state.filters[field] = value;
  }
  state.scenario = parseScenario(params, dimensions);
  return state;
}

/**
 * Writes the state to a URL hash, leaving out anything that is at its default.
 * @returns {string} e.g. "#tab=routes&country=NG", or "" for the default view
 */
export function serializeHash(state) {
  const params = new URLSearchParams();
  if (state.tab !== "overview") params.set("tab", state.tab);
  for (const [field, key] of Object.entries(FILTER_KEYS)) {
    if (state.filters[field] !== DEFAULT_FILTERS[field]) params.set(key, String(state.filters[field]));
  }
  if (state.scenario) serializeScenario(state.scenario, params);
  const text = params.toString();
  return text ? `#${text}` : "";
}

/** True when every filter is at its default value. */
export function filtersAreDefault(filters) {
  return Object.keys(DEFAULT_FILTERS).every((k) => filters[k] === DEFAULT_FILTERS[k]);
}
