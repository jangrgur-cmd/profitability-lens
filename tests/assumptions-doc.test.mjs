// docs/assumptions.md must match the messaging assumptions it is generated from.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderAssumptionsDoc } from "../scripts/assumptions-doc.mjs";

const file = JSON.parse(readFileSync(new URL("../modules/messaging/data/assumptions.json", import.meta.url), "utf8"));
const doc = readFileSync(new URL("../docs/assumptions.md", import.meta.url), "utf8");

test("docs/assumptions.md is up to date (run node scripts/build-assumptions-doc.mjs)", () => {
  assert.equal(doc, renderAssumptionsDoc(file));
});

test("every assumption and customer appears in the document", () => {
  for (const a of file.assumptions) assert.ok(doc.includes(`\`${a.id}\``), `${a.id} missing`);
  for (const c of file.customers) assert.ok(doc.includes(`| ${c.id} |`), `${c.id} missing`);
});

test("every sourced assumption links to its source", () => {
  for (const a of file.assumptions.filter((x) => x.status === "sourced")) {
    assert.ok(a.source, `${a.id} is sourced but has no source`);
    assert.ok(doc.includes(`](${a.source})`), `${a.id} source link missing`);
  }
});
