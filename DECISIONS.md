# Decision log

Every non-trivial choice made while building this project, and who made it.
"Claude" means the choice was made by the AI coding assistant (Claude Code) and is open for review by Jan Grgur Glivar.

| Date | Decision | Decided by | Why |
|---|---|---|---|
| 2026-11-23 | Used a seeded PRNG (mulberry32, seed in `assumptions.json`) for all randomness in the generator | Claude | Same inputs always produce the same `traffic.json`, so numbers in the dashboard, README and memo are reproducible |
| 2026-11-23 | `assumptions.json` holds every number the generator uses: assumptions (with id, value, unit, source, status, note), plus customer list and generator parameters | Claude | One file to review and source; the generator only contains combination logic |
| 2026-11-23 | Initial placeholder values were produced once from a few base tables (cost per route, markup per channel, category price multipliers); `assumptions.json` is now edited directly | Claude | Hand-writing ~400 entries is error-prone; the base tables are not kept, so there is a single source of truth |
| 2026-11-23 | Customer list price is a single list price per country × channel × category; the customer discount is applied in the calculation, not stored in traffic rows | Claude | Matches the spec formula `revenue = volume × price × (1 − discount)` and lets scenarios change prices and discounts independently |
| 2026-11-23 | Discount tier is fixed per customer, set from its base monthly volume (tiers 0 / 5 / 10 / 20 %, thresholds 0.5M / 2M / 8M messages per month) | Claude | Simple and explainable; recalculating tiers each month would add noise without changing the story |
| 2026-11-23 | Customer volumes follow a power law by rank (top customer 25M msgs/month, exponent 1.3) | Claude | Produces the long tail asked for: the top 3 customers carry roughly 60 % of volume |
| 2026-11-23 | Customers use a subset of countries and channels depending on size tier (Enterprise: 6–9 countries, all channels; SMB: 1–2 countries, mostly SMS) | Claude | Realistic and keeps `traffic.json` under 2 MB (about 8,300 rows, 1.6 MB) |
| 2026-11-23 | Voice carries authentication traffic only (voice OTP); other channels follow the customer industry's category mix | Claude | Voice is used in practice for OTP fallback, not marketing |
| 2026-11-23 | Category mix depends on customer industry (e.g. banking is OTP-heavy, retail is marketing-heavy) | Claude | Makes customers differ in a way an analyst can explain; added as an assumption group beyond the spec's list |
| 2026-11-23 | WhatsApp fees, and SMS/Voice costs in the US and Mexico, are denominated in USD; everything else in EUR | Claude | About a third of delivery cost is in USD, so the EUR/USD scenario has a visible effect |
| 2026-11-23 | Target gross margin range 20–26 %; default markups raised so the generated baseline is about 22 % (was 18–28 % and about 19 %) | Frost (range), Claude (markup tuning) | Listed European messaging-heavy CPaaS companies reported roughly 22–24 % gross margin in 2024; the model also deducts a platform cost per message, so low-20s is a fair baseline. Sources still to be verified and recorded in `assumptions.json` |
| 2026-11-23 | Built-in problems for the analysis: four loss-making routes, one top-2 customer at single-digit margin after its 20 % discount, thin margins on high-volume competitive SMS routes | Claude | Required by the spec so the dashboard has something real to discover; not labelled anywhere in the UI |
| 2026-11-23 | `traffic.json` is written one row per line | Claude | Compact enough, and git diffs stay readable when assumptions change |
| 2026-11-23 | Added `tests/generator.test.mjs` (not in the original structure) for determinism and data integrity | Claude | M1 requires determinism tests; `tests/calc.test.mjs` is reserved for calculations (M2) |
| 2026-11-23 | `.gitattributes` forces LF line endings | Claude | The test that compares committed `traffic.json` with a fresh generation is byte-exact and would fail on Windows checkouts with CRLF |
