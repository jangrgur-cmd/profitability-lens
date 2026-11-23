// state.js: the app's view state and how it is stored in the URL hash.
//
// The hash only lists settings that differ from the defaults, so the plain
// link stays clean and a shared link reproduces exactly the same view:
//   #tab=routes&from=3&to=6&country=NG&channel=SMS

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
  return { tab: "overview", filters: { ...DEFAULT_FILTERS } };
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
  const text = params.toString();
  return text ? `#${text}` : "";
}

/** True when every filter is at its default value. */
export function filtersAreDefault(filters) {
  return Object.keys(DEFAULT_FILTERS).every((k) => filters[k] === DEFAULT_FILTERS[k]);
}
