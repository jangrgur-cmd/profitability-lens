// scenarios.js: the what-if engine.
//
// A scenario is a set of parameters applied to the baseline traffic rows. Each
// parameter is applied by its own pure function, in a fixed order, and every
// function returns new rows (or a new context) without changing its input.
//
// Order of operations (also shown in the app):
//   1. Volume change            multiplies volume (optionally one category)
//   2. SMS → WhatsApp migration moves part of SMS volume to WhatsApp at WhatsApp rates
//   3. Customer price change    multiplies our own fee (optionally one channel)
//   4. Operator cost change     multiplies delivery cost (optionally one channel, some countries)
//   5. Exchange rate            changes EUR/USD, so the EUR cost of USD lines
//
// The margin bridge attributes the change in gross profit to each step: the
// profit after step k minus the profit after step k − 1.

import { summarize } from "./calc.js";
import { t } from "../../../src/shared/i18n.js";

/** A scenario where nothing changes. Every parameter defaults to "no change". */
export const DEFAULT_SCENARIO = Object.freeze({
  volumeChange: 0, // share, e.g. 0.1 = +10%
  volumeCategory: "all",
  migration: Object.freeze({ authentication: 0, utility: 0, marketing: 0 }), // share of SMS volume moved
  conversionRatio: 1, // WhatsApp messages that replace one SMS
  priceChange: 0,
  priceChannel: "all",
  costChange: 0,
  costChannel: "all",
  costCountries: Object.freeze([]), // empty = all countries
  fxChange: 0, // change in the EUR/USD rate, e.g. −0.1 = the euro buys 10% fewer dollars
});

/** Allowed ranges, from the spec. */
export const LIMITS = Object.freeze({
  volumeChange: [-0.3, 0.3],
  migration: [0, 0.5],
  conversionRatio: [0.5, 2],
  priceChange: [-0.2, 0.2],
  costChange: [-0.3, 0.5],
  fxChange: [-0.2, 0.2],
});

/** Returns a full scenario: the defaults with `partial` on top. */
export function makeScenario(partial = {}) {
  return {
    ...DEFAULT_SCENARIO,
    ...partial,
    migration: { ...DEFAULT_SCENARIO.migration, ...(partial.migration ?? {}) },
    costCountries: [...(partial.costCountries ?? DEFAULT_SCENARIO.costCountries)],
  };
}

/** True when the scenario changes nothing. */
export function isDefaultScenario(s) {
  return (
    s.volumeChange === 0 &&
    Object.values(s.migration).every((v) => v === 0) &&
    s.priceChange === 0 &&
    s.costChange === 0 &&
    s.fxChange === 0
  );
}

// ---------------------------------------------------------------------------
// Step 1: volume
// ---------------------------------------------------------------------------

/**
 * Volume change: new volume = volume × (1 + change), for one category or all.
 */
export function applyVolumeChange(rows, { volumeChange, volumeCategory }) {
  if (volumeChange === 0) return rows;
  return rows.map((r) =>
    volumeCategory === "all" || r.category === volumeCategory ? { ...r, volume: r.volume * (1 + volumeChange) } : r,
  );
}

// ---------------------------------------------------------------------------
// Step 2: SMS → WhatsApp migration
// ---------------------------------------------------------------------------

/** Key that identifies "the same month, customer, country and category". */
const migrationKey = (r) => `${r.month}|${r.customer_id}|${r.country}|${r.category}`;

/**
 * Builds a WhatsApp row for a customer that had no WhatsApp traffic in that
 * month, country and category, priced and costed from the assumptions.
 * @param {Map<string, number|string>} rates assumption id → value
 */
function newWhatsAppRow(smsRow, rates) {
  const route = `${smsRow.country}_WhatsApp_${smsRow.category}`;
  const value = (id) => {
    if (!rates.has(id)) throw new Error(`Missing assumption for migration: ${id}`);
    return rates.get(id);
  };
  return {
    month: smsRow.month,
    customer_id: smsRow.customer_id,
    country: smsRow.country,
    channel: "WhatsApp",
    category: smsRow.category,
    volume: 0,
    price_eur: value(`price_${route}`),
    passthrough_eur: value(`passthrough_${route}`),
    cost_local: value(`cost_${route}`),
    cost_currency: value(`cost_currency_${smsRow.country}_WhatsApp`),
    platform_cost_eur: value("platform_cost_WhatsApp"),
  };
}

