# CRM — Multi-tenant CRM for marketing agencies

A production-grade, multi-tenant CRM that captures leads from paid/organic
sources, routes them to owners in seconds, and works every lead across email,
WhatsApp, SMS and phone — with dashboards, automation and full import/export.

Built in 8 phases (see `docs/PHASE-1.md` … `PHASE-8.md`). **All 8 phases are
complete** — foundation/RBAC, core CRM (Kanban), lead ingestion (Meta/Google/
website/generic), the email·WhatsApp·SMS·call hub, automation & scoring,
dashboards & notifications, import/export + public API, and hardening.

**Status:** 39 unit + 47 e2e tests pass; web + API build clean; load test
~1900 req/s, p95 33ms. OpenAPI docs at `/api/docs`.

---

## Stack

| Layer      | Choice                                                            |
| ---------- | ---------------------------------------------------------------- |
| Frontend   | React + TypeScript, Vite, TailwindCSS, TanStack Query, React Router |
| Backend    | Node.js + NestJS + TypeScript                                    |
| ORM / DB   | Prisma + PostgreSQL                                              |
| Cache/Jobs | Redis (BullMQ wired in later phases)                            |
| Auth       | JWT access/refresh in httpOnly cookies, argon2, TOTP 2FA        |
| Deploy     | Docker, one-command `docker compose up`                         |

---

## Quick start (Docker — recommended)

```bash
cp .env.example .env          # then edit secrets (JWT_*, passwords)
docker compose up --build
```

- Web app → http://localhost:5173
- API     → http://localhost:4000/api  (health: `/api/health`)

On first load, open the web app and **Create workspace** (`/register`). That
provisions a tenant, the 7 default roles, and makes you Super Admin — no seed
required.

> Optional demo data: `docker compose exec server npm run db:seed`
> seeds a `Demo Agency` tenant with admin `admin@demo.test` / `ChangeMe123!`.

## Local dev (without Docker)

Prerequisites: Node 20+, a Postgres instance, (optional) Redis.

```bash
# 1. Backend
cd server
npm install
cp ../.env.example .env        # set DATABASE_URL to your local Postgres
npm run prisma:generate
npm run prisma:migrate          # creates a versioned migration + applies it
npm run db:seed                 # optional demo tenant
npm run start:dev               # API on :4000

# 2. Frontend (new terminal)
cd web
npm install
echo "VITE_API_BASE_URL=http://localhost:4000" > .env
npm run dev                     # web on :5173
```

---

## Required environment variables

See [`.env.example`](.env.example) for the full list. The essentials for
Phase 1:

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | token signing (generate with `openssl rand -hex 32`) |
| `CORS_ORIGIN` | web origin allowed to send credentialed requests |
| `COOKIE_SECURE` | `true` in production (HTTPS) |
| `DEFAULT_CURRENCY`, `DEFAULT_TIMEZONE` | defaults for new workspaces (INR / Asia/Kolkata) |

Provider credentials (SES/WhatsApp/MSG91/Exotel/Meta/S3) are listed in
`.env.example` but unused until later phases. **No secret is committed; all are
env-driven.**

---

## Tests

```bash
cd server
npm run test:unit     # 39 — RBAC, scoping, tenant isolation, rules engine, CSV, render, validation
npm test              # 47 e2e across 8 suites (needs Postgres)
```

The **47 e2e tests** (`server/test/e2e/*.e2e-spec.ts`) cover each phase's
acceptance criteria end-to-end: auth/RBAC/tenant-isolation, CRM + Kanban +
conversion, lead ingestion (incl. Meta challenge + HMAC), the comms hub + 24h
window, the headline automation workflow, analytics + notifications + SLA, CSV
import + API-key auth + compliance, and hardening (rate limit, helmet,
readiness, webhook signatures).

The e2e suite needs a reachable, migrated Postgres (`docker compose up postgres`,
then `npm run prisma:deploy`).

---

## Features (all 8 phases)

1. **Foundation** — multi-tenant model, JWT-cookie auth + refresh sessions + TOTP
   2FA, RBAC (per-action permissions, data scopes, field restrictions), audit log.
2. **Core CRM** — Leads, Contacts, Accounts, Deals, Pipelines/Stages with a
   drag-and-drop **Kanban** (aging, rotting, weighted forecast), Activities, custom
   fields, and lead→contact/deal conversion.
3. **Lead ingestion** — pluggable adapters: generic API (key), website forms
   (honeypot), **Meta Lead Ads** (challenge + X-Hub-Signature-256 + Graph fetch),
   Google Ads; validation, dedup + touchpoints, owner routing, idempotent webhook
   log with retry/dead-letter.
4. **Communication hub** — unified **email / WhatsApp / SMS / call** on one
   timeline; templates with merge vars; WhatsApp **24-hour window** rule; inbound
   webhooks; click-to-call + recording.
5. **Automation & scoring** — rules engine, assignment strategies, lead scoring,
   and a no-code **workflow builder** (trigger → conditions → actions).
6. **Dashboards & notifications** — analytics (cost-per-lead, funnel, rep
   activity, attribution) + CSV export; notification bell, preferences, and SLA
   escalation.
7. **Import/export & public API** — background **CSV import** (mapping + dedup +
   error report), **API keys** (the public REST API), outbound webhooks,
   scope-aware export, and DPDP/GDPR data tooling.
8. **Hardening** — rate limiting, Helmet, webhook signature enforcement,
   structured logging, health/readiness, scheduled SLA cron, **OpenAPI at
   `/api/docs`**, load test.

See [`docs/PHASE-1.md`](docs/PHASE-1.md) … [`docs/PHASE-8.md`](docs/PHASE-8.md)
for per-phase changelogs and [`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md) for the
conventions every module follows.

## Operations

- **API docs:** http://localhost:4000/api/docs (Swagger UI).
- **Health:** `/api/health` (liveness + DB), `/api/ready` → `/api/health/ready`
  (readiness, 503 if DB down).
- **Load test:** `node docs/load-test.mjs http://localhost:4000/api/health 1500 50`.
- **Rate limiting / logging** tunable via `THROTTLE_LIMIT`, `THROTTLE_TTL`,
  `LOG_LEVEL` (see `.env.example`).

---

## Project layout

```
.
├── docker-compose.yml      # postgres + redis + server + web
├── .env.example
├── server/                 # NestJS API
│   ├── prisma/schema.prisma
│   └── src/
│       ├── common/         # prisma+tenant ext, guards, rbac, rules, crud, util
│       ├── integrations/   # lead-source + channel/voice adapters (Meta, WhatsApp…)
│       └── modules/        # auth, users, roles, tenants, audit, leads, contacts,
│                           # accounts, deals, pipelines, activities, custom-fields,
│                           # ingestion, integrations, messaging, automation,
│                           # analytics, notifications, imports, api-keys,
│                           # compliance, webhooks-out, export, health
└── web/                    # React + Vite app (15 pages)
    └── src/{lib,components,pages,routes}
```
