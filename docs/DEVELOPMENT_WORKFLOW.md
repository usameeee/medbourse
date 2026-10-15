# Development Workflow

## Session startup

1. Follow `AGENTS.md` session-start protocol.
2. Pull/fetch when remote exists and credentials allow.
3. Never discard local changes without explicit user approval.

## Local setup

```bash
npm install
cp .env.example .env   # fill placeholders locally; never commit .env
npm run dev            # API + web concurrently
```

Gmail SMTP: see `docs/EMAIL.md`. Use a Google **App Password** in `SMTP_PASS`, not the Gmail login password.

MongoDB: `MONGODB_URI` in `.env`. Probe without printing the URI:

```bash
npm run db:check -w @medbourse/api
```

Health: `GET /api/v1/health` includes `"database": "connected"` when Atlas is reachable.

## Implementation loop

1. Pick task ID from `PROJECT_STATE.md` / `TASKS.md`.
2. Implement smallest vertical slice meeting acceptance criteria.
3. Run relevant checks (`npm run lint`, `npm test`, `npm run build`).
4. Update DESIGN_SYSTEM or ARCHITECTURE_DECISIONS if decisions changed.
5. Mark task status; update `PROJECT_STATE.md` and `CHANGELOG.md`.

## Handoff

Document: completed task IDs, files touched, commands run, pass/fail results, next task ID, blockers.

## Git

- Commit at stable milestones when user authorizes.
- No force-push to main; no secrets in commits.
- Prefer feature branches when multiple agents collaborate.

## Cross-IDE

Unsaved buffers are not synced—commit/push is the handoff mechanism.
