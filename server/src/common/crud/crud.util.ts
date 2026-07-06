import { applyFieldRestrictions } from '../rbac/scope.util';
import { AuthUser } from '../types/auth-user';

export interface Pagination {
  take: number;
  skip: number;
  page: number;
  pageSize: number;
}

export function parsePagination(page?: string, pageSize?: string, max = 200): Pagination {
  const take = Math.min(Math.max(Number(pageSize) || 25, 1), max);
  const p = Math.max(Number(page) || 1, 1);
  return { take, skip: (p - 1) * take, page: p, pageSize: take };
}

/** Where-fragment restricting to the given owner ids (null = no restriction). */
export function ownerScopeWhere(
  ownerIds: string[] | null,
  field = 'ownerId',
): Record<string, unknown> {
  return ownerIds ? { [field]: { in: ownerIds } } : {};
}

/** Apply a role's field-level restrictions to a single record or a list. */
export function restrict<T extends Record<string, any>>(
  data: T,
  resource: string,
  user: AuthUser,
): T;
export function restrict<T extends Record<string, any>>(
  data: T[],
  resource: string,
  user: AuthUser,
): T[];
export function restrict(data: any, resource: string, user: AuthUser): any {
  const fr = user.fieldRestrictions;
  if (Array.isArray(data)) return data.map((d) => applyFieldRestrictions(d, resource, fr));
  return applyFieldRestrictions(data, resource, fr);
}
