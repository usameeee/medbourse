# MEDBOURSE — Task Inventory

Statuses: `[ ]` not started · `[/]` in progress · `[x]` completed & verified · `[!]` blocked · `[?]` decision required

---

## Phase 0 — Audit & continuity

| ID | Status |
|----|--------|
| P0-T01 Repository audit | `[x]` |
| P0-T02 Permanent documentation | `[x]` |
| P0-T03 Git init & .gitignore | `[x]` (no first commit yet) |
| P0-T04 Cursor rule adapters | `[x]` |

## Phase 1 — Architecture & design foundations

| ID | Status |
|----|--------|
| P1-T01 Monorepo scaffold | `[x]` |
| P1-T02 API errors / validation | `[x]` |
| P1-T03 Design tokens | `[x]` |
| P1-T04 i18n + RTL | `[x]` |
| P1-T05 MongoDB connection | `[x]` |
| P1-T06 Auth skeleton | `[x]` |
| P1-T07 Tests & lint baseline | `[x]` |

## Phase 2 — Identity & country operations

| ID | Status |
|----|--------|
| P2-T01 Customer records ≠ User | `[x]` |
| P2-T02 Country assignment + queue | `[x]` |
| P2-T03 Secure invitations | `[x]` |

## Phase 3 — Service catalogs & pricing

### P3-T01 — Cities and providers catalog
- **Priority:** P3 · **Dependencies:** P1-T06
- **Acceptance:** Super Admin CRUD; no invented partnerships
- **Status:** `[x]` Verified 2026-10-14

### P3-T02 — Service offerings
- **Priority:** P3 · **Dependencies:** P3-T01
- **Acceptance:** Offerings tied to providers; no admission/visa/clinical guarantees
- **Status:** `[x]` Verified 2026-10-14 — server disclaimer; `GUARANTEE_LANGUAGE` rejected

### P3-T03 — Pricing rules and currency-safe quotations
- **Priority:** P3 · **Dependencies:** P3-T02
- **Acceptance:** Configurable pricing; exact decimal money; quotation snapshot immutable
- **Status:** `[x]` Verified 2026-10-14 — specificity, ambiguous 409, frozen amount after rule change

### P3-T04 — Payment account configuration
- **Priority:** P3 · **Dependencies:** P3-T03
- **Acceptance:** Configurable payment instructions; no hardcoded bank account
- **Status:** `[x]` Verified 2026-10-14 — country beats global; ambiguous 409; live IBAN after PATCH; staff cannot write

---

## Phase 4 — Customer application & documents

### P4-T01 — Cases (applications)
- **Priority:** P4 · **Dependencies:** P3-T04
- **Acceptance:** Staff can open a case for a customer + offering; customer reads only own cases; server-side RBAC
- **Status:** `[x]` Verified 2026-10-14 — staff create; stranger 403; linked customer GET; quotation mismatch 400

### P4-T02 — Private document upload
- **Priority:** P4 · **Dependencies:** P4-T01
- **Acceptance:** Private storage, signed URLs, server authorization; no secrets in logs
- **Status:** `[x]` Verified 2026-10-14 — memory driver in tests; HMAC 60s URL; unsupported type 400; audit has no filename

### P4-T03 — Payment evidence
- **Priority:** P4 · **Dependencies:** P4-T01, P3-T04
- **Acceptance:** Receipt is evidence for review, not automatic success; `payment:verify:staff`
- **Status:** `[x]` Verified 2026-10-14 — upload stays `submitted`; customer 403 on review; reject requires note; quotation amount unchanged

---

## Phase 5 — Workflow engine

### P5-T01 — Versioned workflow templates
- **Priority:** P5 · **Dependencies:** P4-T01
- **Acceptance:** Admin-configured stage graph; versioned; snapshotted onto the case when used
- **Status:** `[x]` Verified 2026-10-14 — versioned stages; case snapshots v1; template edits do not mutate in-flight cases; super_admin only

### P5-T02 — Stage transitions, prerequisites, and audit
- **Priority:** P5 · **Dependencies:** P5-T01
- **Acceptance:** Staff can advance a case stage; prerequisite stages must be `done`; optional stages may be skipped; every transition writes `AuditLog`; customer sees read-only timeline
- **Status:** `[x]` Verified 2026-10-14 — pending→in_progress→done; prerequisite 409; optional skip ok / required skip 400; invalid transition 400; customer 403; audit written

