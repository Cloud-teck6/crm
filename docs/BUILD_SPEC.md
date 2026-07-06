# BUILD_SPEC — conventions every phase follows

This is the contract that keeps the codebase coherent as features are added.
Read it before extending the backend.

## Multi-tenancy

- **Every tenant-owned row carries `tenantId`.** The only exceptions are
  `Tenant` itself and the global `Permission` catalog (see
  `UNSCOPED_MODELS` in `tenant.extension.ts`).
- **Isolation is enforced at the query layer**, not by remembering to add a
  filter. A Prisma client extension (`src/common/prisma/tenant.extension.ts`)
  reads the current tenant from `AsyncLocalStorage` and:
  - injects `tenantId` into `create` / `createMany` data,
  - ANDs `tenantId` into `where` for `findMany/findFirst/count/aggregate/groupBy/updateMany/deleteMany`.
- **Unique-key operations are NOT auto-scoped** (`findUnique/update/delete/upsert`)
  because Prisma rejects extra keys in a unique `where`. **Rule:** never use
  these for tenant data. Instead:
  - read one record → `findFirst({ where: { id } })` (extension adds tenantId),
  - update one record → `updateMany({ where: { id }, data })`,
  - delete one record → soft delete via `updateMany({ data: { deletedAt } })`.
- The request store is set by `RequestContextInterceptor` **after** guards run,
  so anything before authentication (login, tenant resolution) runs unscoped by
  design. Keep pre-auth queries minimal and explicit.

## Access the database

Inject `PrismaService` and use **`this.prisma.client.<model>`** — `client` is
always the tenant-isolating extended client.

## RBAC

- Permission keys are `"<resource>:<action>"`, defined once in
  `src/common/config/permissions.ts`. Add new resources/actions there; the seed
  and the web role editor pick them up automatically.
- Protect a route with `@RequirePermissions('lead:create', ...)`. Omitting it
  means "any authenticated user". `manage` implies all actions on its resource;
  `*` implies everything (Super Admin).
- **Data scope** (own/team/territory/tenant) lives on the role. Use
  `buildScopeWhere(user, …)` from `src/common/rbac/scope.util.ts` in list
  queries to narrow visibility within the tenant.
- **Field-level visibility**: `Role.fieldRestrictions` + `applyFieldRestrictions()`
  strip hidden fields from serialized records.

## Auditing

Inject `AuditService` and call `audit.log({ action, resource, resourceId, before, after })`
on every mutation. Actor/IP/userAgent are pulled from the request store
automatically; pass `tenantId`/`actorId` explicitly only in pre-auth paths.

## Soft deletes

Models with `deletedAt` are soft-deleted. Always add `deletedAt: null` to list
filters. (A future global filter may automate this; until then, be explicit.)

## External providers

Anything calling a third party (Meta, Google, SES, WhatsApp, MSG91, Exotel, S3)
must sit behind an adapter implementing the interfaces in
`src/integrations/*.interface.ts`, selected via env. Core logic never imports a
provider SDK directly. Persist raw inbound payloads before normalizing.

## Validation & errors

- DTOs use `class-validator`; the global `ValidationPipe` is `whitelist:true,
  forbidNonWhitelisted:true, transform:true`.
- Throw Nest `HttpException` subclasses; the global filter renders a uniform
  `{ statusCode, error, message, timestamp, path }` envelope.

## Tests (required)

- Every permission check, every integration webhook, and every import/export
  path gets a test (per the brief).
- Pure logic → `server/test/unit/*.spec.ts` (no DB).
- Request flows → `server/test/e2e/*.e2e-spec.ts` (real Postgres).
