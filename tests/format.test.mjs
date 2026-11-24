// Tests for src/shared/format.js. The messaging dashboard's formats are also
// locked by modules/messaging/tests (ui-logic and golden).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MINUS, formatEur, formatSignedEur, formatPct, formatSignedPct, formatPp,
  formatMultiple, formatCount, formatInteger, toneClass,
} from "../src/shared/format.js";

test("formatPct takes an optional number of decimals", () => {
  assert.equal(formatPct(0.096), "9.6%");
  assert.equal(formatPct(0.5833, 0), "58%");
  assert.equal(formatPct(-0.4188, 2), `${MINUS}41.88%`);
  assert.equal(formatPct(null, 0), "n/a");
});

test("signed formats add + for gains and a typographic minus for losses", () => {
  assert.equal(formatSignedPct(0.15), "+15.0%");
  assert.equal(formatSignedPct(-0.1), `${MINUS}10.0%`);
  assert.equal(formatSignedPct(0), "0.0%");
  assert.equal(formatSignedPct(null), "n/a");
  assert.equal(formatSignedEur(1_234_567), "+€1.2M");
  assert.equal(formatSignedEur(-310_500), `${MINUS}€310.5k`);
});

test("formatPp shows a change in percentage points", () => {
  assert.equal(formatPp(0.012), "+1.2 pp");
  assert.equal(formatPp(-0.034), `${MINUS}3.4 pp`);
  assert.equal(formatPp(0), "0.0 pp");
  assert.equal(formatPp(null), "n/a");
});

test("formatMultiple shows turnover and cover ratios", () => {
  assert.equal(formatMultiple(2.5), "2.50×");
  assert.equal(formatMultiple(3.799, 1), "3.8×");
  assert.equal(formatMultiple(-0.4), `${MINUS}0.40×`);
  assert.equal(formatMultiple(undefined), "n/a");
});

test("short forms share one scale for euros and counts", () => {
  assert.equal(formatEur(999), "€999");
  assert.equal(formatEur(1000), "€1.0k");
  assert.equal(formatCount(821_584_062), "821.6M");
  assert.equal(formatInteger(-1234567.4), `${MINUS}1,234,567`);
});

test("toneClass colours by sign, reversed when higher is worse", () => {
  assert.equal(toneClass(0.1), "pos");
  assert.equal(toneClass(-0.1), "neg");
  assert.equal(toneClass(0.1, false), "neg");
  assert.equal(toneClass(0), "");
  assert.equal(toneClass(null), "");
});
