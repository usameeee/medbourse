# MEDBOURSE — Architecture Decisions

Format: ADR-style entries. New decisions append with date.

---

## ADR-017 — Receipt upload is evidence, not payment success (2026-10-14)

**Context:** Customers will send bank receipts. Treating that as paid would be fraud-prone.

**Decision:** `PaymentEvidence` stores a private file against a quotation with status `submitted` | `approved` | `rejected`. Only `payment:verify:staff` can review. Reject requires a note. The quotation snapshot (amount/currency) is never mutated by upload or review.

**Consequences:** Workflow (P5) may require an approved receipt as a stage prerequisite; the engine must read evidence status, not invent a paid flag on the quote.

---

## ADR-016 — Private case documents and short signed URLs (2026-10-14)

**Context:** Identity and medical files must not be world-readable.

**Decision:** Uploads go through authenticated case routes. Bytes live in private object storage (`memory` in tests, `local` for dev, `cloudinary` private/authenticated when `STORAGE_DRIVER=cloudinary`). Clients receive a 60-second URL after an authorization check. Local/memory URLs are HMAC query params; Cloudinary URLs are signed by the SDK. Audit records kind, MIME, and size only.

**Consequences:** Receipt/evidence (P4-T03) can reuse the same store with kind `supporting` or a dedicated payment-evidence kind later. Never log signed URLs or storage keys.

---

## ADR-015 — Configurable payment accounts, live instruction resolve (2026-10-14)

**Context:** Customers must pay to real office accounts. Hardcoded IBANs in source would be wrong for every environment and leak into git.

**Decision:** Super Admin CRUD on `PaymentAccount` (currency required; customer country optional wildcard). Specificity is country (1) vs global (0). Staff/customer read instructions only through a quotation they can already see. Amount/currency stay on the quotation snapshot; IBAN is not copied onto the quote so operations can rotate bank details.

**Consequences:** Receipt/evidence upload (P4) references quotation id + resolved account id at submit time. Do not treat viewing instructions as payment success.

---

## ADR-014 — Pricing specificity and frozen quotations (2026-10-14)

**Context:** Multiple rules can match; historical quotes must not move.

**Decision:** Specificity = offering (4) + category (2) + customer country (1). Null dimensions are wildcards. Ties are errors, not silent wins. Money is `decimal.js` normalized to 2 fractional digits plus ISO 4217 code. `Quotation` copies amount, currency, rule id, and offering disclaimer at issue time; there is no amount PATCH.

**Consequences:** Payment instructions (P3-T04) attach to quotations by currency/country, not by mutating the snapshot.

---

## ADR-013 — Offerings cannot claim admission, visa, or clinical guarantees (2026-10-14)

**Context:** Education, medical, and tourism modules must not over-promise.

**Decision:** `Offering.category` is copied from the provider. Public payloads always include a server-defined `disclaimer`. Create/update rejects copy matching guarantee language (en/tr/fr/ar stems). Admin cannot override the disclaimer field.

**Consequences:** Pricing (later) attaches to offerings; quotations can snapshot offering id + disclaimer text.

---

## ADR-012 — Catalog entries never imply unverified partnerships (2026-10-14)

**Context:** Public catalogs must not invent university/hospital relationships.

**Decision:** `Provider.partnershipVerified` defaults to **false**. Super Admin may set it true only when the relationship is actually authorized. Inactive records are omitted from public GET lists. No seed data of fake partners.

**Consequences:** UI must not treat a name in the catalog as a claimed partnership unless `partnershipVerified` is true.

---

## ADR-011 — Invitations required to link User and Customer (2026-10-14)

**Context:** Office-created customers must not be claimed by knowing an email or record id.

**Decision:** Staff issues a high-entropy invitation; only the SHA-256 hash is stored. Accept/register requires the raw token **and** matching email. Same email without a token does not link. Tokens expire (7 days), are revocable, and are not written to logs. Email send is a documented dev mode (intent logged, nothing sent — see `docs/EMAIL.md`); create response returns the token once for staff to share.

**Consequences:** One User per Customer (`customerId` unique sparse). Audit `invitation.issued` / `consumed` / `revoked`.

---

## ADR-010 — Country assignment is explicit, never silent (2026-10-14)

**Context:** Customers must be routed to a country desk. Missing maps must not pick an arbitrary manager.

