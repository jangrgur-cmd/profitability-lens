# Changelog

All notable changes to Profitability Lens. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Each version is one phase of the work plan in [`CLAUDE.md`](CLAUDE.md) §7. The messaging case study's history before it joined this repository is in its own git history and [`modules/messaging/DECISIONS.md`](modules/messaging/DECISIONS.md).

## [Unreleased]

### Added

- Other operating income (*ostali poslovni prihodi*) as an input: it counts in EBITDA and EBIT but not in revenue.
- Open an Excel (.xlsx) or CSV file in both paste dialogs, or drop it anywhere on the page, and download an Excel template for the Company rating and for segments. No library: the workbook is read and written in the browser.
- "Fix the company" on the Glossary & practice page: five challenges that ask for a goal grade with a limited set of What if… levers (one fixes prices at −3 % for a price war), with a lesson once solved.
- "How to reach grade X" on the Company rating: the smallest change of each What if… lever that reaches the next grade, with "Try it" to set it, and a table of the points each ratio earns and misses.

## [1.0.0] – 2026-11-25

Phase 5: documentation and project setup.

### Added

- README with screenshots, the rating method in short, assumptions, limitations and how the project was built with Claude Code.
- GitHub Actions workflow (`.github/workflows/ci.yml`): runs `node --test` on every push and pull request, and deploys the site to GitHub Pages from `main` once the tests pass.
- Issue templates for bugs, feature ideas, benchmark and definition questions, and translation fixes.
- `scripts/screenshots.mjs`, which retakes the README screenshots with a local Edge or Chrome.
- This changelog.

## [0.5.0] – 2026-11-25

Phase 4: learning materials.

### Added

- Glossary & practice page (`learn.html`): "Guess the grade" with five fictional companies, one per grade A–E, each rated live by the engine, and a searchable glossary of 54 terms in English and Croatian with formulas.
- One-page formula cheat sheet (`cheatsheet.html`), generated from the engine's weights, score points, grades, flag limits and thresholds. It prints on one A4 page or downloads as text.
- "Open this case in Company rating" (`index.html#case=<id>`), which asks before replacing saved figures.

### Fixed

- Results of a full sweep of the interface in both languages: country names in the wrong language, category phrases in the overview sentence, "1 lines skipped", glossary search for "D&A", "See also" links to the term already open, and fictional names kept after pasting real figures.

## [0.4.0] – 2026-11-25

Phase 3: more years, what-if, peers, paste import and general segments.

### Added

- Up to five financial years, with year-on-year changes and sparklines. Export JSON format version 2; version 1 files still import.
- "What if…" levers (sales volume, prices, unit cost of goods, operating expenses) that re-rate the latest year live.
- Peer comparison with up to three companies on the same industry benchmarks.
- "Paste from Excel": statement lines matched in English and Croatian (GFI-POD wording), with a preview where each line can be corrected.
- General segment profitability page (`segments.html`): contribution margin and segment profit for any pasted table, a ranked profit chart, the whale curve and the top-20 % profit share, with two fictional examples.

### Changed

- The whale curve, top-20 % share and CSV export moved to `src/shared/` and are used by both segment pages. The messaging golden tests pass unchanged.

## [0.3.0] – 2026-11-25

Phase 2: the Company rating page.

### Added

- Company rating page (`index.html`): input form, grade ring, key figures, red flags, the eight ratios with band pills and benchmark tracks, the DuPont breakdown and "How the rating works".
- Three fictional example companies, JSON export and import, copy summary, and a print stylesheet.
- Shared header and design for every page, with light and dark mode.
- Learn mode: the math behind each ratio with the user's numbers, field help, plain-language DuPont sentences, and how segment margins add up to the company margin.
- English and Croatian interface, with number formats that follow the language.
- "Send to Company rating" from the messaging case study, and a link back from the gross-margin row.

## [0.2.0] – 2026-11-25

Phase 1: the rating engine.

### Added

- Rating engine in `src/rating/`: input schema, derived statement, eight ratios, DuPont, rule-of-thumb thresholds for seven industries, score, grade, red flags and summary.
- Unit tests, including the hand-checkable case from `CLAUDE.md` §4.5.
- `docs/methodology.md`.

### Changed

- Formatting, margin and band calculations, and number parsing moved to `src/shared/`. The messaging module imports them; its golden tests pass without regenerating the expected values.

## [0.1.0] – 2026-11-24

Phase 0: the messaging case study joins the project.

### Added

- Project rules (`CLAUDE.md`), MIT licence and decision log.
- The Messaging Profitability Dashboard in `modules/messaging/`, brought in with its full git history.
- Golden tests that lock every number the dashboard shows.
- `docs/assumptions.md`, generated from the dashboard's 209 assumptions, with a test that fails when it is out of date.

