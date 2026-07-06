# Phase 6 — Dashboards & notifications (changelog)

Role-aware analytics + a real-time-ish notification layer over everything the
prior phases produce.

## What shipped

**Analytics API (`modules/analytics`)** — scope-aware (own/team/territory/tenant)
and date-filtered:
- `GET /reports/kpis` — leads (30d + total), open deals, weighted forecast,
  win rate, won value, avg speed-to-lead (first outbound touch vs lead create).
- `GET /reports/leads-by-source` — counts + conversions + **cost-per-lead**
  (from `tenant.settings.adSpend`).
- `GET /reports/conversion-by-stage` — the funnel (deals + value per stage).
- `GET /reports/rep-activity` — per-rep leads / messages / calls / tasks / won.
- `GET /reports/attribution` — source × campaign → conversion rate.
- `GET /reports/export?metric=…` — **CSV export** of any tabular report,
  respecting the caller's data scope (never exports beyond what they can view).

**Notifications (`modules/notifications`)**
- Bell endpoints: list, unread-count, mark-read, mark-all-read (per-user).
- **Preferences** (`NotificationPreference` model): channels (IN_APP/EMAIL/SLACK),
  Slack webhook, quiet hours, muted triggers.
- `notify()` dispatcher: always persists in-app; also posts to Slack and/or
  emails (via the comms adapter) per prefs, honouring quiet hours + mutes.
  Wired into deal stage changes (and reusable everywhere — it's `@Global`).
- **SLA escalation** (`POST /notifications/run-sla-check`): finds uncontacted
  leads past `tenant.settings.slaMinutes`, notifies the owner and escalates to
  their team manager; idempotent (won't re-escalate). The cron schedule is
  Phase 8.

**Frontend**
- A real **Dashboard**: KPI cards, leads-by-source bars (with cost-per-lead),
  conversion funnel, rep-activity leaderboard, and CSV export buttons.
- A **notification bell** in the header (polls unread every 15s, dropdown list,
  mark-read / mark-all-read).
- **Notification preferences** in Settings (channels, Slack webhook, quiet
  hours, mutes).

## Tests

- **Unit (35 total, +3):** the CSV serializer (escaping, column order).
- **e2e (37 total, +8, live Postgres):** KPIs; leads-by-source **cost-per-lead**
  (₹10k / 2 leads = ₹5k); conversion funnel; rep activity; **CSV export**
  (headers + scope); the **bell** delivering + clearing a deal-stage notification;
  **muted triggers** suppressing a notification; **SLA escalation** + idempotency.

## Assumptions & limitations

- The bell is **near-real-time via polling** (15s). A push transport (SSE /
  Socket.IO) is a drop-in upgrade behind the same endpoints.
- Export is **CSV**; PDF export needs a render lib (deferred — the data layer is
  identical).
- Dashboards are a strong fixed layout consuming the analytics API; a
  drag-resize **configurable** widget grid is a future enhancement (the API it
  would consume is done).
- The SLA sweep is endpoint-triggered; the recurring cron lands in Phase 8.

## Next: Phase 7 — Import/export, public API & settings

CSV/XLSX import with column-mapping + dedup + error report (background), the
public REST API + API keys + outbound webhooks, admin settings, and DPDP/GDPR
export-/delete-my-data tooling.
