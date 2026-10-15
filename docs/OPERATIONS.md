# MEDBOURSE — Operations & Backup Notes

Operational runbook for a deployed MEDBOURSE instance. Pair this with `docs/DEPLOYMENT.md` (build/run and environment) and `docs/SECURITY.md` (threat model).

## What to back up

| Asset | Where | Backup approach |
|-------|-------|-----------------|
| MongoDB database (`medbourse`) | MongoDB Atlas | Atlas automated cloud backups + on-demand snapshots (below) |
| Local sensitive files | `<repo>/.data/private-docs` **only when `STORAGE_DRIVER=local`** | Filesystem snapshot / object-store sync |
| Cloudinary assets | Cloudinary account | Cloudinary's own durability — no local backup |
| Secrets | your secret manager / host env | Stored separately from code; never in git |

With `STORAGE_DRIVER=memory` nothing is persisted — that driver is for tests only and must never be used in production.

## MongoDB Atlas backup & restore

### Backups
- Enable **Cloud Backups** (or the snapshot schedule) on the Atlas cluster and keep a retention window that matches the business requirement.
- Take an **on-demand snapshot** before any risky operation (schema/index change, bulk import, manual data fix).
- Verify restores periodically by restoring into a scratch cluster — an untested backup is not a backup.

### Restore
1. In Atlas, choose the snapshot and **restore** either into a new cluster (preferred) or in place.
2. If restoring in place, stop the API first to avoid writes during the swap.
3. If the restore target has a new SRV string, update `MONGODB_URI` and restart the API.
4. Confirm with `npm run db:check -w @medbourse/api` and `GET /api/v1/health` → `"database": "connected"`.

### Point-in-time recovery
If the cluster supports it, prefer PITR for accidental deletes: restore to just before the incident, then reconcile.

## Local sensitive-file backup (`STORAGE_DRIVER=local`)

- The API writes uploads under `<repo>/.data/private-docs`.
- Snapshot/rsync this directory on the same cadence as the database. A database row and its file must be restored **together** — a document row without its file returns `404` on download.
- Because the files are private, ensure the backup target is encrypted and access-controlled.
- Do not run more than one API instance with the `local` driver: each instance sees only its own `.data` directory.

## Logs & monitoring

- The API logs to stdout/stderr: startup line `[medbourse-api] listening on …`, unhandled errors via `[medbourse-api] unhandled error`, and MongoDB connection failures. Ship stdout/stderr to your platform's log sink.
- **Never** log secrets or sensitive content: connection strings, IBAN (only the tail is stored in audit), storage keys, tokens, and file contents must stay out of logs.
- Errors are shape-controlled: known failures return `AppError` codes, validation returns `VALIDATION_ERROR`, and unexpected errors return `INTERNAL_ERROR` — in `production` the message is generic (no stack traces leak).
- Signals worth alerting on:
  - `GET /api/v1/health` returning `500`/`"database": "disconnected"`.
  - Repeated `500 INTERNAL_ERROR` bursts.
  - Spikes of `401`/`429` on `/api/v1/auth/*` (credential stuffing — auth is limited to 20 req / 15 min / IP).
- Uptime checks: poll `GET /api/v1/health` (unauthenticated, no secrets) from outside the network.

## Audit trail

- Every country-scoped and workflow/security-relevant action writes an `AuditLog` row (case create/stage/close, reassignment, invitations, catalog/pricing/payment changes, evidence review, etc.).
- Super Admin reads it via `GET /api/v1/audit` (filters: action, entity type, actor; newest first; `_id` tiebreaker for equal timestamps).
- Treat `AuditLog` as append-only in normal operations. Do not edit rows to "fix" history — record a correction action instead where the workflow allows it.
- Payment-account audit metadata stores only the **IBAN tail**, never the full number.

## Routine tasks

- **Rotate `JWT_SECRET`**: invalidates all active sessions **and** all outstanding signed document URLs (they expire in 60s anyway). Plan rotation during a low-traffic window; users re-authenticate.
- **Rotate Atlas credentials / Cloudinary keys**: update the secret store, restart the API, and confirm `db:check` + a document upload/download round-trip.
- **Dependency updates**: run `npm run lint`, `npm test`, `npm run build` before deploying; tests use an in-memory MongoDB and never touch production data.

## First-response incident notes

1. **Stay calm, capture first.** Record timestamps, the failing endpoint, and the response (`error.code`). Do not restart-during-diagnosis unless the service is fully down.
2. **Service down / health failing.** Check the API process status, then Atlas connectivity (`db:check`). If Atlas is unreachable, verify network/IP allowlist and Atlas status before changing code.
3. **Suspected data exposure.** Rotate `JWT_SECRET` and the affected credentials immediately, review `AuditLog` for the access window, and follow `docs/SECURITY.md`. Sensitive documents are private by design; signed URLs expire in 60s.
4. **Suspected broad breakage after a change.** Prefer restoring the last known-good release artifact, then investigate off to the side.
5. **Accidental deletion / bad write.** For Atlas, use PITR/snapshot restore into a scratch cluster first, validate, then cut over. For `local` storage, restore the file snapshot alongside the database.
6. **Afterwards.** Write down the timeline, root cause, and the mitigation; add a regression test if the issue was code-level.

## Verification record

Production build is validated with `npm run build` (shared → api → web) and recorded in `CHANGELOG.md` / `PROJECT_STATE.md`. API tests (`npm test`) use `mongodb-memory-server` and the `memory` storage driver, so they are safe to run against a checkout at any time.
