# MEDBOURSE API

Base URL (development): `http://localhost:4000/api/v1`

The machine-readable source of truth is `docs/openapi.yaml` (OpenAPI 3.1.0); this file is a human-readable companion.

## Implemented endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Service health and version |
| POST | `/auth/register` | No | Create customer account; sets `mb_access` cookie |
| POST | `/auth/login` | No | Sign in; sets `mb_access` cookie |
| POST | `/auth/logout` | No | Clear access cookie |
| GET | `/auth/me` | Yes | Current user (no password hash) |
| GET | `/auth/staff-check` | Staff+ | RBAC probe (`case:create:staff`) |
| POST | `/customers` | Staff+ (`customer:create:staff`) | Office-created customer (no login) |
| GET | `/customers` | Staff+ (`customer:read:staff`) | Paginated list (`page`, `limit`, `q`) |
| GET | `/customers/queue/unassigned` | Staff+ | Unassigned and exception customers |
| POST | `/customers/:id/assignment` | Admin+ | Manual reassignment with reason (audited) |
| GET | `/customers/:id` | Staff+ or linked customer | One customer record |
| GET | `/users/managers` | Admin+ (`assignment:manage:admin`) | Active assignable managers (staff/admin/super_admin) for the reassignment picker |
| GET | `/country-assignments` | Admin+ | Country → manager maps |
| PUT | `/country-assignments` | Admin+ | Upsert map (`managerUserIds`, `isActive`) |
| POST | `/customers/:id/invitations` | Staff+ | Issue invitation; returns `{ invitation, token }` once |
| POST | `/customers/:id/invitations/:invitationId/revoke` | Staff+ | Revoke unused invitation |
| POST | `/invitations/accept` | Customer | Consume token; link session user to customer |
| GET | `/catalog/cities` | Public (active) | City list |
| POST | `/catalog/cities` | Super Admin | Create city |
| PATCH | `/catalog/cities/:id` | Super Admin | Update city |
| GET | `/catalog/providers` | Public (active) | Provider list |
| POST | `/catalog/providers` | Super Admin | Create provider (`partnershipVerified` defaults false) |
| PATCH | `/catalog/providers/:id` | Super Admin | Update provider |
| GET | `/catalog/offerings` | Public (active) | Filter `category`, `providerId`, `cityId` |
| POST | `/catalog/offerings` | Super Admin | Create offering (disclaimer is server-set) |
| PATCH | `/catalog/offerings/:id` | Super Admin | Update offering |
| GET | `/pricing-rules` | Super Admin | List pricing rules |
| POST | `/pricing-rules` | Super Admin | Create rule (`amount` decimal string + `currency`) |
| POST | `/quotations` | Staff+ | Issue immutable quotation from customer country + offering |
| GET | `/quotations/:id` | Staff+ or linked customer | Read quotation snapshot |
| GET | `/quotations/:id/payment-instructions` | Staff+ or linked customer | Resolve live bank instructions for the quote currency/country |
| GET | `/payment-accounts` | Super Admin | List payment accounts |
| POST | `/payment-accounts` | Super Admin | Create IBAN instructions (no hardcoded bank in code) |
| PATCH | `/payment-accounts/:id` | Super Admin | Update or deactivate a payment account |
| POST | `/cases` | Staff+ | Open a case for a customer + offering (optional matching quotation) |
| GET | `/cases` | Staff+ all, or linked customer own | Paginated cases |
| GET | `/cases/:id` | Staff+ or linked customer | One case |
| PATCH | `/cases/:id/workflow/stages/:stageId` | Staff+ (`case:workflow:staff`) | Advance a workflow stage; body `{ status }` |
| PATCH | `/cases/:id/close` | Staff+ (`case:workflow:staff`) | Close a case (all non-optional stages must be `done`) |
| POST | `/cases/:id/documents?kind=` | Staff reviewer or linked customer | Private upload (`identity` / `medical` / `supporting`) |
| GET | `/cases/:id/documents` | Staff reviewer or linked customer | List metadata (no storage keys) |
| GET | `/cases/:id/documents/:documentId/signed-url` | Staff reviewer or linked customer | 60s download URL |
| GET | `/documents/:id/content?exp=&sig=` | Signed query | Stream bytes (local/memory driver) |
| POST | `/quotations/:id/payment-evidence` | Staff+ or linked customer | Upload receipt; status is `submitted`, quotation unchanged |
| GET | `/quotations/:id/payment-evidence` | Staff+ or linked customer | List receipts for a quotation |
| POST | `/payment-evidence/:id/review` | Staff (`payment:verify:staff`) | Approve or reject; reject requires a note |
| GET | `/payment-evidence/:id/signed-url` | Staff+ or linked customer | 60s download URL for the receipt |
| GET | `/workflow-templates` | Super Admin | List templates (filter `?category=`) |
| POST | `/workflow-templates` | Super Admin | Create template + first version (stage graph) |
| GET | `/workflow-templates/:id` | Super Admin | Template + current version |
| PATCH | `/workflow-templates/:id` | Super Admin | Update metadata (`name`, `description`, `isActive`) |
| GET | `/workflow-templates/:id/versions` | Super Admin | All versions (newest first) |
| POST | `/workflow-templates/:id/versions` | Super Admin | Create a new version (stages replace current) |
| GET | `/workflow-templates/:id/versions/:versionNumber` | Super Admin | Read a specific version |