### P5-T03 — Case timeline view and case close
- **Priority:** P5 · **Dependencies:** P5-T02
- **Acceptance:** Customer and staff can read the case timeline (snapshot stages + statuses); staff can close a case when all non-optional stages are done; audit on close
- **Status:** `[x]` Verified 2026-10-14 — timeline via GET /cases/:id; close requires all non-optional stages done (409 REQUIRED_STAGES_NOT_DONE); already closed 409; customer 403; case.closed audit written

### P6-T01 — Staff/Admin case list with filters and pagination
- **Priority:** P6 · **Dependencies:** P5-T03
- **Acceptance:** Staff list cases scoped to their country/assignment; filter by status, category, customer; paginate; sort by createdAt
- **Status:** `[x]` Verified 2026-10-14 — staff sees only country-assigned/assigned-manager cases; super_admin all; status/category/customerId filters; page/limit (max 100); createdAt desc; out-of-scope customerId returns empty; invalid status/category/customerId 400; single-case read and document access country-scoped

### P6-T02 — Staff case detail view (timeline, documents, payment evidence)
- **Priority:** P6 · **Dependencies:** P6-T01
- **Acceptance:** Staff/admin can view a case detail with workflow timeline, documents list, and payment evidence status; country-scoped access
- **Status:** `[x]` Verified 2026-10-14 — GET /cases/:id returns documents (sorted createdAt desc), quotation (null if none), paymentEvidence list; country-scoped; no quotation → quotation null + paymentEvidence []

### P6-T03 — Super Admin audit log viewer
- **Priority:** P6 · **Dependencies:** P6-T02
- **Acceptance:** Super Admin can list AuditLog entries with filters (action, entityType, actor) and pagination; sorted by createdAt desc
- **Status:** `[x]` Verified 2026-10-14 — GET /audit super_admin only; action/entityType/actorUserId filters; page/limit (max 100); createdAt desc + _id desc tiebreaker; invalid actorUserId or limit>100 → 400; staff/admin/customer → 403

---

Later: P7 messaging · P8 UX · P9 QA · P10 release

### P6-T04a — Staff workspace portal shell + case list
- **Priority:** P6 · **Dependencies:** P6-T03
- **Acceptance:** Role-based portal shell (header, nav, logout) + case list table with status/category filters and pagination; 4-locale i18n; no fake actions
- **Status:** `[x]` Verified 2026-10-14 — PortalShell (role-aware nav: cases for all, customers for staff+, catalog+audit for super_admin); CasesView (status/category filters, pagination, Intl dates); typed API client; StatusBadge; en/tr/fr/ar; unauthenticated → health + sign-in

### P6-T04b — Case detail view (workflow timeline, documents, payment evidence)
- **Priority:** P6 · **Dependencies:** P6-T04a
- **Acceptance:** Staff/admin can open a case detail showing workflow timeline, documents list, quotation, and payment evidence; country-scoped
- **Status:** `[x]` Verified 2026-10-15 — CaseDetailView with header (badges, created date), versioned workflow timeline (stage status dots, optional tags), documents list (kind, size), quotation block (currency amount, offering/category/issued-at, disclaimer), payment evidence list (status badge, review note); back navigation; en/tr/fr/ar

### P6-T04c — Catalog admin (super_admin)
- **Priority:** P6 · **Dependencies:** P6-T04a
- **Acceptance:** Super Admin can manage cities, providers, offerings in the portal
- **Status:** `[x]` Verified 2026-10-15 — `CatalogView` with cities/providers/offerings tabs; inline create/edit forms; active-state pills; provider→city and offering→provider selects; typed API client extended with catalog CRUD; wired to existing RBAC endpoints (audit writes unchanged); en/tr/fr/ar

### P6-T04d — Audit log viewer (super_admin)
- **Priority:** P6 · **Dependencies:** P6-T04a
- **Acceptance:** Super Admin can browse AuditLog entries with filters and pagination in the portal
- **Status:** `[x]` Verified 2026-10-15 — `AuditView` table (when, action, entity type/id, actor) over `GET /audit`; action/entityType/actorUserId filters + pagination; typed client `listAuditLogs`; `System` label for null actor; en/tr/fr/ar

