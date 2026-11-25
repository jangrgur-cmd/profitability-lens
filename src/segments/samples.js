// samples.js (segments): two FICTIONAL segment tables for "Load example".
//
// Invented for learning; any resemblance to a real business is a
// coincidence. Segment names are generic descriptions, read in the interface
// language (segments.samples.<id>.items.<key>).
//
// The bakery's six product lines add up to the revenue (€2,400,000) and cost
// of goods sold (€1,450,000) of the fictional bakery in the Company rating
// examples, so "Send to Company rating" lands on the same company.

import { t } from "../shared/i18n.js";

/** [key, revenue, variable costs, direct fixed costs] in EUR. */
const BAKERY = [
  ["bread", 820_000, 410_000, 90_000],
  ["pastries", 560_000, 280_000, 60_000],
  ["cakes", 310_000, 150_000, 70_000],
  ["sandwiches", 240_000, 175_000, 45_000],
  ["privateLabel", 380_000, 340_000, 50_000],
  ["catering", 90_000, 95_000, 15_000],
];

const WHOLESALER = [
  ["chainA", 1_450_000, 1_240_000, 95_000],
  ["chainB", 980_000, 850_000, 80_000],
  ["hotelGroup", 620_000, 470_000, 40_000],
  ["cafeChain", 360_000, 265_000, 30_000],
  ["petrol", 410_000, 330_000, 55_000],
  ["restaurantA", 210_000, 150_000, 18_000],
  ["restaurantB", 140_000, 101_000, 16_000],
  ["caterer", 75_000, 58_000, 9_000],
  ["school", 95_000, 78_000, 14_000],
  ["online", 180_000, 150_000, 42_000],
  ["cornerShops", 260_000, 205_000, 70_000],
  ["export", 320_000, 290_000, 48_000],
];

function sample(id, kind, rows) {
  return {
    id,
    kind,
    fictional: true,
    get name() { return t(`segments.samples.${id}.name`); },
    get description() { return t(`segments.samples.${id}.description`); },
    /** The table, with names in the current interface language. */
    get segments() {
      return rows.map(([key, revenue, variableCosts, fixedCosts]) => ({
        name: t(`segments.samples.${id}.items.${key}`), revenue, variableCosts, fixedCosts,
      }));
    },
  };
}

export const SEGMENT_SAMPLES = [
  sample("bakery", "product", BAKERY),
  sample("wholesaler", "customer", WHOLESALER),
];