/**
 * SMS → WhatsApp migration, per category.
 * For each SMS row: moved = volume × migration share for its category.
 * - The SMS row keeps volume − moved.
 * - The WhatsApp row of the same month, customer, country and category gains
 *   moved × conversion ratio (how many WhatsApp messages replace one SMS).
 *   If that WhatsApp row does not exist, it is created at WhatsApp rates.
 */
export function applyMigration(rows, { migration, conversionRatio }, rates) {
  if (Object.values(migration).every((v) => v === 0)) return rows;

  const out = rows.map((r) => ({ ...r }));
  const whatsappByKey = new Map(out.filter((r) => r.channel === "WhatsApp").map((r) => [migrationKey(r), r]));
  const added = [];

  for (const row of out) {
    const share = row.channel === "SMS" ? migration[row.category] ?? 0 : 0;
    if (share === 0) continue;
    const moved = row.volume * share;
    row.volume -= moved;
    const key = migrationKey(row);
    let target = whatsappByKey.get(key);
    if (!target) {
      target = newWhatsAppRow(row, rates);
      whatsappByKey.set(key, target);
      added.push(target);
    }
    target.volume += moved * conversionRatio;
  }
  return [...out, ...added];
}

// ---------------------------------------------------------------------------
// Step 3: customer price
// ---------------------------------------------------------------------------

/**
 * Customer price change on our own fee, for one channel or all.
 * new price = pass-through + (price − pass-through) × (1 + change)
 * Third-party fees passed on at cost (Meta, US carriers) do not change.
 */
export function applyPriceChange(rows, { priceChange, priceChannel }) {
  if (priceChange === 0) return rows;
  return rows.map((r) => {
    if (priceChannel !== "all" && r.channel !== priceChannel) return r;
    const passthrough = r.passthrough_eur ?? 0;
    return { ...r, price_eur: passthrough + (r.price_eur - passthrough) * (1 + priceChange) };
  });
}

// ---------------------------------------------------------------------------
// Step 4: operator cost
// ---------------------------------------------------------------------------

/**
 * Operator (delivery) cost change: new cost = cost × (1 + change), for one
 * channel or all, and for the listed countries (empty list = all countries).
 * Customer prices do not move with it, so the change lands on gross profit.
 */
export function applyCostChange(rows, { costChange, costChannel, costCountries }) {
  if (costChange === 0) return rows;
  const countries = new Set(costCountries);
  return rows.map((r) => {
    const channelMatch = costChannel === "all" || r.channel === costChannel;
    const countryMatch = countries.size === 0 || countries.has(r.country);
    return channelMatch && countryMatch ? { ...r, cost_local: r.cost_local * (1 + costChange) } : r;
  });
}

// ---------------------------------------------------------------------------
// Step 5: exchange rate
// ---------------------------------------------------------------------------

/**
 * Exchange-rate change: new EUR/USD = base × (1 + change).
 * A lower EUR/USD (stronger dollar) makes USD costs more expensive in EUR.
 * Prices stay in EUR, including pass-through fees fixed on the price list.
 * @returns {object} a new calculation context
 */
export function applyFxChange(ctx, { fxChange }) {
  if (fxChange === 0) return ctx;
  return { ...ctx, eurUsd: ctx.eurUsd * (1 + fxChange) };
}

// ---------------------------------------------------------------------------
// Running a scenario
// ---------------------------------------------------------------------------

/**
 * The steps in their fixed order. Labels and descriptions for the UI and the
 * bridge are read in the interface language (seg.scenarios.steps).
 */
export const STEPS = Object.freeze(["volume", "migration", "price", "cost", "fx"].map((key) => Object.freeze({
  key,
  get label() { return t(`seg.scenarios.steps.${key}`); },
  get description() { return t(`seg.scenarios.steps.${key}Description`); },
})));

