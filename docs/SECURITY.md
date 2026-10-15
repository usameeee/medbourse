# Security Practices — MEDBOURSE

## Authentication & sessions

- Passwords hashed with **bcrypt** (or argon2 if adopted in ADR update).
- JWT in HTTP-only cookie `mb_access` (Secure in production, SameSite=Lax); `Authorization: Bearer` also accepted. Refresh rotation TBD.
- Rate-limit register/login (20 / 15 min). Lockout policy still configurable later.
- Public registration cannot choose a privileged role.

## Authorization

- Roles: `customer`, `staff`, `admin`, `super_admin`.
- Enforce on **every** API handler touching Customer, Case, Document, Payment, Message.
- Permission matrix maintained in `@medbourse/shared` and tested in P9.

## Threat model (summary)

| Threat | Mitigation |
|--------|------------|
| Cross-customer case/document access | Server-side ownership checks; no IDOR via predictable IDs |
| Privilege escalation | Role from DB/session; admin actions audited |
| Account takeover / invitation abuse | Signed, expiring tokens; verify email/phone where configured |
| Workflow bypass | State machine on server; prerequisites from snapshot |
| Payment fraud | Receipt ≠ approved; staff verification + audit |
| Bank detail leakage | No IBAN in source; audit stores IBAN tail only |
| Document leakage | Private Cloudinary; short signed URLs; no logs of URLs/content |
| Upload abuse | MIME/size limits; virus scan hook optional later |
| Rate abuse | express-rate-limit on auth and upload |
| Audit tampering | Append-only audit collection; super_admin read |

## Data protection

- HTTPS in production; secure cookie flags.
- CORS allowlist from env.
- Sanitize inputs; validate with shared schemas (Zod planned).
- Error responses must not leak stack traces in production.

## Secrets

- All secrets in environment variables; `.env.example` placeholders only.
- Never expose MongoDB, Cloudinary, JWT, or email credentials to the client.

## Compliance

- Do not claim GDPR/HIPAA/KVKK compliance without legal review; document retention policies when implemented.
