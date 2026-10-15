# MEDBOURSE — Deployment Guide

How to build and run MEDBOURSE outside local development. The API is a Node/Express service (`apps/api`) and the web client is a static React bundle (`apps/web`); both are TypeScript workspaces of this repository.

> Never commit secrets. All credentials (MongoDB URI, JWT secret, Cloudinary keys, SMTP password) live in environment variables only.

## Topology

| Component | Package | Artifact | Serves |
|-----------|---------|----------|--------|
| API | `@medbourse/api` | `apps/api/dist/index.js` (Node) | `https://<api-host>/api/v1/*` |
| Web | `@medbourse/web` | static files in `apps/web/dist` | the browser UI |
| Shared | `@medbourse/shared` | built first (types + constants) | imported by both |

The web bundle bakes the API base URL in at **build time** (`VITE_API_BASE_URL`); the API reads everything else from the environment at **run time**.

## Prerequisites

- Node.js **>= 20** (see `engines` in the root `package.json`).
- npm (workspaces). Install from the repo root: `npm install`.
- A MongoDB **Atlas** cluster (or any MongoDB 6+ reachable over SRV).
- For production document storage: a Cloudinary account (optional; see [File storage](#file-storage)).

## Environment variables

Copy `.env.example` to `.env` at the repo root (the API loads `../../../.env` relative to `apps/api/src`). `.env` is git-ignored.

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `NODE_ENV` | yes (prod) | `development` | `production` enables secure cookies and generic 500 messages |
| `API_PORT` | no | `4000` | HTTP listen port |
| `API_HOST` | no | `0.0.0.0` | HTTP listen host |
| `CORS_ORIGIN` | yes (prod) | `http://localhost:5173` | **Single** allowed origin, sent with credentials |
| `MONGODB_URI` | yes | — | `mongodb+srv://…` Atlas connection string |
| `JWT_SECRET` | yes | — | Long random string; signs access tokens **and** document signed URLs. Rotating it invalidates all sessions and outstanding download links |
| `JWT_ACCESS_EXPIRES` | no | `15m` | Access-token lifetime |
| `JWT_REFRESH_EXPIRES` | no | `7d` | Reserved for the refresh flow (not yet wired) |
| `COOKIE_SECRET` | yes | — | Cookie signing secret (generate strong random) |
| `STORAGE_DRIVER` | no | `local` | `memory` (tests) / `local` / `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` | when `cloudinary` | — | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | when `cloudinary` | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | when `cloudinary` | — | Cloudinary API secret |
| `CLOUDINARY_FOLDER_SENSITIVE` | no | `medbourse/private` | Private folder for sensitive documents |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | no | `smtp.gmail.com` / `587` / `false` | Email is in **dev mode**: intent is logged, nothing is sent (see `docs/EMAIL.md`) |
| `SMTP_USER` / `SMTP_PASS` | no | — | Use a Google **App Password**, not the account password |
| `EMAIL_FROM` | no | `MEDBOURSE <noreply@example.com>` | From header |
| `VITE_API_BASE_URL` | yes (web) | `http://localhost:4000/api/v1` | Baked into the web bundle at build time |

Generate strong secrets, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## Build & run

From the repo root:

```bash
npm install
npm run build            # builds shared → api → web
```

### API

```bash
npm run start -w @medbourse/api     # node dist/index.js  (uses the root .env)
```

Run it behind a process manager (systemd, PM2, a container, or the platform's runner). The process listens on `API_HOST:API_PORT`. If MongoDB cannot be reached in `production`, the process exits with code 1 (fail fast); in development it starts and reports `"database": "disconnected"` on `/health`.

### Web

`npm run build` emits a static bundle in `apps/web/dist`. Serve it with any static host (CDN, Nginx, a Node static server) over HTTPS. Set `VITE_API_BASE_URL` **before** building:

```bash
VITE_API_BASE_URL=https://api.example.com/api/v1 npm run build -w @medbourse/web
```

### Local (development) parity

```bash
npm run dev        # API (tsx watch) + web (vite) concurrently
```

## MongoDB Atlas

- Create a cluster and a database user with read/write on the `medbourse` database.
- Allow the API host's IP (or use Private Endpoint / VPC peering). Do not open `0.0.0.0/0` in production.
- Put the SRV string in `MONGODB_URI`.
- Verify connectivity without printing the URI:

  ```bash
  npm run db:check -w @medbourse/api
  ```

- Health: `GET /api/v1/health` returns `"database": "connected"` when Atlas is reachable.

### First-run data

The seed is **idempotent** (upserts, never deletes) and creates the only staff/admin accounts plus minimal catalog data:

```bash
npm run db:seed -w @medbourse/api
```

It creates `root@medbourse.dev` (super_admin) and `staff@medbourse.dev` (staff) with password `medbourse-dev-2026` (override with `SEED_PASSWORD`), plus 2 cities, 2 providers, 2 offerings, and 1 customer. **Change or disable these dev accounts before real production use** — there is no other path to a privileged account (public registration always yields `customer`; invitations only link customers).

## File storage

Sensitive documents and payment receipts are stored privately; the browser never receives a storage key or a permanent URL.

| `STORAGE_DRIVER` | Upload target | Download path | Use for |
|------------------|---------------|---------------|---------|
| `memory` | process memory (ephemeral) | `GET /documents/:id/content` | tests only |
| `local` | `<repo>/.data/private-docs` | `GET /documents/:id/content` (signed) | single-host dev/staging |
| `cloudinary` | Cloudinary private folder | Cloudinary signed URL (60s) | production / multi-host |

With `cloudinary`, `GET …/content` returns `400 SIGNED_URL_ONLY` and clients must use the signed URL from `…/signed-url`. With `local`, back up `.data/private-docs` (see `docs/OPERATIONS.md`) and mount it on persistent storage — do not run multiple API instances behind a load balancer with the `local` driver.

Signed download links expire in **60 seconds** and are HMAC-signed with `JWT_SECRET`.

## CORS, cookies and HTTPS

- CORS allows exactly one origin (`CORS_ORIGIN`) with `credentials: true`. Set it to the deployed web origin, scheme included.
- Auth uses the HTTP-only cookie `mb_access` with `sameSite: 'lax'` and `secure` **only when `NODE_ENV=production`**. `SameSite=Lax` is not sent on cross-site requests, so in production serve the web client and the API from the **same registrable domain** (e.g. `app.example.com` + `api.example.com`, or a single origin with a path/reverse-proxy). A completely different top-level domain will break cookie auth — clients can still use `Authorization: Bearer`.
- Always terminate TLS at your proxy/host and forward to the API over the private network. Never serve this API over plain HTTP in production.
- `helmet()` is enabled globally; `express.json` is limited to `1mb`; uploads are capped at 10MB (PDF/JPEG/PNG/WebP).
- Auth endpoints are rate-limited to 20 requests per 15 minutes per IP (disabled under `VITEST`).

## Post-deploy smoke test

1. `GET /api/v1/health` → `200` with `"database": "connected"`.
2. `GET /api/v1/catalog/offerings` → `200` (public; no auth).
3. Open the web app, sign in with a seeded/admin account, confirm the portal loads.
4. Confirm a protected endpoint returns `401` without credentials (e.g. `GET /api/v1/customers`).

The full route list is in `docs/openapi.yaml`.