---

## Phase 7 — Communication

### P7-T01 — Case-linked messaging
- **Priority:** P7 · **Dependencies:** P6-T04b
- **Acceptance:** Staff and the linked customer can exchange case-linked messages; outsiders blocked (country/assignment scope); each message writes an audit entry; portal thread with composer; en/tr/fr/ar
- **Status:** `[x]` Verified 2026-10-15 — `Message` model; `GET`/`POST /cases/:id/messages` under `case:message:self` + `canReadCase` scope; stranger 403 / out-of-scope staff 403 / unauthenticated 401 / unknown case 404 / blank body 400; `case.message_created` audit written; `CaseDetailView` message thread (author role, timestamp, own-message highlight) + composer; typed client `listCaseMessages`/`createCaseMessage`

### P7-T02 — In-app notifications
- **Priority:** P7 · **Dependencies:** P7-T01
- **Acceptance:** Recipient-scoped notifications for case events (message posted, stage transitioned, case closed, payment evidence submitted/reviewed); the actor is never notified of their own action; each user reads only their own; mark-read and mark-all-read; portal bell with unread count; en/tr/fr/ar
- **Status:** `[x]` Verified 2026-10-15 — `Notification` model; `GET /notifications` (recipient-scoped, `unreadOnly`, pagination + unread count), `PATCH /notifications/:id/read`, `POST /notifications/read-all` under `notification:read:self`; emissions from message create, workflow stage transition, case close, payment-evidence submit/review (`notifyCaseEvent`; actor always excluded); cross-user read → 404; `NotificationBell` in `PortalShell` (unread badge, dropdown list, mark-read/mark-all); en/tr/fr/ar

### P7-T03 — Document the email dev mode
- **Priority:** P7 · **Dependencies:** P7-T01, P6 (invitations)
- **Acceptance:** `docs/EMAIL.md` states the current outbound-mail contract (intent logged, nothing sent, no delivery claimed), the SMTP env vars, the safety rules (no secrets/tokens/PII in logs), and how real sending would be enabled as a follow-up
- **Status:** `[x]` Verified 2026-10-15 — `docs/EMAIL.md` rewritten as the authoritative dev-mode doc; `devMail.ts` comment/log corrected (`dev mode: not sent`); cross-references aligned (`.env.example`, `docs/API.md`, ADR-008, ADR-011)

---

## Phase 8 — Frontend completion

### P8-T01 — Customers admin surface (staff/admin/super_admin)
- **Priority:** P8 · **Dependencies:** P6-T04a, P2-T01, P2-T03
- **Acceptance:** Staff/admin/super_admin can browse and search customer records with pagination, create a customer record (name/email/phone/country), and issue an invitation from the portal — the invitation token is shown once and not persisted client-side; no fake actions (only wired RBAC endpoints); en/tr/fr/ar with RTL
- **Status:** `[x]` Verified 2026-10-15 — `CustomersView` (search `q` + pagination over `GET /customers`, create via `POST /customers`, per-row invite via `POST /:id/invitations` with the one-time token shown in a dismissible panel, inline email prompt when the record has no email); typed client `createCustomer`/`inviteCustomer`; `PublicInvitation` added to shared; `App` renders it on the customers tab (placeholder removed); only wired RBAC endpoints; en/tr/fr/ar + logical CSS. `npm test` 69 passed; build/lint green.

### P8-T02 — Customer reassignment (admin)
- **Priority:** P8 · **Dependencies:** P8-T01, P2-T02
- **Acceptance:** An admin can list active assignable managers and reassign a customer with a reason; staff/customer callers cannot read the manager directory; the reassign control is only rendered for holders of `assignment:manage:admin`; en/tr/fr/ar with RTL
- **Status:** `[x]` Verified 2026-10-15 — `GET /users/managers` under `assignment:manage:admin` (via `listAssignableManagers`; active staff/admin/super_admin only, no `passwordHash`) → staff/customer 403, anonymous 401; `CustomersView` gains an admin-gated reassign panel (manager select + reason) calling `POST /customers/:id/assignment` and reloading the row; typed client `listManagers`/`reassignCustomer`; when the directory is empty the control is hidden (no fake action); i18n en/tr/fr/ar. New `apps/api/src/users.test.ts` covers access + filtering; `npm test` 71 passed; build/lint green.

