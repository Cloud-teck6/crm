import { DataScope } from '@prisma/client';
import { buildScopeWhere, applyFieldRestrictions } from '../../src/common/rbac/scope.util';
import { AuthUser } from '../../src/common/types/auth-user';

function user(scope: DataScope, overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'a@b.c',
    fullName: 'A',
    roleId: 'r1',
    roleName: 'Role',
    dataScope: scope,
    permissions: new Set<string>(),
    fieldRestrictions: {},
    teamId: null,
    territoryId: null,
    ...overrides,
  };
}

describe('buildScopeWhere', () => {
  it('OWN restricts to the user only', () => {
    expect(buildScopeWhere(user(DataScope.OWN))).toEqual({ ownerId: 'u1' });
  });

  it('TEAM includes the user and teammates', () => {
    const where = buildScopeWhere(user(DataScope.TEAM), { teammateIds: ['u2', 'u3'] });
    expect(where).toEqual({ ownerId: { in: ['u1', 'u2', 'u3'] } });
  });

  it('TERRITORY includes the user and territory members', () => {
    const where = buildScopeWhere(user(DataScope.TERRITORY), { territoryMemberIds: ['u9'] });
    expect(where).toEqual({ ownerId: { in: ['u1', 'u9'] } });
  });

  it('TENANT applies no ownership restriction', () => {
    expect(buildScopeWhere(user(DataScope.TENANT))).toEqual({});
  });

  it('honours a custom owner field', () => {
    expect(buildScopeWhere(user(DataScope.OWN), { ownerField: 'assigneeId' })).toEqual({
      assigneeId: 'u1',
    });
  });
});

describe('applyFieldRestrictions', () => {
  it('removes restricted fields for the resource', () => {
    const record = { id: '1', name: 'X', salary: 100, phone: '123' };
    const out = applyFieldRestrictions(record, 'user', { user: ['salary', 'phone'] });
    expect(out).toEqual({ id: '1', name: 'X' });
  });

  it('returns the record unchanged when nothing is restricted', () => {
    const record = { id: '1', name: 'X' };
    expect(applyFieldRestrictions(record, 'user', {})).toEqual(record);
    expect(applyFieldRestrictions(record, 'user', undefined)).toEqual(record);
  });
});
