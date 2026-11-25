# CLAUDE.md: Profitability Lens

This file holds the project rules. Read it fully before writing code, and re-read the relevant section before each phase.

## 1. What this project is

A free, open-source profitability analysis web app with two connected modules:

1. **Company rating:** the user enters a few lines from an income statement and balance sheet, clicks one button and gets an A–E grade (0–100 score), eight profitability ratios (each with value, benchmark band and explanation), a DuPont breakdown of ROE, automatic red flags and a plain-language summary.
2. **Segment profitability:** where a business makes and loses money, by customer, product, channel or route. It starts from the Messaging Profitability Dashboard (a CPaaS case study) in `modules/messaging/`, and is later generalised to any user-pasted segment table.

Purpose: faster business analysis, and a learning tool for students, small business owners and junior analysts. It is also Frost's portfolio project for business-analyst / profitability-analyst internships, so **code quality, README and documentation matter as much as features.**

## 2. Hard constraints (never break these)

- **100% free to run and host.** No API keys, no LLM/AI API calls, no paid services, no backend, no database.
- **Static site** that runs fully in the browser and deploys to GitHub Pages.
- **User data never leaves the browser.** Persist only in `localStorage`, always wrapped in `try/catch`.
- **Vanilla HTML + CSS + JavaScript (ES modules).** No framework, no build step to run. Dev tooling only if free and optional (e.g. `node --test`).
- **No external network calls, telemetry or CDNs.** Fonts and icons are local or system. Chart.js is served from `lib/`. `fetch()` is allowed only for files in this repo.
- **MIT licence.**
- **Fictional data is labelled fictional.** Example companies, customers and simulated traffic say so in the UI. Benchmarks are never presented as official statistics.
- **Two UI languages, English and Croatian** (EN/HR switch in the shared header; default from the browser language, remembered in localStorage). Code, comments and docs stay in English. **All UI text lives in `src/shared/lang/en.js` and `hr.js`; no hard-coded text in the UI** (see §8).

## 3. Architecture

One repo, one site, shared navigation between modules. All calculation code is pure (no DOM) so it can be unit-tested in Node. **No formula is written twice.**

```
/
├── index.html                  # landing / Company rating (Phase 2)
├── src/
│   ├── shared/                 # used by both modules
│   │   ├── parse.js            # parse typed amounts (HR/EN formats)
│   │   ├── format.js           # all number/percent/currency display formatting
│   │   ├── margin.js           # margin, safe division, band calculations
│   │   ├── i18n.js             # t(key, params), language detection and switch
│   │   ├── lang/en.js, hr.js   # every UI text, same keys in both languages
│   │   └── ...                 # status colours/styles, nav, Learn mode state
│   └── rating/
│       ├── fields.js           # input schema: drives form, validation, JSON import/export
│       ├── ratios.js           # derived statement, ratio definitions, DuPont
│       ├── benchmarks.js       # industry thresholds (rule-of-thumb, labelled as such)
│       ├── rating.js           # rate(input, industryId) → score, grade, ratios, flags, summary
│       ├── samples.js          # 3 fictional example companies
│       └── app.js              # UI only
├── modules/messaging/          # integrated messaging dashboard (git history kept), refactored to use src/shared/
├── tests/                      # node --test unit tests (rating + shared)
├── docs/assumptions.md         # every assumption of the messaging case study, with source
├── lib/                        # vendored third-party files (Chart.js)
├── DECISIONS.md                # decision log: what was decided, by whom, why
├── CHANGELOG.md                # Phase 5
└── LICENSE
```

Settled in Phase 1: `src/shared/` holds `parse.js`, `format.js` and `margin.js`; UI helpers (status styles, nav, Learn mode) join it in Phase 2. The rating method and definition choices are in `docs/methodology.md`.

Settled in Phase 2: `src/shared/` also holds `theme.css` (tokens for light and dark via `light-dark()`, header, buttons, pills, Learn mode rule), `site-header.js` (shared header), `prefs.js` (localStorage: theme, Learn mode, saved form), `status.js` (band and severity pills), `dom.js` (DOM builder, no HTML strings), `track.js` (benchmark track geometry) and `handoff.js` (segment → rating hand-off in the URL hash). `src/rating/report.js` holds the words around a rating (show the math, DuPont sentences, text summary); `src/rating/rating.css` the page styles.

Languages (added during Phase 2): `src/shared/i18n.js` with `src/shared/lang/en.js` and `hr.js`. Engine texts (field labels, ratio names, flags, summaries) are getters that read the current language, so the pure modules stay testable in either language (`useLanguage("hr")` in tests). Croatian names for the messaging data (countries, months, customers…) are in the `data` section of `hr.js`; English names come from the data files. Assumption labels, notes and sources stay in English. The financial term list is `docs/terminology.md`.

### 3.1 Number parsing (`src/shared/parse.js`)

