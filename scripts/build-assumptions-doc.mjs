// Rewrites docs/assumptions.md. Run after editing the messaging assumptions:
// node scripts/build-assumptions-doc.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { renderAssumptionsDoc } from "./assumptions-doc.mjs";

const source = new URL("../modules/messaging/data/assumptions.json", import.meta.url);
const target = new URL("../docs/assumptions.md", import.meta.url);
writeFileSync(target, renderAssumptionsDoc(JSON.parse(readFileSync(source, "utf8"))));
console.log("Wrote docs/assumptions.md");