/**
 * Applies a scenario step by step.
 * @param {object[]} rows baseline traffic rows (not changed)
 * @param {object} ctx baseline calculation context (not changed)
 * @param {object} scenario see DEFAULT_SCENARIO
 * @param {Map<string, number|string>} rates assumption id → value (for new WhatsApp rows)
 * @returns {{key:string, label:string, rows:object[], ctx:object}[]} the baseline
 *   followed by the state after each step; the last entry is the full scenario
 */
export function runScenario(rows, ctx, scenario, rates) {
  const s = makeScenario(scenario);
  const states = [{ key: "baseline", label: t("seg.scenarios.steps.baseline"), rows, ctx }];
  let current = rows;
  current = applyVolumeChange(current, s);
  states.push({ key: "volume", label: STEPS[0].label, rows: current, ctx });
  current = applyMigration(current, s, rates);
  states.push({ key: "migration", label: STEPS[1].label, rows: current, ctx });
  current = applyPriceChange(current, s);
  states.push({ key: "price", label: STEPS[2].label, rows: current, ctx });
  current = applyCostChange(current, s);
  states.push({ key: "cost", label: STEPS[3].label, rows: current, ctx });
  const fxCtx = applyFxChange(ctx, s);
  states.push({ key: "fx", label: STEPS[4].label, rows: current, ctx: fxCtx });
  return states;
}

/**
 * Margin bridge (waterfall) from baseline gross profit to scenario gross profit.
 * Each step's effect = gross profit after the step − gross profit before it,
 * so the effects always add up exactly to the total change.
 * @param {object[]} states output of runScenario
 * @param {(rows: object[]) => object[]} [select] optional filter applied to every
 *   state (the global filter bar), so the bridge matches the visible selection
 * @returns {{baseline: object, scenario: object, steps: {key:string, label:string, delta:number, marginAfter:number|null}[]}}
 */
export function marginBridge(states, select = (rows) => rows) {
  const totals = states.map((st) => summarize(select(st.rows), st.ctx));
  const steps = states.slice(1).map((st, i) => ({
    key: st.key,
    label: st.label,
    delta: totals[i + 1].grossProfit - totals[i].grossProfit,
    marginAfter: totals[i + 1].grossMarginPct,
  }));
  return { baseline: totals[0], scenario: totals[totals.length - 1], steps };
}

/**
 * Change in gross profit per group (e.g. per route or per customer) between
 * baseline and scenario, largest absolute change first.
 * @param {(row: object) => string} keyFn group key
 * @returns {{key:string, baseline:number, scenario:number, delta:number, baselineMargin:number|null, scenarioMargin:number|null}[]}
 */
export function mostAffected(baselineRows, baselineCtx, scenarioRows, scenarioCtx, keyFn, limit = 5) {
  const group = (rows) => {
    const map = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return map;
  };
  const before = group(baselineRows);
  const after = group(scenarioRows);
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys]
    .map((key) => {
      const b = summarize(before.get(key) ?? [], baselineCtx);
      const s = summarize(after.get(key) ?? [], scenarioCtx);
      return {
        key,
        baseline: b.grossProfit,
        scenario: s.grossProfit,
        delta: s.grossProfit - b.grossProfit,
        baselineMargin: b.grossMarginPct,
        scenarioMargin: s.grossMarginPct,
      };
    })
    .filter((x) => Math.abs(x.delta) > 1e-9)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

/** The three preset scenarios, each with a one-line explanation. */
export const PRESETS = Object.freeze([
  {
    id: "operator-increase",
    get label() { return t("seg.scenarios.presets.operatorIncrease"); },
    get description() { return t("seg.scenarios.presets.operatorIncreaseDescription"); },
    scenario: { costChange: 0.15, costChannel: "SMS", costCountries: ["HR", "DE", "FR", "GB"] },
  },
  {
    id: "shift-to-whatsapp",
    get label() { return t("seg.scenarios.presets.whatsappShift"); },
    get description() { return t("seg.scenarios.presets.whatsappShiftDescription"); },
    scenario: { migration: { marketing: 0.25, utility: 0.25 } },
  },
  {
    id: "strong-dollar",
    get label() { return t("seg.scenarios.presets.strongDollar"); },
    get description() { return t("seg.scenarios.presets.strongDollarDescription"); },
    scenario: { fxChange: -0.1 },
  },
]);