### P8-T03 — Public marketing site
- **Priority:** P8 · **Dependencies:** P6-T04a, P3-T01, P3-T02
- **Acceptance:** Unauthenticated visitors see a public site explaining the three service lines (education/medical/tourism) and listing the active offerings published through the public catalog endpoints (provider + city), plus an account/contact block; no fabricated metrics, partners, or contact details (no fake actions); four languages with RTL; the authenticated portal is unchanged
- **Status:** `[x]` Verified 2026-10-15 — `PublicSite` replaces the minimal unauthenticated shell: top bar (brand + anchor nav + language switcher), hero, a three-line services section (education/medical/tourism), and an offerings grid over the public catalog endpoints (`listOfferings`/`listProviders`/`listCities`) showing category badge, summary, requirements, provider · city, and the server-set disclaimer, with loading/error/empty states; a contact/account block precedes the existing `AuthPanel` and the system-status panel moved to a footer. No fabricated metrics, partners, or contact details (only real wired data + the registration/sign-in action). `App.module.css` trimmed to the classes still in use. i18n en/tr/fr/ar + logical CSS; authenticated portal untouched; `npm test` 71 passed; build/lint green.

---

## Phase 9 — QA & security

**Exit (ROADMAP):** Critical test scenarios from master spec executed with recorded results.

### P9-T01 — Critical end-to-end journey (integration)
- **Priority:** P9 · **Dependencies:** P8-T03
- **Acceptance:** A single integration test drives the master-spec golden path through the real API — super_admin configures catalog + pricing + payment account + workflow template + country assignment, staff creates a customer and invites them, the customer self-registers via the invitation, staff issues a quotation (frozen snapshot) and opens a case (workflow version snapshot), the customer uploads a document and payment evidence and messages the staff, the staff reviews the evidence and advances/closes the workflow, and the audit trail records every step
- **Status:** `[x]` Verified 2026-10-15 — `apps/api/src/qa.journey.test.ts` drives the whole path in one test: catalog → pricing rule → payment account → workflow template (3 stages, one optional) → country assignment → customer + invitation → self-registration (account linked to the customer) → quotation with frozen snapshot (offering rename afterwards leaves `snapshot.offeringTitle`/`amount` intact) → case with workflow v1 snapshot (all stages `pending`) → document upload → payment instructions (full IBAN to the owner) → receipt upload (`submitted`, never auto-approved) → staff `payment_evidence.submitted` notification → messaging (staff notified, actor excluded) → premature close 409 `REQUIRED_STAGES_NOT_DONE` → out-of-order stage 409 `PREREQUISITE_NOT_DONE` → stages advanced/optional skipped → receipt approved (re-review 409 `ALREADY_REVIEWED`, customer `payment_evidence.approved` notification) → close 200 → customer final view (1 document, quotation `1250.00`, evidence approved) → audit trail contains `case.created`/`case.workflow_stage_transitioned`/`case.closed`.

### P9-T02 — Security & authorization matrix
- **Priority:** P9 · **Dependencies:** P9-T01
- **Acceptance:** Automated assertions cover the `docs/SECURITY.md` threat model: unauthenticated → 401 on every protected route; wrong-role → 403 per the `@medbourse/shared` permission matrix; cross-customer IDOR (case, documents, messages, quotation, payment instructions/evidence, notifications) blocked; public registration cannot choose a privileged role; receipts are `submitted` not `approved`; audit stores only the IBAN tail; error bodies leak no stack traces
- **Status:** `[x]` Verified 2026-10-15 — `apps/api/src/qa.security.test.ts` (9 tests): anonymous callers get 401 across 12 protected endpoints while `GET /catalog/offerings` stays public (200); customer→staff/admin surfaces 403; staff→admin/super_admin 403; admin→super_admin 403; cross-customer IDOR blocked (Alice probing Bob's case/documents/messages/quotation/payment-instructions/receipt signed-url → 403, and reading Bob's notification → 404) with a positive control (own case 200); public `register` with `role: 'super_admin'` still yields `customer`; receipts remain `submitted`; the audit trail stores only the IBAN tail (`3000`), never the full IBAN; 403 bodies carry no `stack`/`node_modules` frames.

