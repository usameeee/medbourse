# MEDBOURSE — Product & Business Context

## Purpose

MEDBOURSE is a production-oriented web platform for customers traveling to Türkiye for:

- **Education** — university admissions and educational consulting.
- **Medical tourism** — healthcare coordination (not clinical diagnosis on-platform).
- **Tourism** — travel packages, accommodation, transfers, excursions.

## Audiences

| Role | Description |
|------|-------------|
| **customer** | End user with own cases, documents, payments, messages |
| **staff** | Office operators; create customers/cases within permissions |
| **admin** | Assigned managers; country-scoped operations |
| **super_admin** | Global configuration, assignments, catalogs, audit |

## Core business rules (summary)

- Country-based manager assignment with exception queues and audit on change.
- Office can create **customer records without login**; secure invitation links existing accounts to records.
- Service-specific **configurable workflows** with versioned templates snapshotted per case.
- **Pricing and payment accounts** are configurable; quotations store immutable pricing inputs.
- Receipt upload is **evidence for review**, not automatic payment success.
- Medical and identity documents are **highly sensitive** with strict access control.

## Languages

Interface: **Arabic (RTL)**, **French**, **English**, **Turkish**. Display formatting is separate from stored monetary values.

## Terminology

| Term | Meaning |
|------|---------|
| **Customer** | Business identity record (may exist without User login) |
| **User** | Authentication account linked to at most one customer where applicable |
| **Case / Application** | Operational unit for a service journey |
| **Quotation** | Priced offer with frozen rule inputs and currency |
| **Workflow template** | Admin-configured stage graph; versioned |
| **Country assignment** | Maps customer country → responsible manager/team |

## Out of scope for claims on-platform

- Guaranteed admission, visa approval, or medical outcomes.
- Unverified partner logos or fabricated testimonials.
- Legal/compliance certifications without documented basis.
