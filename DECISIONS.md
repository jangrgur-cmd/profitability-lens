# Decision log

Every non-trivial choice made while building Profitability Lens, and who made it.
"Claude" means the choice was made by the AI coding assistant (Claude Code) and is open for review by Jan Grgur Glivar.
Decisions about the messaging case study before it joined this repo are in [`modules/messaging/DECISIONS.md`](modules/messaging/DECISIONS.md).

| Date | Decision | Decided by | Why |
|---|---|---|---|
| 2026-11-24 | Default branch is `main` | Jan | Matches the messaging repo and GitHub's default |
| 2026-11-24 | `CLAUDE.md` (project rules for Claude Code) is tracked in git | Jan | Documents how the project was built with Claude Code |
| 2026-11-24 | The messaging dashboard is brought in with `git subtree add` (full history, not squashed) into `modules/messaging/` | Jan (keep history), Claude (method) | Keeps its 23 commits and their authorship; no copy-paste |
| 2026-11-24 | Characterisation ("golden") tests snapshot every number the messaging dashboard shows (totals by country, channel, category, month, route and customer; whale curve; a filtered selection; the three presets; a scenario that moves every lever; data checks; number formatting) into `modules/messaging/tests/golden/expected.json` | Jan (tests before refactoring), Claude (scope) | Proves the Phase 1 refactor into `src/shared/` changes nothing a user can see |
| 2026-11-24 | Golden comparison uses a relative tolerance of 1e-12 | Claude | Allows floating-point differences when a refactor sums in a different order, but one extra message (≈ €0.03 on €112M) still fails |
| 2026-11-24 | `docs/assumptions.md` is generated from `assumptions.json` by `scripts/build-assumptions-doc.mjs`, and a test fails if it is out of date | Claude | One source of truth: the document can never disagree with the dashboard |