### P9-T03 — Record QA results
- **Priority:** P9 · **Dependencies:** P9-T01, P9-T02
- **Acceptance:** Verified scenarios and any residual risk (e.g. no browser click-test run) are recorded in `PROJECT_STATE.md` and `CHANGELOG.md`
- **Status:** `[x]` Verified 2026-10-15 — results and residual risk recorded in `PROJECT_STATE.md` (Phase 9) and `CHANGELOG.md` (Verification); `npm test` 81 passed (20 files), `npm run build` / `npm run lint` green. Residual risk: `apps/web` was not click-tested in a browser (no browser tool in this session); frontend verified via build/lint and the API contract only.

---

## Phase 10 — Release readiness

**Exit (ROADMAP):** OpenAPI complete; deployment docs; production build green; backup/ops notes.

### P10-T01 — OpenAPI specification
- **Priority:** P10 · **Dependencies:** P9-T03
- **Acceptance:** A machine-readable OpenAPI 3.1 document describes every implemented `/api/v1` endpoint — paths, methods, auth (cookie `mb_access` or `Authorization: Bearer`), request params/bodies, response envelopes, the shared enums and `Public*` schemas, and the `ApiErrorBody` error shape. `docs/API.md` points at it and the spec matches the real routes (no invented endpoints).
- **Status:** `[x]` Verified 2026-10-15 — `docs/openapi.yaml` (OpenAPI 3.1.0) documents **47 paths / 61 operations / 97 schemas** across 16 tags; `cookieAuth` (apiKey/cookie `mb_access`) + `bearerAuth` (JWT) with public endpoints set to `security: []`; request/response schemas taken from `@medbourse/shared` `Public*` types and the route handlers. Parses cleanly (`yaml.safe_load` → `3.1.0`, 47 paths, 97 schemas); automated route-vs-spec comparison found no missing and no invented operations. `docs/API.md` line 5 now points to the spec.

### P10-T02 — Deployment guide
- **Priority:** P10 · **Dependencies:** P10-T01
- **Acceptance:** `docs/DEPLOYMENT.md` documents prerequisites, the full environment-variable reference, the API build/run and web build/serve steps, MongoDB Atlas connectivity, the storage driver choice (local vs Cloudinary private folders), CORS/cookie/HTTPS requirements, and the health check. No secrets in the document.
- **Status:** `[x]` Verified 2026-10-15 — `docs/DEPLOYMENT.md` covers topology, prerequisites (Node ≥20), the full env-var table (with the `JWT_SECRET` signing note and build-time `VITE_API_BASE_URL` caveat), build/run for API (`npm run start -w @medbourse/api`) and web (static `apps/web/dist`), MongoDB Atlas connectivity + `db:check` + idempotent seed, the storage-driver matrix (`memory`/`local`/`cloudinary`, incl. the 60s signed-URL and `SIGNED_URL_ONLY` behavior), CORS/cookie/HTTPS guidance (`SameSite=Lax` ⇒ serve web+API on the same registrable domain), and a post-deploy smoke test. No secrets included (placeholders only).

### P10-T03 — Operations & backup notes + production build
- **Priority:** P10 · **Dependencies:** P10-T02
- **Acceptance:** `docs/OPERATIONS.md` covers MongoDB Atlas backup/restore, log/monitoring expectations, and first-response incident notes; the production build (`npm run build`) is green and the result is recorded.
- **Status:** `[x]` Verified 2026-10-15 — `docs/OPERATIONS.md` documents what to back up, Atlas cloud/on-demand backup + restore + PITR, local `.data/private-docs` backup (with the row↔file coherence rule and single-instance constraint), log/monitoring + alert signals (health, 500 bursts, auth 401/429), the audit-trail append-only policy, routine rotation (incl. `JWT_SECRET` invalidating sessions + signed URLs), and first-response incident steps. `npm run build` (shared → api → web) passed: API `tsc` clean, web `vite build` 96 modules → `dist/assets/index-*.js` 373.30 kB (gzip 112.59 kB) + CSS 38.58 kB.