### GET `/health`

**Response 200**

```json
{
  "status": "ok",
  "service": "medbourse-api",
  "version": "0.0.1",
  "timestamp": "ISO-8601",
  "database": "connected"
}
```

`database` is `"connected"` or `"disconnected"`. The health response never includes connection strings.

## Conventions

- JSON bodies; `Content-Type: application/json`.
- Errors (implemented): `{ "error": { "code": "...", "message": "...", "details": ... } }` — see `@medbourse/shared` `ApiErrorBody`.
- Validation failures return `400` with `code: VALIDATION_ERROR` and Zod `flatten()` in `details`.
- Unknown routes return `404` with `code: NOT_FOUND`.
- Pagination: `?page=&limit=` with `{ data, meta: { page, limit, total } }`.
- Auth: HTTP-only cookie `mb_access` **or** `Authorization: Bearer <token>`.
- Self-registration always assigns role `customer`. Passwords: min 10 characters.
- Customer records are not User accounts. Duplicate customer emails return `409 CUSTOMER_EMAIL_IN_USE` with `details.customerId`. `countryCode` is ISO 3166-1 alpha-2.
- Country assignment: no map → `unassigned`; inactive mapped manager → `exception`; never pick a random manager. Map updates do not change existing assigned customers.
- Invitations: linking requires the secret token plus matching email. `POST /auth/register` accepts optional `invitationToken`. Email send is a documented dev mode — intent is logged, nothing is sent (see `docs/EMAIL.md`).
- Notifications: `GET /notifications` returns only the caller's rows (newest first, optional `unreadOnly`, pagination + `meta.unread`); `PATCH /notifications/:id/read` and `POST /notifications/read-all` set read state. Another user's row returns `404`.
- Pricing: more specific rules win (offering 4 + category 2 + country 1). Equal specificity → `409 AMBIGUOUS_PRICING`. No match → `404 NO_PRICE`. Issued quotations do not change when rules are edited. Amounts are decimal strings (2 places), never IEEE floats.
- Payment accounts: country-specific IBAN beats a global account for the same currency. Equal specificity → `409 AMBIGUOUS_PAYMENT_ACCOUNT`. No match → `404 NO_PAYMENT_ACCOUNT`. Instructions are resolved live (bank details can change; quotation amount does not). Audit logs store only the IBAN tail, never the full number.
- Cases: staff opens with `case:create:staff`. Customers list/get only their linked cases. Quotation on a case must match the same customer and offering (`400 QUOTATION_MISMATCH`).
- Documents: private storage (`STORAGE_DRIVER` memory/local/cloudinary). PDF/JPEG/PNG/WebP, 10MB. Signed URLs expire in 60s. Responses and audit metadata never include storage keys, Cloudinary secrets, or original filenames.
- Payment evidence: a receipt is `submitted` until staff review. Upload never marks the quotation paid. Customer cannot self-approve (`403`). Reject requires `REVIEW_NOTE_REQUIRED`.
- Workflow templates: Super Admin defines a versioned stage graph per service category. When a case is opened, the **active** template's current version is snapshotted onto `case.workflow` (each stage starts `pending`). Later template edits or new versions do **not** mutate in-flight cases. Stage `id`s must be unique within a version; empty stage arrays are rejected (`400`).
- Workflow stage transitions: Staff advance stages with `PATCH /cases/:id/workflow/stages/:stageId` and `{ "status": "in_progress" | "done" | "skipped" }`. Allowed transitions: `pending → in_progress|done|skipped`, `in_progress → done|skipped`. A stage can only be marked `done` when all earlier **non-optional** stages are `done` (`409 PREREQUISITE_NOT_DONE`). Only `optional` stages may be `skipped` (`400 STAGE_NOT_OPTIONAL`). Terminal statuses (`done`, `skipped`) cannot be reverted. Every transition appends `case.workflow_stage_transitioned` to `AuditLog`.
- Case close: Staff close a case with `PATCH /cases/:id/close`. All non-optional stages must be `done` (`409 REQUIRED_STAGES_NOT_DONE`); already-closed cases return `409 CASE_ALREADY_CLOSED`. Closing writes `case.closed` to `AuditLog`. The case timeline (snapshot stages + statuses) is readable via `GET /cases/:id` for staff and the linked customer.