Accepts `"1.234.567,89"` (HR), `"1,234,567.89"` (EN), `"1 234 567"`, `"(12.500)"` = negative, and strips currency symbols. Rule for a lone separator: **one separator followed by exactly 3 digits = thousands separator, otherwise decimal.** When both `.` and `,` appear, the last one is the decimal separator.

## 4. Company rating

### 4.1 Inputs (`*` = required)

Income statement (current year): revenue\*, cost of goods sold, operating expenses excl. D&A, depreciation & amortisation, other financial income net (may be negative), interest expense, income tax.
Balance sheet (year end): total assets\*, total equity\* (may be negative), current liabilities, interest-bearing debt, cash.
Prior year (optional): total assets, total equity → used for averages.

Each field has a short help text including the Croatian term (e.g. "kratkoročne obveze"). If COGS is blank, gross margin is "missing input" and all costs are treated as operating expenses (Croatian statements classify costs by nature, so many users won't have COGS).

### 4.2 Derived statement

```
GrossProfit = Revenue − COGS
EBITDA      = GrossProfit − Opex
EBIT        = EBITDA − D&A
EBT         = EBIT + OtherIncome − Interest
NetIncome   = EBT − Tax
TaxRate     = Tax / EBT if EBT > 0 (clamped 0–50%), else 0
NOPAT       = EBIT × (1 − TaxRate)
AvgAssets   = (Assets_end + Assets_prior) / 2 if prior given, else Assets_end   (same for AvgEquity)
CapitalEmployed = TotalAssets − CurrentLiabilities
InvestedCapital = Debt + Equity − Cash
```

### 4.3 Ratios and weights

| Ratio | Formula | Weight |
|---|---|---|
| Gross margin | GrossProfit ÷ Revenue (needs COGS) | 10 |
| EBITDA margin | EBITDA ÷ Revenue | 10 |
| Operating margin | EBIT ÷ Revenue | 15 |
| Net margin | NetIncome ÷ Revenue | 15 |
| ROA | NetIncome ÷ AvgAssets | 15 |
| ROE | NetIncome ÷ AvgEquity (n/m if equity ≤ 0) | 15 |
| ROCE | EBIT ÷ CapitalEmployed (needs current liabilities; n/m if ≤ 0) | 10 |
| ROIC | NOPAT ÷ InvestedCapital (needs debt; n/m if ≤ 0) | 10 |

**A ratio is never faked.** Its status is `ok`, `missing` (naming the missing field) or `not_meaningful` (with the reason).

DuPont: ROE = Net margin × Asset turnover (Revenue ÷ AvgAssets) × Equity multiplier (AvgAssets ÷ AvgEquity).

### 4.4 Rating method

- Each industry has four thresholds per ratio, in %: `[poor, fair, good, excellent]`, strictly ascending.
- Score per ratio, piecewise linear: `floor = poor − (fair − poor)` → 0, poor → 20, fair → 50, good → 75, excellent → 100; clamped 0–100.
- Band: ≥ excellent Excellent, ≥ good Good, ≥ fair Fair, ≥ poor Weak, else Poor.
- Overall = weighted average of available ratios (weights renormalised); show coverage ("7 of 8 ratios").
- Grade: A ≥ 80 Excellent, B ≥ 65 Strong, C ≥ 50 Adequate, D ≥ 35 Weak, E < 35 Poor.
- Industries: General, Retail & wholesale, Manufacturing, Software & SaaS, Telecom & CPaaS/messaging, Professional services, Tourism & hospitality. Thresholds start as **rule-of-thumb values, labelled as such in code and UI**. Roadmap: calibrate against published sector data (e.g. Damodaran's industry margin/return datasets), recording source and year.
- Flags: net loss (critical); equity ≤ 0 (critical); positive gross margin but negative EBIT (serious); interest cover EBIT ÷ interest < 1.5× (serious); equity multiplier > 3 ("ROE inflated by leverage"); D&A > 50% of EBITDA; low coverage (< 60% of weight); no prior-year data (info).

### 4.5 Hand-checkable test case (must stay in the tests)

Revenue 1000, COGS 600, opex 200, D&A 50, interest 30, tax 24, assets 1200 (prior 800), equity 500 (prior 300), current liabilities 200, debt 400, cash 100 →
gross 40%, EBITDA 20%, EBIT 15%, net 9.6%, ROA 9.6%, ROE 24%, ROCE 15%, ROIC 15%; DuPont 9.6% × 1.00 × 2.50 = 24%.

## 5. Segment profitability (`modules/messaging/`)

The Messaging Profitability Dashboard, brought in with its git history (from `github.com/jangrgur-cmd/messaging-profitability`). Its own rules (data model, generator, assumption statuses, "never invent a source") remain in force and are recorded in its README and DECISIONS.md. In short:

- 5 markets (HR, DE, FR, GB, US), 4 channels (SMS, WhatsApp, Viber, Voice), 3 categories, 36 illustrative customer archetypes, 12-month model year.
- `data/assumptions.json` holds all 209 assumptions with `sourced` / `estimated` / `placeholder` status; `data/traffic.json` is generated deterministically from it by `scripts/generate-data.mjs`.
- Gross profit = revenue − delivery cost − platform cost; discounts never apply to pass-through fees (Meta, US carrier fees).
- **Everything it does today must keep working.** Characterisation tests lock its current numbers before any refactor.

## 6. UI (one design across both modules)

- Shared header with module navigation, typography, colours and the Learn mode toggle.
- Company rating: input form left (sticky "Rate profitability" button), results right; stacks on mobile.
- Results: grade ring + score + one-sentence summary; key-figure tiles (revenue, gross profit, EBITDA, EBIT, net income, interest cover); ratio rows grouped Margins / Returns, each with value, band pill (icon + label, **never colour alone**) and a horizontal benchmark track with marker and threshold ticks; DuPont strip; flags; "How the rating works" with the weights table.
- Actions: load example (3 chips), clear, copy text summary, export/import JSON, print/save PDF (print stylesheet).
- Accessible (labels, aria, keyboard, contrast), light + dark mode, tabular numbers, clean financial look.

### 6.1 Learn mode (shared by both modules)

When on: each ratio expands to "Show the math" (formula → formula with the user's numbers → result); "What it tells you" and "How to improve it"; field help visible; DuPont plain-language sentence ("each €1 of sales leaves €0.08 of profit…"); in the segment module, how segment margins add up to company gross margin and what each scenario changes.

### 6.2 Connecting the modules

- "Send to Company rating" in the segment module: traffic revenue → revenue, delivery costs → COGS, industry preset "Telecom & CPaaS / messaging"; the user adds balance-sheet figures.
- When data came from the segment module, the gross-margin row shows "See which routes and customers drive this", linking back.

## 7. Work plan (commit after each phase)

- **Phase 0** – Integrate the messaging dashboard: inspect and report, propose plan, bring it in with history, characterisation tests before refactoring, replace any external call with static data, document assumptions (`docs/assumptions.md` + UI table).
- **Phase 1** – Rating engine + `src/shared/` + tests (parse, format, fields, ratios, benchmarks, rating). Move shared logic out of the messaging module and re-run its tests.
- **Phase 2** – Company rating UI, Learn mode, examples, export/import/print, shared navigation and design, two-way module connection.
- **Phase 3** – Multi-year (2–5 years, YoY, sparklines); what-if sliders with live grade; peer comparison (up to 3); paste import from Excel/CSV with EN/HR label mapping; generalised segment module (user table, contribution margin, ranked chart, top-20% profit share).
- **Phase 4** – Glossary, 5 practice cases with "guess the grade" quiz, downloadable one-page formula cheat sheet.
- **Phase 5** – README (screenshots/GIF, demo link, method, assumptions, limitations, "how I built it with Claude Code"), GitHub Actions (tests + Pages deploy), issue templates, CHANGELOG. **Ask before creating the repo or pushing anything.**

## 8. Rules for Claude Code

- Calculation code is pure and fully tested. Run `node --test` after every change to an engine.
- Small, readable modules; JSDoc on public functions; no dead code.
- **Every new piece of UI text goes into both language files**, `src/shared/lang/en.js` and `hr.js`, under the same key and with the same `{placeholders}` (plurals: `one/other` in English, `one/few/other` in Croatian), and is read with `t("key")` or a `data-i18n` attribute. No hard-coded text in HTML or JS. Use standard Croatian accounting terminology and add any new financial term to `docs/terminology.md`. Numbers always go through `src/shared/format.js`, which follows the language. `tests/i18n.test.mjs` fails on a missing key, a placeholder mismatch or a key used in code but absent from either file.
- Before calling a phase done: open the page in a browser and check desktop + mobile width, light + dark.
- Never add an API key, telemetry or external network call.
- If a financial definition is ambiguous, pick the textbook one, document it in the methodology section and in DECISIONS.md, and tell Frost.
- Log every non-trivial choice in `DECISIONS.md` (date, decision, decided by, why), as in the messaging module.
- At the end of each phase: summarise what changed, what is tested, what is next. Commit only when asked or at the end of an approved phase; never push without asking.

## 9. Commands

```
node --test                                        # all tests (root and modules/messaging/tests)
node modules/messaging/scripts/generate-data.mjs   # regenerate traffic.json after editing assumptions
node scripts/build-assumptions-doc.mjs             # regenerate docs/assumptions.md after editing assumptions
node modules/messaging/scripts/update-golden.mjs   # ONLY when a change to the dashboard's numbers is intended
npx serve .                                        # or: python -m http.server — then open the printed URL
```

`modules/messaging/tests/golden.test.mjs` locks every number the messaging dashboard shows (totals, groupings, presets, a scenario using every step, data checks, formatting) against `tests/golden/expected.json`. A refactor must leave it green without regenerating the expected values.
