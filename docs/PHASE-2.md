# Phase 2 — Core CRM (changelog)

Builds the core CRM objects on the Phase 1 foundation: Leads, Contacts,
Accounts, Deals (Kanban), Pipelines/Stages, Activities, and admin-defined
custom fields — all tenant-isolated, data-scoped, audited, and tested.

## What shipped

**Backend (`server/`)**
- **Accounts / Contacts / Leads / Deals** — full CRUD, each behind
  `@RequirePermissions`, owner-scoped via `ScopeService` (OWN/TEAM/TERRITORY/
  TENANT), with field-level output restrictions and audit logging.
- **Lead conversion** — `POST /leads/:id/convert` turns a lead into a Contact
  (linking an existing one by email/phone dedup when found), optionally a new
  Account (from the company) and a Deal (in a chosen pipeline/first stage); the
  lead is marked `CONVERTED` and linked to the contact.
- **Duplicate detection** — `GET /leads/duplicates?email=&phone=` returns
  matching leads + contacts (dedup groundwork for Phase 3 ingestion).
- **Pipelines & Stages** — CRUD with default 6-stage set; stage add/update/
  remove (guards against deleting stages/pipelines with deals).
- **Deals Kanban** — `GET /deals/board` returns stages as columns with their
  scoped deals, per-deal **aging** (`daysInStage`) + **rotting** flag, and
  per-column count / total / **weighted forecast**. `POST /deals/:id/move`
  changes stage (resets aging, syncs probability), rejecting cross-pipeline moves.
- **Activities** — polymorphic (lead/contact/deal) tasks/calls/notes/meetings
  with assignee + due date, complete/reopen, and a per-record `timeline`.
- **Custom fields** — admin-defined fields per object (Lead/Contact/Account/
  Deal); values stored in each record's `customFields` jsonb and validated
  (unknown-key rejection, required checks, light type coercion) on write.
- Shared scaffolding: `ScopeService`, `crud.util` (pagination, owner-scope
  where, field-restriction), reused across every record module.

**Frontend (`web/`)**
- New permission-gated nav + pages: **Leads** (list / create / convert modal),
  **Contacts**, **Accounts**, and **Deals** — a drag-and-drop **Kanban board**
  with pipeline selector, weighted column totals, aging, and create-deal.

## Review hardening

A post-build adversarial review surfaced two issues the happy-path tests missed,
both now fixed + regression-tested:
- **Convert authorization gap** — `POST /leads/:id/convert` now requires
  `account:create` / `deal:create` before it will create an account / deal
  (previously only `lead:edit` + `contact:create` were enforced).
- **Custom-fields partial update data loss** — `PATCH` now *merges* incoming
  custom-field values over the stored jsonb (via `CustomFieldsService.mergeAndValidate`)
  instead of replacing the whole object, so unspecified fields are preserved.

## Tests

`npm test` (e2e, live Postgres) — 13 passing across two suites:
- Phase 1 auth/RBAC/tenant-isolation (4).
- Phase 2 (7): pipeline + empty board; account/contact/lead CRUD; duplicate
  detection; **lead→contact+account+deal conversion**; **Kanban create + move**
  (incl. cross-pipeline rejection); **activity timeline**; and **data-scoping**
  (a Sales Rep sees only their own leads; `lead:delete` denied → 403).

## Acceptance status (DoD relevant to Phase 2)

- ✅ Multiple pipelines, drag-and-drop Kanban, deal aging/rotting, weighted
  forecast.
- ✅ Data scoping enforced on every record list/get/mutate (verified by e2e).
- ✅ Custom fields definable per object and validated on write.
- ✅ Lead conversion + dedup groundwork.

## Next: Phase 3 — Lead ingestion

1. Generic authenticated inbound API (API key per IntegrationConnection) +
   website form endpoint with honeypot/reCAPTCHA → normalized Lead.
2. Meta Lead Ads webhook: challenge verification, X-Hub-Signature-256, Graph
   API fetch, field-alias mapping; behind a LeadSourceAdapter.
3. Google Ads lead-form webhook + offline conversion stub.
4. Dedup on ingest (reuse `findDuplicates`), `WebhookEvent` logging, retry +
   dead-letter, BullMQ queue for <30s speed-to-lead + owner notification.
