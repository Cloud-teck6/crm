# Phase 5 — Automation & scoring (changelog)

Routes leads to the right owner, scores them, and runs no-code workflows —
trigger → conditions → actions — on a shared rules engine.

## What shipped

**Rules engine (`common/rules/conditions.ts`)** — pure, shared by scoring,
assignment, and workflows. Operators: eq/ne/gt/gte/lt/lte/contains/starts_with/
in/exists/not_exists/is_empty; AND/OR groups; field resolution with a
`customFields` fallback and dot-paths (so `budget` resolves to
`customFields.budget`).

**Assignment engine (`AssignmentService`)** — strategies: `load_balanced`
(fewest open leads), `round_robin`, `rule_based` (first matching rule's
assignee), `territory`; candidate pool optionally restricted to a role
(implements "assign a senior rep"). Tenant-explicit so it runs in the
context-less ingestion path too.

**Lead scoring (`ScoringService` + `ScoringRule` model)** — sums points from
active rules whose condition matches a lead; applied automatically on lead
creation (manual + ingested).

**No-code workflows (`Workflow` model + `WorkflowEngine`)**
- Triggers: `lead.created`, `lead.updated`, `deal.stage_changed`,
  `message.inbound`.
- Conditions: the shared rules engine (AND/OR).
- Actions: `assign_owner`, `send_message` (template via the comms hub),
  `create_task`, `update_field`, `add_tag`, `webhook` (Slack/HTTP), `wait`
  (deferred — needs the Phase 8 scheduler).
- Wired into `LeadsService.create`, `IngestionService` and `DealsService.move`
  via `AutomationService` (which never throws into the caller). Each run is
  recorded in the audit log with per-action results. A `POST /workflows/:id/test`
  dry-runs conditions against a sample for the builder.

**Frontend** — an **Automation** page: a no-code builder for workflows
(trigger + AND/OR condition rows + typed action rows) and lead-scoring rules,
with active toggles.

## Tests

- **Unit (32 total, +4):** the rules engine — operators, AND/OR, customFields
  fallback / dot-paths, empty-group-matches.
- **e2e (29 total, +4, live Postgres):** rule-based **scoring** on creation;
  the **headline workflow end-to-end** ("CampaignX + budget > 50k → assign
  senior rep + send WhatsApp template + create task + tag hot"), verifying the
  reassigned owner, the rendered WhatsApp message, the task, and the tag;
  non-matching leads don't fire; `workflow:manage` gating (403).

## Notable bug caught by the e2e

The global `ValidationPipe` (`whitelist`) mangled the untyped `actions[]` into
`[[],[],[]]` — fixed by giving actions a `@ValidateNested` + `@Type`
`WorkflowActionDto` (config kept as an opaque `@IsObject`).

## Assumptions & limitations

- `wait`/`delay` and multi-step sequences need a scheduler (BullMQ + Redis) —
  deferred to Phase 8; the engine records them as `skipped`.
- Automation runs synchronously inside the triggering request (well under the
  speed-to-lead target); moving to a queue is a scale concern, not correctness.
- An optional AI score / next-best-action sits behind the same `ScoringService`
  seam when a model is configured.

## Next: Phase 6 — Dashboards & notifications

Configurable role-aware dashboards, multi-object reports (leads + deals +
activities + messages), and the real-time notification layer (in-app bell +
email + Slack) with SLA escalations — the `Notification` rows are already being
written by ingestion + the comms hub.
