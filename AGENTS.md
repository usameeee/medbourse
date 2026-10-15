# MEDBOURSE — Agent Development Contract

All AI assistants, IDEs, and human contributors must treat this repository as the single source of truth. Chat history is not project memory.

## Session start (mandatory)

Before modifying code:

1. Read `AGENTS.md` (this file).
2. Read `PROJECT_CONTEXT.md` and `PROJECT_STATE.md`.
3. Read relevant sections of `TASKS.md`, `ROADMAP.md`, and `DESIGN_SYSTEM.md`.
4. Read applicable entries in `ARCHITECTURE_DECISIONS.md` and `docs/SECURITY.md`.
5. Inspect git status, current branch, recent commits, and local modifications.
6. Verify the checkpoint in `PROJECT_STATE.md` against the codebase and last test runs.
7. Continue with the highest-priority unfinished task in `TASKS.md`.

Provide a concise operational summary when starting a substantial session (phase, current task, next task, blockers, verified test results).

## Non-negotiables

- **Audit first** — Never assume the repo is empty or complete; inspect before rebuilding.
- **Protect user work** — No destructive git operations, database wipes, or config overwrites without explicit authorization.
- **Backend authorization** — Never rely on hidden UI alone for permissions.
- **Financial correctness** — Use exact decimal money types; never mix currencies in totals; preserve quotation snapshots.
- **Sensitive documents** — Private storage, signed URLs, server-side access checks; no secrets in client bundles or logs.
- **i18n** — Arabic, French, English, Turkish; real RTL with logical CSS properties.
- **Design system** — Follow `DESIGN_SYSTEM.md`; avoid generic AI-dashboard aesthetics.
- **Definition of done** — A task is complete only when acceptance criteria, verification, and doc updates are done (see master project rules §23).

## Repository layout

```
apps/web      — React (TypeScript) customer, staff, and admin UI
apps/api      — Express (TypeScript) REST API /api/v1
packages/shared — Shared types, constants, validation schemas
docs/         — Workflow, security, API documentation
.cursor/rules — Cursor-specific rule adapters (reference this file)
```

## Tool-specific rules

- Cursor: `.cursor/rules/medbourse-*.mdc`
- Other tools: read this file and `PROJECT_STATE.md` explicitly.

## Handoff

At the end of meaningful work, update `PROJECT_STATE.md`, `TASKS.md`, and `CHANGELOG.md` as appropriate. Report what was verified, not assumed.
