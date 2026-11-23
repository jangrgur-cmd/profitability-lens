// Deterministic generator for data/traffic.json.
//
// Usage: node scripts/generate-data.mjs
//
// Every number used here is read from data/assumptions.json. The only logic in
// this file is how those assumptions are combined into monthly traffic rows.
// A seeded PRNG (mulberry32) makes the output identical on every run.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSUMPTIONS_PATH = path.join(ROOT, "data", "assumptions.json");
const TRAFFIC_PATH = path.join(ROOT, "data", "traffic.json");

/**
 * mulberry32: a small, fast, seeded pseudo-random number generator.
 * Returns a function that yields numbers in [0, 1). Same seed, same sequence.
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a lookup from assumption id to its value.
 * @param {object} assumptionsFile parsed assumptions.json
 * @returns {Map<string, number|string>}
 */
export function indexAssumptions(assumptionsFile) {
  return new Map(assumptionsFile.assumptions.map((a) => [a.id, a.value]));
}

/** Returns the assumption value for `id`, or throws if it is missing. */
function lookup(values, id) {
  if (!values.has(id)) throw new Error(`Missing assumption: ${id}`);
  return values.get(id);
}

/** Fisher-Yates shuffle using the seeded PRNG (returns a new array). */
function shuffle(items, rand) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Random integer in [min, max], inclusive. */
function randomInt(min, max, rand) {
  return min + Math.floor(rand() * (max - min + 1));
}

/**
 * Picks the countries a customer sends traffic to, with a relative weight each.
 * Home-region countries come first (weight 1.0); the rest are "foreign"
 * countries with a smaller, randomised weight.
 */
function pickCountries(customer, dims, gen, rand) {
  const [min, max] = gen.countries_per_tier[customer.size_tier];
  const count = randomInt(min, max, rand);
  const homeRegion = dims.countries.find((c) => c.code === customer.home_country)?.region;
  const home = dims.countries.filter((c) => c.region === homeRegion).map((c) => c.code);
  const foreign = dims.countries.filter((c) => c.region !== homeRegion).map((c) => c.code);
  const ordered = [...shuffle(home, rand), ...shuffle(foreign, rand)].slice(0, count);

  const weights = ordered.map((code) =>
    home.includes(code) ? 1 : gen.foreign_country_weight * (0.5 + rand()),
  );
  const total = weights.reduce((s, w) => s + w, 0);
  return ordered.map((code, i) => ({ code, weight: weights[i] / total }));
}

/**
 * Uses a customer's fixed traffic footprint from assumptions.json instead of a
 * random pick. Weights are normalised so they sum to 1.
 * @param {Record<string, number>} countryWeights e.g. { NG: 0.85, TR: 0.15 }
 */
function fixedCountries(countryWeights) {
  const total = Object.values(countryWeights).reduce((s, w) => s + w, 0);
  return Object.entries(countryWeights).map(([code, w]) => ({ code, weight: w / total }));
}

/** Picks the channels a customer uses: the tier's "always" list plus optional ones by probability. */
function pickChannels(customer, gen, rand) {
  const rule = gen.channels_per_tier[customer.size_tier];
  const chosen = new Set(rule.always);
  for (const [channel, probability] of Object.entries(rule.optional)) {
    if (rand() < probability) chosen.add(channel);
  }
  return chosen;
}

/**
 * Generates all traffic rows from the assumptions file.
 *
 * Each customer's countries and channels are picked at random from its size
 * tier's rules, unless the customer has a fixed `footprint` in assumptions.json.
 *
 * Volume of one row =
 *   customer base monthly volume
 *   × country weight (customer's split across countries)
 *   × channel share (country channel mix, limited to the channels the customer uses)
 *   × category share (industry category mix; Voice carries authentication only)
 *   × seasonality index for that month and category
 *   × random noise (±noise_pct)
 *
 * Price, pass-through fee, cost, cost currency and platform cost are copied
 * from the assumptions for that country × channel × category.
 *
 * @param {object} assumptionsFile parsed assumptions.json
 * @returns {object[]} traffic rows
 */
export function generateTraffic(assumptionsFile) {
  const { dimensions: dims, generator: gen, customers } = assumptionsFile;
  const values = indexAssumptions(assumptionsFile);
  const rand = mulberry32(gen.seed);
  const rows = [];

  for (const customer of customers) {
    // Most customers get a random footprint; a few have a fixed one in assumptions.json.
    const footprint = customer.footprint ?? {};
    const countries = footprint.countries
      ? fixedCountries(footprint.countries)
      : pickCountries(customer, dims, gen, rand);
    const usedChannels = footprint.channels
      ? new Set(footprint.channels)
      : pickChannels(customer, gen, rand);
    const industryKey = customer.industry.replace(/\W/g, "");

    for (const { code: country, weight: countryWeight } of countries) {
      // Channel shares inside this country, renormalised to the channels this customer uses.
      const mix = dims.channels
        .filter((ch) => usedChannels.has(ch))
        .map((ch) => ({ channel: ch, share: lookup(values, `channel_mix_${country}_${ch}`) }))
        .filter((m) => m.share > 0);
      const mixTotal = mix.reduce((s, m) => s + m.share, 0);
      if (mixTotal === 0) continue;

      for (const { channel, share } of mix) {
        const channelShare = share / mixTotal;
        const categories =
          channel === "Voice"
            ? [{ id: "authentication", share: 1 }]
            : dims.categories.map((c) => ({
                id: c.id,
                share: lookup(values, `category_mix_${industryKey}_${c.id}`),
              }));
        const route = `${country}_${channel}`;
        const costCurrency = lookup(values, `cost_currency_${route}`);
        const platformCost = lookup(values, `platform_cost_${channel}`);

        for (const category of categories) {
          if (category.share === 0) continue;
          const price = lookup(values, `price_${route}_${category.id}`);
          const passthrough = lookup(values, `passthrough_${route}_${category.id}`);
          const cost = lookup(values, `cost_${route}_${category.id}`);
          const seasonGroup = category.id === "marketing" ? "marketing" : "other";

          for (let month = 1; month <= dims.months.length; month++) {
            const season = lookup(values, `seasonality_${seasonGroup}_${String(month).padStart(2, "0")}`);
            const noise = 1 + gen.noise_pct * (2 * rand() - 1);
            const volume = Math.round(
              customer.base_monthly_volume * countryWeight * channelShare * category.share * season * noise,
            );
            if (volume < gen.min_row_volume) continue;
            rows.push({
              month,
              customer_id: customer.id,
              country,
              channel,
              category: category.id,
              volume,
              price_eur: price,
              passthrough_eur: passthrough,
              cost_local: cost,
              cost_currency: costCurrency,
              platform_cost_eur: platformCost,
            });
          }
        }
      }
    }
  }
  return rows;
}

/** Serialises rows as a JSON array with one row per line (compact, but readable in git diffs). */
export function serializeRows(rows) {
  return "[\n" + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n";
}

function main() {
  const assumptionsFile = JSON.parse(readFileSync(ASSUMPTIONS_PATH, "utf8"));
  const rows = generateTraffic(assumptionsFile);
  const text = serializeRows(rows);
  writeFileSync(TRAFFIC_PATH, text);
  const totalVolume = rows.reduce((s, r) => s + r.volume, 0);
  console.log(`Wrote ${rows.length} rows to data/traffic.json`);
  console.log(`Total volume: ${totalVolume.toLocaleString("en-US")} messages`);
  console.log(`File size: ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
