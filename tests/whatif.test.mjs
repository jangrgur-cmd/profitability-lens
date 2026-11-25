// Tests for src/rating/whatif.js and src/rating/compare.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyWhatIf, runWhatIf, hasChanges, LEVERS, NO_CHANGE } from "../src/rating/whatif.js";
import { comparePeers, addPeer, MAX_PEERS } from "../src/rating/compare.js";
import { deriveStatement } from "../src/rating/ratios.js";
import { SAMPLES } from "../src/rating/samples.js";
import { HAND_CASE } from "./fixtures.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
const sample = (id) => SAMPLES.find((s) => s.id === id);

test("with every lever at zero the figures are exactly as entered", () => {
  assert.deepEqual(applyWhatIf(HAND_CASE, NO_CHANGE), { ...HAND_CASE });
  for (const s of SAMPLES) assert.deepEqual(applyWhatIf(s.values, NO_CHANGE), { ...s.values }, s.id);
  const run = runWhatIf(HAND_CASE, NO_CHANGE, "general");
  assert.equal(run.scoreChange, 0);
  assert.ok(run.ratioChanges.every((c) => c.change === 0));
  assert.equal(hasChanges(NO_CHANGE), false);
  assert.equal(hasChanges({ ...NO_CHANGE, price: 1 }), true);
});

test("volume +10% moves revenue and COGS; extra profit is taxed at the effective rate (by hand)", () => {
  // Revenue 1100, COGS 660, opex 200 → EBITDA 240, EBIT 190, EBT 160 (base 120).
  // Tax rate 24 / 120 = 20% → tax 24 + 0.2 × 40 = 32 → net income 128.
  const v = applyWhatIf(HAND_CASE, { ...NO_CHANGE, volume: 10 });
  close(v.revenue, 1100, "revenue");
  close(v.cogs, 660, "COGS");
  assert.equal(v.opex, 200);
  close(v.tax, 32, "tax");
  close(deriveStatement(v).netIncome, 128, "net income");
  assert.equal(v.assets, HAND_CASE.assets, "the balance sheet stays as entered");
});

test("price, unit cost and opex levers", () => {
  const price = applyWhatIf(HAND_CASE, { ...NO_CHANGE, price: 10 });
  close(price.revenue, 1100, "price raises revenue");
  assert.equal(price.cogs, 600, "but not COGS");
  const cost = applyWhatIf(HAND_CASE, { ...NO_CHANGE, unitCost: -10 });
  close(cost.cogs, 540, "unit cost");
  const opex = applyWhatIf(HAND_CASE, { ...NO_CHANGE, opex: 25 });
  close(opex.opex, 250, "opex");
  const both = applyWhatIf(HAND_CASE, { ...NO_CHANGE, volume: 10, unitCost: 10 });
  close(both.cogs, 726, "volume and unit cost multiply: 600 × 1.1 × 1.1");
});

test("tax never turns into a credit when the base year paid tax; no COGS stays blank", () => {
  // Price −20%: revenue 800, EBIT −50, EBT −80 → 24 + 0.2 × (−200) < 0 → 0.
  assert.equal(applyWhatIf(HAND_CASE, { ...NO_CHANGE, price: -20 }).tax, 0);
  const hotel = sample("hotel").values;
  const v = applyWhatIf(hotel, { ...NO_CHANGE, volume: 10, unitCost: 15 });
  assert.equal(v.cogs, null);
  close(v.revenue, hotel.revenue * 1.1, "hotel revenue");
  assert.ok(LEVERS.find((l) => l.id === "unitCost").needs === "cogs");
});

test("a loss-making base year has no tax rate, and the result says so", () => {
  const run = runWhatIf(sample("startup").values, { ...NO_CHANGE, volume: 30, opex: -30 }, "software");
  assert.equal(run.noTaxAssumed, true);
  assert.ok(run.rating.statement.netIncome > 0);
  assert.ok(run.scoreChange > 0);
  assert.equal(runWhatIf(HAND_CASE, NO_CHANGE, "general").noTaxAssumed, false);
});

test("comparePeers rates everyone on one scale and marks the best column per ratio", () => {
  const peers = [
    { id: "p1", name: "Bakery", origin: "example", values: sample("bakery").values },
    { id: "p2", name: "Start-up", origin: "example", values: sample("startup").values },
  ];
  const { columns, best } = comparePeers({ name: "Hand case", values: HAND_CASE }, peers, "general");
  assert.deepEqual(columns.map((c) => c.name), ["Hand case", "Bakery", "Start-up"]);
  assert.ok(columns.every((c) => c.rating.industry.id === "general"));
  assert.deepEqual(best.score, [0]);
  assert.deepEqual(best.grossMargin, [2], "the start-up's 80% gross margin is the highest");
});

test("a peer with invalid figures is shown without a rating and left out of 'best'", () => {
  const { columns, best } = comparePeers({ name: "A", values: HAND_CASE }, [{ id: "p1", name: "Broken", origin: "file", values: { revenue: 5 } }], "general");
  assert.equal(columns[1].rating, null);
  assert.ok(columns[1].errors.length >= 2);
  assert.deepEqual(best.score, [], "one rated column has nothing to beat");
});

test("addPeer: at most three, no duplicates, unique ids", () => {
  let peers = [];
  for (const s of SAMPLES) ({ peers } = addPeer(peers, { name: s.name, origin: "example", values: s.values }));
  assert.equal(peers.length, MAX_PEERS);
  assert.deepEqual(peers.map((p) => p.id), ["p1", "p2", "p3"]);
  assert.deepEqual(addPeer(peers, { name: "X", origin: "kept", values: HAND_CASE }).reason, "full");
  const two = peers.slice(1);
  assert.equal(addPeer(two, { name: SAMPLES[1].name, origin: "example", values: SAMPLES[1].values }).reason, "duplicate");
  assert.equal(addPeer(two, { name: "Y", origin: "kept", values: HAND_CASE }).peers.at(-1).id, "p4", "a new id never repeats one in use");
});
