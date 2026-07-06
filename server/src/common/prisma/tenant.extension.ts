import { Prisma } from '@prisma/client';
import { currentTenantId } from '../context/request-context';

// Models WITHOUT a tenantId column — never scoped.
export const UNSCOPED_MODELS = new Set<string>(['Tenant', 'Permission']);

// Read operations that accept an arbitrary `where` (safe to inject tenantId).
const WHERE_READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

// Write-many operations that accept an arbitrary `where`.
const WHERE_WRITE_OPS = new Set(['updateMany', 'deleteMany']);

/**
 * Pure scoping logic (extracted so it can be unit-tested without a database).
 * Returns a NEW args object with tenantId injected appropriately, or the
 * original args when no scoping applies.
 */
export function scopeArgs(
  operation: string,
  args: any,
  tenantId: string | undefined,
  model: string | undefined,
): any {
  if (!tenantId || !model || UNSCOPED_MODELS.has(model)) return args;
  const a: any = { ...(args ?? {}) };

  if (operation === 'create') {
    a.data = { ...a.data, tenantId: a.data?.tenantId ?? tenantId };
  } else if (operation === 'createMany') {
    const rows = Array.isArray(a.data) ? a.data : [a.data];
    a.data = rows.map((r: any) => ({ ...r, tenantId: r?.tenantId ?? tenantId }));
  } else if (WHERE_READ_OPS.has(operation) || WHERE_WRITE_OPS.has(operation)) {
    a.where = { ...a.where, tenantId };
  }
  return a;
}

/**
 * Prisma client extension enforcing tenant isolation at the query layer.
 *
 * Unique-key operations (findUnique/update/delete/upsert) are intentionally
 * NOT auto-scoped — Prisma rejects extra keys in a unique `where`. Services
 * MUST fetch/mutate single records via findFirst + updateMany/deleteMany so
 * this extension scopes them (see BUILD_SPEC "Tenant isolation"). When there
 * is no tenant in context (pre-auth), nothing is injected.
 */
export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const scoped = scopeArgs(operation, args, currentTenantId(), model);
        return query(scoped);
      },
    },
  },
});
