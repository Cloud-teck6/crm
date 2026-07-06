# Phase 7 — Import/export, public API & compliance (changelog)

## What shipped

**CSV import (`modules/imports`)** — the headline:
- `POST /imports/preview` parses headers + sample rows and **auto-suggests a
  column mapping** (alias-matched per object).
- `POST /imports` runs in the **background** (non-blocking, progress-tracked via
  the `ImportJob` model) with **dedup strategies** (skip / update / create on
  email|phone), per-row validation, and a chunked progress update.
- `GET /imports/:id` polls status/counts; `GET /imports/:id/errors.csv`
  downloads the **error report** (row + reason). Supports Lead / Contact /
  Account.

**Public REST API + keys (`modules/api-keys`)**
- `ApiKey` model (sha256-hashed, shown once); CRUD gated by `settings:manage`.
- The `JwtAuthGuard` now also accepts an API key (`X-Api-Key` or
  `Authorization: Bearer ck_…`), authenticating **tenant-wide with the key's
  permissions** — so every existing `/api/*` endpoint *is* the public API,
  enforced by the same RBAC.

**Outbound webhooks (`modules/webhooks-out`)** — `WebhookSubscription` CRUD;
the dispatcher fires HMAC-signed POSTs to subscribers on `lead.created` /
`deal.stage_changed` (wired through `AutomationService`).

**Export (`modules/export`)** — `GET /export/{lead|contact|deal}.csv`,
scope-aware (never exports beyond what the caller can view).

**Compliance (`modules/compliance`)** — DPDP/GDPR data-subject tooling:
`POST /compliance/export` (everything held about an email) and
`POST /compliance/delete` (anonymize + soft-delete contacts/leads and redact
their messages/calls/activities). Admin-only, audited.

**Frontend** — an **Import** page (upload/paste → preview + map columns → pick
dedup strategy → background import with live progress + error-report download),
plus **API keys**, **data-privacy (export/erase)** sections in Settings.

## Tests

- **Unit (39 total, +4):** the RFC-4180 CSV parser (quotes, embedded commas/
  newlines, header→object mapping).
- **e2e (43 total, +6, live Postgres):** preview + suggested mapping; **background
  import** with **dedup** (2 created, 1 failed → error report; re-import → 2
  skipped); **API-key auth** (read/create allowed, out-of-scope endpoint → 403,
  invalid key → 401); **scope-aware CSV export**; **compliance export + erase**
  (contact 404 after delete); webhook-subscription CRUD.

## Assumptions & limitations

- Import is **CSV** (the parser is reusable for XLSX once a sheet reader is
  added). Background processing is in-process + progress-tracked; BullMQ/Redis
  is a drop-in for multi-instance scale (the `ImportJob` state machine is ready).
- 10k-row scale is architectural (chunked + progress + capped error list);
  tested with a small fixture.
- API keys are tenant-scoped with TENANT data scope; per-key data-scope
  narrowing is a future refinement.

## Next: Phase 8 — Hardening

Tests/coverage, security review (rate limiting, inbound webhook signatures,
helmet), observability (structured logs, Sentry, health/readiness), the BullMQ
scheduler for waits/sequences/SLA cron/large imports, load test, and docs.
