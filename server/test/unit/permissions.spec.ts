import {
  expandPermissions,
  PERMISSION_KEYS,
  PERMISSIONS,
} from '../../src/common/config/permissions';

describe('RBAC permission catalog', () => {
  it('generates "<resource>:<action>" keys with no duplicates', () => {
    expect(PERMISSION_KEYS.length).toBeGreaterThan(20);
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    expect(PERMISSION_KEYS).toContain('user:create');
    expect(PERMISSION_KEYS).toContain('audit:view');
    PERMISSIONS.forEach((p) => expect(p.key).toBe(`${p.resource}:${p.action}`));
  });

  it('expands "*" to every permission', () => {
    const expanded = expandPermissions(['*']);
    PERMISSION_KEYS.forEach((k) => expect(expanded.has(k)).toBe(true));
  });

  it('expands "<resource>:manage" to all actions on that resource', () => {
    const expanded = expandPermissions(['settings:manage']);
    expect(expanded.has('settings:manage')).toBe(true);
    expect(expanded.has('settings:view')).toBe(true);
    // does not leak to other resources
    expect(expanded.has('user:create')).toBe(false);
  });

  it('preserves plain keys and never invents extras', () => {
    const expanded = expandPermissions(['lead:view', 'lead:create']);
    expect(expanded.has('lead:view')).toBe(true);
    expect(expanded.has('lead:create')).toBe(true);
    expect(expanded.has('lead:delete')).toBe(false);
  });
});
