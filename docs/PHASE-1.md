# Phase 1 — Foundation (changelog)

Delivers a runnable, multi-tenant foundation: auth, tenants, users, RBAC, audit
log, base UI shell, full Postgres schema, and one-command Docker spin-up.

## Decisions & assumptions

1. **Backend = NestJS + Prisma** (not FastAPI). NestJS modules/DI/guards map
   cleanly to RBAC + multi-tenancy; Prisma gives typed queries and easy
   migrations. Both are "boring, proven".
2. **True multi-tenant** with client logins (not single-tenant). `tenantId` on
   every row; isolation enforced at the Prisma query layer via an
   AsyncLocalStorage tenant context + client extension.
3. **Region defaults = India**: INR currency, `Asia/Kolkata` timezone (matches
   the brief's IndiaMART/DLT/DPDP signals). Configurable per workspace.
4. **Auth**: short-lived access JWT + refresh JWT, both httpOnly cookies; refresh
   tokens are hashed and stored as revocable `Session` rows (powers session
   management + logout-everywhere on deactivation). argon2 hashing. TOTP 2FA.
5. **First run uses `prisma db push`** to materialize the schema (zero migration
   drift for local spin-up). Versioned migrations via `npm run prisma:migrate`
   for staging/prod.
6. **Provider integrations are stubbed as adapter interfaces only**; no provider
   SDK is wired in Phase 1 (Phases 3–4). All provider creds are env-driven.
7. The **full schema** for every Section-3 object is defined now (stable shape);
   only the foundation objects have APIs/UI in this phase.

## What shipped

**Backend (`server/`)**
- Prisma schema: Tenant, User, Role, Permission, Team, Territory, Session,
  AuditLog + all CRM objects (Lead…WebhookEvent) for later phases.
- `AuthModule`: register / login / refresh / logout / me / 2fa setup·enable·disable.
- `UsersModule`: list / create / update / deactivate / reactivate (permission-gated).
- `RolesModule`: list / create / update / delete + permission catalog endpoint.
- `TenantsModule`: read / update current workspace settings.
- `AuditModule`: `AuditService` + paginated audit-log API.
- `HealthModule`: `/api/health` (DB check).
- Cross-cutting: JWT guard, permissions guard, tenant-context interceptor,
  tenant-isolating Prisma extension, global validation pipe + exception filter,
  data-scope + field-restriction utilities, env validation (Joi).

**Frontend (`web/`)**
- Auth context (cookie session) + protected routes + silent token refresh.
- Pages: Login, Register, Dashboard, Users, Roles & Permissions, Audit Log,
  Settings (workspace + 2FA QR enrollment). Sidebar nav filters by permission.

**Infra**
- `docker compose up` → postgres + redis + server + web.
- `.env.example`, Dockerfiles, nginx SPA serving.

## Tests

- `npm run test:unit` — RBAC expansion (`*`/`manage`), data-scope where-builder,
  field restrictions, tenant-isolation arg scoping. No DB.
- `npm test` (e2e) — register→login→/me, **RBAC denial** (Read-Only blocked from
  `user:create`), **tenant isolation** (A can't see B), refresh + logout.

## Acceptance status (DoD relevant to Phase 1)

- ✅ Admin can define a role, scope data to a team, restrict a field; enforced on
  API (guard + scope util) and surfaced in UI. Verified by unit + e2e tests.
- ✅ Every external credential is env-driven; no secret committed.

## Next: Phase 2 — Core CRM

1. Leads, Contacts, Accounts, Deals CRUD with data-scope + field-restriction
   serialization applied (reuse `buildScopeWhere`/`applyFieldRestrictions`).
2. Pipelines + Stages with drag-and-drop Kanban; deal aging/rotting indicators.
3. Activities/Tasks (polymorphic) with assignee + due dates; timeline component.
4. Custom fields (admin-defined) on core objects, stored in `customFields` jsonb.
5. Lead→Contact/Deal conversion + dedup groundwork (email+phone lookup) to set
   up Phase 3 ingestion.
