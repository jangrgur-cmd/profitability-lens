// whatif.js: "What if…" levers for the Company rating.
//
// Each lever changes one driver of profit by a percentage. The changed
// figures are rated again, so the grade responds live:
//
//   Revenue'  = Revenue × (1 + volume) × (1 + price)
//   COGS'     = COGS × (1 + volume) × (1 + unit cost)     (stays blank when blank)
//   Opex'     = Opex × (1 + opex change)
//   Tax'      = Tax + effective tax rate × (EBT' − EBT), never below 0 when the
//               base year paid tax (extra profit is taxed at the company's rate)
//
// Everything else (D&A, other financial income, interest and the whole
// balance sheet) stays as entered, so returns move only through profit.
// Pure functions; levers are in percent (5 for +5%).

import { deriveStatement } from "./ratios.js";
import { rate } from "./rating.js";
import { t } from "../shared/i18n.js";

/**
 * The levers, in display order. `needs` names an input the lever cannot work
 * without. Texts are read in the interface language.
 */
export const LEVERS = [
  { id: "volume", min: -30, max: 30, step: 1, needs: null },
  { id: "price", min: -20, max: 20, step: 1, needs: null },
  { id: "unitCost", min: -20, max: 20, step: 1, needs: "cogs" },
  { id: "opex", min: -30, max: 30, step: 1, needs: null },
].map((lever) => ({
  ...lever,
  get label() { return t(`rating.whatif.levers.${lever.id}.label`); },
  get help() { return t(`rating.whatif.levers.${lever.id}.help`); },
}));

/** All levers at zero: the figures as entered. */
export const NO_CHANGE = Object.freeze(Object.fromEntries(LEVERS.map((l) => [l.id, 0])));

const pct = (levers, id) => (levers[id] ?? 0) / 100;

/**
 * The figures after the levers move.
 * @param {Record<string, number|null>} values validated input values
 * @param {Record<string, number>} levers lever id → percent change
 * @returns {Record<string, number|null>} new values (the input is not changed)
 */
export function applyWhatIf(values, levers) {
  const base = deriveStatement(values);
  const volume = 1 + pct(levers, "volume");
  const out = { ...values };
  out.revenue = values.revenue * volume * (1 + pct(levers, "price"));
  if (values.cogs !== null && values.cogs !== undefined) out.cogs = values.cogs * volume * (1 + pct(levers, "unitCost"));
  if (values.opex !== null && values.opex !== undefined) out.opex = values.opex * (1 + pct(levers, "opex"));

  const ebt = deriveStatement({ ...out, tax: 0 }).ebt;
  const tax = values.tax ?? 0;
  let newTax = tax + base.taxRate * (ebt - base.ebt);
  if (tax >= 0 && newTax < 0) newTax = 0;
  // Keep a blank tax blank when nothing changes it, so "no levers" returns the figures as entered.
  out.tax = values.tax === null && newTax === 0 ? null : newTax;
  return out;
}

/**
 * Rates the changed figures and compares them with the base rating.
 * @param {Record<string, number|null>} values validated input values
 * @param {Record<string, number>} levers
 * @param {string} industryId
 * @returns {{values: object, rating: object, base: object, scoreChange: number,
 *            ratioChanges: {id: string, label: string, before: number|null, after: number|null, change: number|null}[],
 *            noTaxAssumed: boolean}}
 *   noTaxAssumed: the base year had no taxable profit, so extra profit is not taxed
 */
export function runWhatIf(values, levers, industryId) {
  const base = rate(values, industryId);
  const changed = applyWhatIf(values, levers);
  const rating = rate(changed, industryId);
  const ratioChanges = rating.ratios.map((r, i) => {
    const before = base.ratios[i].value;
    return { id: r.id, label: r.label, before, after: r.value, change: before === null || r.value === null ? null : r.value - before };
  });
  return {
    values: changed,
    rating,
    base,
    scoreChange: rating.score - base.score,
    ratioChanges,
    noTaxAssumed: base.statement.taxRate === 0 && base.statement.ebt <= 0,
  };
}

/** True when at least one lever is away from zero. */
export function hasChanges(levers) {
  return LEVERS.some((l) => (levers[l.id] ?? 0) !== 0);
}
