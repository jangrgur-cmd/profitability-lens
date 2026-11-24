// Rewrites tests/golden/expected.json from the current code and data.
// Run it only when a change to the dashboard's numbers is intended, and say
// why in the commit message: node scripts/update-golden.mjs

import { writeFileSync } from "node:fs";
import { loadRealData, takeSnapshot } from "../tests/golden/snapshot.mjs";

const target = new URL("../tests/golden/expected.json", import.meta.url);
writeFileSync(target, JSON.stringify(takeSnapshot(loadRealData()), null, 1) + "\n");
console.log(`Wrote ${target.pathname}`);
