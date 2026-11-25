// Tests for src/shared/handoff.js: figures sent from the segment module.

import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeHandoff, decodeHandoff, HANDOFF_SOURCES } from "../src/shared/handoff.js";

test("encode rounds to whole euros and decode reads it back", () => {
  const hash = encodeHandoff("messaging", { revenue: 112248231.6, cogs: 89186420.2 });
  assert.equal(hash, "#from=messaging&revenue=112248232&cogs=89186420");
  const decoded = decodeHandoff(hash);
  assert.equal(decoded.source, HANDOFF_SOURCES.messaging);
  assert.deepEqual(decoded.values, { revenue: 112248232, cogs: 89186420 });
  assert.equal(decoded.source.industryId, "telecom");
});

test("encode refuses unknown sources and missing numbers", () => {
  assert.throws(() => encodeHandoff("crm", { revenue: 1, cogs: 0 }), /Unknown hand-off source/);
  assert.throws(() => encodeHandoff("messaging", { revenue: 1 }), /cogs/);
});

test("decode ignores anything that is not a complete, sensible hand-off", () => {
  for (const hash of [
    "", "#", "#tab=routes", "#from=crm&revenue=1&cogs=0",
    "#from=messaging&revenue=1000", "#from=messaging&revenue=abc&cogs=1",
    "#from=messaging&revenue=0&cogs=0", "#from=messaging&revenue=1000&cogs=-5",
    "#from=messaging&revenue=1000&cogs=",
  ]) {
    assert.equal(decodeHandoff(hash), null, hash);
  }
  assert.equal(decodeHandoff(undefined), null);
  assert.deepEqual(decodeHandoff("from=messaging&revenue=10&cogs=0").values, { revenue: 10, cogs: 0 }, "works without the #");
});

test("the general segment page hands off its totals with the General industry and links back", () => {
  const hash = encodeHandoff("segments", { revenue: 2_400_000, cogs: 1_450_000 });
  assert.equal(hash, "#from=segments&revenue=2400000&cogs=1450000");
  const { source, values } = decodeHandoff(hash);
  assert.deepEqual(values, { revenue: 2_400_000, cogs: 1_450_000 });
  assert.equal(source.industryId, "general");
  assert.equal(source.backLink, "segments.html");
  assert.ok(source.note && source.returnLabel && source.backLabel && source.companyName);
});
