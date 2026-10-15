# MEDBOURSE — Roadmap

Phases align with the master project specification. Exit criteria must be **verified**, not assumed.

## Phase weights (progress denominator)

| Phase | Weight | Focus |
|-------|--------|--------|
| P0 | 5% | Audit, continuity docs, git baseline |
| P1 | 10% | Architecture, design tokens, auth foundation, i18n shell |
| P2 | 8% | Users, customers, roles, country assignment |
| P3 | 10% | Catalogs, pricing, currencies, payment accounts |
| P4 | 12% | Applications, quotations, documents, payments evidence |
| P5 | 12% | Workflow engine, case timelines |
| P6 | 12% | Staff workspace, Super Admin |
| P7 | 8% | Messaging, notifications |
| P8 | 10% | Complete UX, RTL, responsive |
| P9 | 8% | Integration QA, security tests |
| P10 | 5% | Deployment readiness |

**Progress** = sum of completed phase weights + partial credit only for tasks explicitly marked in-progress with documented partial acceptance (default: no partial credit).

---

## P0 — Repository audit & continuity

**Exit:** AGENTS.md, PROJECT_* docs, TASKS.md, ROADMAP, DESIGN_SYSTEM, ARCHITECTURE_DECISIONS, CHANGELOG, docs/*, .cursor/rules, git initialized.

## P1 — Architecture & design foundations

**Exit:** Monorepo builds; `/api/v1/health`; design tokens in web; i18n library wired (4 locales); auth middleware skeleton; logging & validation patterns; `.env.example`; initial test runner passes.

## P2 — Identity & country operations

**Exit:** User/customer split; RBAC enforced on API; country assignment CRUD + exception queue; office-created customers; invitation flow (secure linking).

## P3 — Service catalogs & pricing

**Exit:** Cities, providers, education/medical/tourism catalogs; pricing rules with precedence; quotation snapshot; payment account config.

## P4 — Customer application & documents

**Exit:** End-to-end apply → quote → pay instructions → private upload → review states.

## P5 — Workflow engine

**Exit:** Versioned templates; case snapshot; prerequisite enforcement; audit on transitions.

## P6 — Staff & Super Admin

**Exit:** Operational tables, review flows, catalog admin, audit log UI.

## P7 — Communication

**Exit:** Case-linked messaging, in-app notifications, email dev mode documented.

## P8 — Frontend completion

**Exit:** Public site + portals; no fake actions on completed features; 4 languages + RTL verified.

## P9 — QA & security

**Exit:** Critical test scenarios from master spec executed with recorded results.

## P10 — Release readiness

**Exit:** OpenAPI complete; deployment docs; production build green; backup/ops notes.
