import { scopeArgs } from '../../src/common/prisma/tenant.extension';

const TID = 'tenant_123';

describe('scopeArgs (tenant isolation)', () => {
  it('injects tenantId into create data', () => {
    const out = scopeArgs('create', { data: { name: 'Lead' } }, TID, 'Lead');
    expect(out.data.tenantId).toBe(TID);
  });

  it('does not overwrite an explicit tenantId on create', () => {
    const out = scopeArgs('create', { data: { name: 'Lead', tenantId: 'other' } }, TID, 'Lead');
    expect(out.data.tenantId).toBe('other');
  });

  it('maps tenantId across createMany rows', () => {
    const out = scopeArgs('createMany', { data: [{ a: 1 }, { a: 2 }] }, TID, 'Lead');
    expect(out.data.every((r: any) => r.tenantId === TID)).toBe(true);
  });

  it('ANDs tenantId into findMany where', () => {
    const out = scopeArgs('findMany', { where: { status: 'NEW' } }, TID, 'Lead');
    expect(out.where).toEqual({ status: 'NEW', tenantId: TID });
  });

  it('adds tenantId to findMany even with no where', () => {
    const out = scopeArgs('findMany', {}, TID, 'Lead');
    expect(out.where).toEqual({ tenantId: TID });
  });

  it('scopes updateMany / deleteMany', () => {
    expect(scopeArgs('updateMany', { where: { id: 'x' }, data: {} }, TID, 'User').where).toEqual({
      id: 'x',
      tenantId: TID,
    });
    expect(scopeArgs('deleteMany', { where: { id: 'x' } }, TID, 'User').where).toEqual({
      id: 'x',
      tenantId: TID,
    });
  });

  it('never scopes unscoped models (Tenant, Permission)', () => {
    const args = { where: { slug: 'x' } };
    expect(scopeArgs('findFirst', args, TID, 'Tenant')).toBe(args);
    expect(scopeArgs('findMany', args, TID, 'Permission')).toBe(args);
  });

  it('is a no-op when there is no tenant in context', () => {
    const args = { where: { status: 'NEW' } };
    expect(scopeArgs('findMany', args, undefined, 'Lead')).toBe(args);
  });

  it('does not touch unique-key ops (findUnique)', () => {
    const out = scopeArgs('findUnique', { where: { id: 'x' } }, TID, 'Lead');
    expect(out.where).toEqual({ id: 'x' }); // no tenantId added
  });
});
