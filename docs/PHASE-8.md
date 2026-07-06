# Phase 8 — Hardening (changelog)

The final phase: security, observability, scheduling, API docs, and load testing.

## What shipped

**Security**
- **Rate limiting** (`@nestjs/throttler`) — a global `ThrottlerGuard` runs
  *before* auth (so it caps unauthenticated floods too); limit/window are
  env-driven (`THROTTLE_LIMIT`/`THROTTLE_TTL`). Health probes are `@SkipThrottle`.
- **Helmet** security headers (CSP disabled so the JSON API + Swagger UI work).
- **Inbound WhatsApp signature** — the messaging webhook now enforces
  `X-Hub-Signature-256` (HMAC over the raw body) when an app secret is
  configured, closing the Phase-4 gap. (Meta lead-ads + the rest already verify.)
- All secrets remain env-driven; per-tenant isolation, RBAC, audit logging, and
  input validation were established in earlier phases.

**Observability**
- **Structured request logging** via `pino-http` with redaction of
  `authorization` / `cookie` / `x-api-key`.
- **Liveness** `GET /api/health` (always 200 + DB status + version) and
  **readiness** `GET /api/health/ready` (503 when the DB is down — for load
  balancers / k8s).
- Graceful shutdown hooks + the uniform error envelope from Phase 1.

**Scheduling**
- An in-process **SLA cron** (`@nestjs/schedule`, every 30 min) sweeps every
  tenant via `NotificationsService.runSlaCheck`. `DISABLE_CRON=true` opts a
  process out. For multi-instance deploys, move this (and workflow waits /
  sequences / large imports) behind a leader-elected BullMQ repeatable job.

**Docs**
- **OpenAPI / Swagger UI** at `/api/docs` (API-key + bearer security schemes).
- A no-dependency **load-test harness** (`docs/load-test.mjs`).

## Tests

- **Unit: 39** (unchanged this phase).
- **e2e: 47 total, +4** in `security.e2e-spec.ts` — security headers (helmet),
  the readiness probe, **HTTP 429** rate limiting (isolated per-app throttle
  storage so it can't affect the other 43 tests), and **inbound WhatsApp
  signature** rejection/acceptance.

## Load test (single dev box, health endpoint w/ DB check)

```
Requests 1500 (concurrency 50) · 1879 req/s · 0 5xx
Latency p50 21.7ms · p95 33.0ms · p99 69.8ms   (target: p95 < 300ms ✓)
```

## Production follow-ons (noted, not blocking)

- Move scheduled/deferred work to **BullMQ + Redis** (workflow waits/sequences,
  SLA cron at scale, large imports) — the state machines are already in place.
- Wire **Sentry** (`SENTRY_DSN`) into the global exception filter for error
  monitoring.
- Add **XLSX** import (the CSV parser + `ImportJob` pipeline are reusable).
- Per-API-key data-scope narrowing; SMS/email inbound provider signature checks.

---

**The 8-phase build is complete.** See `docs/PHASE-1.md` … `PHASE-8.md` for each
phase, `docs/BUILD_SPEC.md` for conventions, and the root `README.md` to run it.
