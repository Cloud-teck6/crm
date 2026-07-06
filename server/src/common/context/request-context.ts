import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context propagated via AsyncLocalStorage. Populated by
 * RequestContextInterceptor once a request is authenticated, and read by:
 *   - the Prisma tenant extension (to scope every query to `tenantId`), and
 *   - the AuditService (to stamp actor + IP on audit rows).
 *
 * When there is no store (e.g. login, before a token exists) the Prisma
 * extension performs NO tenant filtering — auth must look across tenants.
 * This is why pre-auth code paths are the only place an unscoped query runs.
 */
export interface RequestStore {
  tenantId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function getStore(): RequestStore | undefined {
  return requestContext.getStore();
}

export function currentTenantId(): string | undefined {
  return requestContext.getStore()?.tenantId;
}
