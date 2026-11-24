# Decision log

Every non-trivial choice made while building Profitability Lens, and who made it.
"Claude" means the choice was made by the AI coding assistant (Claude Code) and is open for review by Jan Grgur Glivar.
Decisions about the messaging case study before it joined this repo are in [`modules/messaging/DECISIONS.md`](modules/messaging/DECISIONS.md).

| Date | Decision | Decided by | Why |
|---|---|---|---|
| 2026-11-24 | Default branch is `main` | Jan | Matches the messaging repo and GitHub's default |
| 2026-11-24 | `CLAUDE.md` (project rules for Claude Code) is tracked in git | Jan | Documents how the project was built with Claude Code |
| 2026-11-24 | The messaging dashboard is brought in with `git subtree add` (full history, not squashed) into `modules/messaging/` | Jan (keep history), Claude (method) | Keeps its 23 commits and their authorship; no copy-paste |