**Decision:** `CountryAssignment` maps ISO country → one or more manager user ids (primary is first). New customers resolve against the **current** active map. No map → `unassigned`. Map exists but manager inactive/invalid role → `exception`. Mapping changes do **not** rewrite already assigned customers. Manual reassignment requires admin permission, a reason, and an append-only `AuditLog`.

**Consequences:** Staff see `/customers/queue/unassigned`. Super Admin/admin maintain maps via `PUT /country-assignments`.

---

## ADR-001 — Monorepo with npm workspaces (2026-10-13)

**Context:** MERN stack, shared TypeScript types, single product.

**Decision:** Root monorepo with `apps/web`, `apps/api`, `packages/shared`.

**Consequences:** Unified versioning; shared types published via workspace package `@medbourse/shared`; CI can build in dependency order.

---

## ADR-002 — API versioning prefix `/api/v1` (2026-10-13)

**Context:** Long-lived business API; future breaking changes.

**Decision:** All REST routes under `/api/v1`.

**Consequences:** OpenAPI scoped to v1; v2 can coexist later.

---

## ADR-003 — Customer identity separate from User (2026-10-13)

**Context:** Office-created customers without accounts; secure linking later.

**Decision:** `Customer` entity distinct from `User`; optional link with audited invitation flow.

**Consequences:** All case ownership references Customer; authorization joins User → Customer.

---

## ADR-004 — Money as decimal string + currency code (2026-10-13)

**Context:** Multi-currency; no float errors.

**Decision:** Store amounts as string decimal (e.g. `decimal.js` or Mongo Decimal128) with ISO 4217 currency; quotations snapshot rule inputs.

**Consequences:** Reporting never sums unlike currencies; conversion auditable when added.

---

## ADR-005 — Workflow template versioning (2026-10-13)

**Context:** Admin edits must not rewrite historical cases.

**Decision:** `WorkflowTemplateVersion` snapshotted when case opens.

**Consequences:** Engine validates against snapshot, not live template.

---

## ADR-006 — Cloudinary private assets for sensitive docs (2026-10-13)

**Context:** Passports, medical files, receipts.

**Decision:** Private folders; server-mediated signed URLs; no permanent public URLs.

**Consequences:** API must authorize every access; upload via authenticated endpoints.

---

## ADR-009 — HTTP-only JWT cookie plus Bearer (2026-10-14)

**Context:** Browser clients need a session; API tests and future mobile clients need a token header. Tokens must not live in `localStorage`.

**Decision:** Access JWT in HTTP-only cookie `mb_access` (SameSite=Lax, Secure in production). Also accept `Authorization: Bearer`. Public registration always creates `customer`. Role is read from the User document on each authenticated request, not trusted from the client body. Passwords hashed with bcrypt. Refresh rotation deferred.

**Consequences:** CORS must send credentials. Staff/admin accounts are not self-registered. Logout clears the cookie.

---

## ADR-008 — Gmail SMTP for transactional email (2026-10-14)

**Context:** Invitations and notifications need a configurable mail provider. The business will use a Google account.

**Decision:** Send mail via Gmail SMTP (`smtp.gmail.com`, port 587, STARTTLS). Authenticate with a **Google App Password** stored in `SMTP_PASS`. Do not use the Google account login password.

**Consequences:** Simple for early operations; Gmail daily send limits apply. High volume or dedicated domain sending would require a later provider ADR. Secrets stay in `.env` only. Phase 7 (P7-T03) ships the dev mode only — intent is logged, nothing is sent; real delivery is a follow-up task documented in `docs/EMAIL.md`.

---

## ADR-007 — i18n with react-i18next (2026-10-14)

**Context:** Four languages including RTL Arabic.

**Decision:** `i18next` + `react-i18next` + `i18next-browser-languagedetector`. JSON catalogs in `apps/web/src/i18n/locales`. Locale codes and RTL list live in `@medbourse/shared`. Document `lang`/`dir` updated on language change. Preference stored in `localStorage` key `medbourse-locale`.

**Consequences:** All UI strings go through catalogs. Missing keys fail TypeScript when catalogs diverge (`locales.ts` assigns all files to `typeof en`). Arabic uses `dir="rtl"` and logical CSS, not `text-align: right` alone.
