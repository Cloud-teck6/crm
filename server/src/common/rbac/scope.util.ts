import { DataScope } from '@prisma/client';
import { AuthUser } from '../types/auth-user';

/**
 * Builds a Prisma `where` fragment that restricts record visibility to the
 * caller's data scope. Combine with AND against the rest of a query, e.g.:
 *
 *   where: { AND: [ buildScopeWhere(user, teammateIds), { status: 'NEW' } ] }
 *
 * tenantId itself is enforced separately by the Prisma tenant extension; this
 * helper only narrows *within* the tenant by ownership / team / territory.
 *
 *  - OWN       → records owned by the user
 *  - TEAM      → records owned by the user or their teammates
 *  - TERRITORY → records owned by anyone in the user's territory
 *  - TENANT    → no extra restriction
 */
export function buildScopeWhere(
  user: AuthUser,
  opts: {
    ownerField?: string;
    teammateIds?: string[];
    territoryMemberIds?: string[];
  } = {},
): Record<string, unknown> {
  const ownerField = opts.ownerField ?? 'ownerId';

  switch (user.dataScope) {
    case DataScope.TENANT:
      return {};
    case DataScope.TEAM: {
      const ids = Array.from(new Set([user.id, ...(opts.teammateIds ?? [])]));
      return { [ownerField]: { in: ids } };
    }
    case DataScope.TERRITORY: {
      const ids = Array.from(new Set([user.id, ...(opts.territoryMemberIds ?? [])]));
      return { [ownerField]: { in: ids } };
    }
    case DataScope.OWN:
    default:
      return { [ownerField]: user.id };
  }
}

/**
 * Strips fields a role is not allowed to see (Role.fieldRestrictions) from a
 * serialized record. Used by Phase 2 list/detail serializers.
 */
export function applyFieldRestrictions<T extends Record<string, any>>(
  record: T,
  resource: string,
  fieldRestrictions: Record<string, string[]> | null | undefined,
): T {
  const hidden = fieldRestrictions?.[resource];
  if (!hidden || hidden.length === 0) return record;
  const clone: Record<string, any> = { ...record };
  for (const field of hidden) delete clone[field];
  return clone as T;
}
