// Canonical permission catalog. The single source of truth for RBAC keys,
// referenced by the seed (to populate the Permission table + default roles),
// by the PermissionsGuard (enforcement), and exposed to the web app (so the
// role editor can render the full grid). Format: "<resource>:<action>".

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'export'
  | 'assign'
  | 'manage';

export interface PermissionDef {
  key: string;
  resource: string;
  action: PermissionAction;
  description: string;
}

interface ResourceDef {
  resource: string;
  label: string;
  actions: PermissionAction[];
}

// Each CRM resource and the actions that apply to it.
const RESOURCES: ResourceDef[] = [
  { resource: 'lead', label: 'Leads', actions: ['view', 'create', 'edit', 'delete', 'export', 'assign'] },
  { resource: 'contact', label: 'Contacts', actions: ['view', 'create', 'edit', 'delete', 'export', 'assign'] },
  { resource: 'account', label: 'Accounts', actions: ['view', 'create', 'edit', 'delete', 'export', 'assign'] },
  { resource: 'deal', label: 'Deals', actions: ['view', 'create', 'edit', 'delete', 'export', 'assign'] },
  { resource: 'pipeline', label: 'Pipelines', actions: ['view', 'manage'] },
  { resource: 'activity', label: 'Activities', actions: ['view', 'create', 'edit', 'delete'] },
  { resource: 'message', label: 'Messages', actions: ['view', 'create'] },
  { resource: 'call', label: 'Calls', actions: ['view', 'create'] },
  { resource: 'workflow', label: 'Workflows', actions: ['view', 'manage'] },
  { resource: 'report', label: 'Reports', actions: ['view', 'manage', 'export'] },
  { resource: 'dashboard', label: 'Dashboards', actions: ['view', 'manage'] },
  { resource: 'integration', label: 'Integrations', actions: ['view', 'manage'] },
  { resource: 'import', label: 'Imports', actions: ['create'] },
  { resource: 'export', label: 'Exports', actions: ['create'] },
  { resource: 'user', label: 'Users', actions: ['view', 'create', 'edit', 'delete'] },
  { resource: 'role', label: 'Roles', actions: ['view', 'create', 'edit', 'delete'] },
  { resource: 'team', label: 'Teams', actions: ['view', 'manage'] },
  { resource: 'audit', label: 'Audit log', actions: ['view', 'export'] },
  { resource: 'settings', label: 'Settings', actions: ['view', 'manage'] },
  { resource: 'custom_field', label: 'Custom fields', actions: ['view', 'manage'] },
];

export const PERMISSIONS: PermissionDef[] = RESOURCES.flatMap((r) =>
  r.actions.map((action) => ({
    key: `${r.resource}:${action}`,
    resource: r.resource,
    action,
    description: `${action} ${r.label.toLowerCase()}`,
  })),
);

export const PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key);

export const RESOURCE_LABELS: Record<string, string> = Object.fromEntries(
  RESOURCES.map((r) => [r.resource, r.label]),
);

// "manage" implies all other actions on the same resource. The guard expands
// these so a role with "settings:manage" also satisfies "settings:view".
export function expandPermissions(keys: string[]): Set<string> {
  const expanded = new Set<string>(keys);
  if (expanded.has('*')) {
    PERMISSION_KEYS.forEach((k) => expanded.add(k));
    return expanded;
  }
  for (const key of keys) {
    const [resource, action] = key.split(':');
    if (action === 'manage') {
      PERMISSIONS.filter((p) => p.resource === resource).forEach((p) => expanded.add(p.key));
    }
  }
  return expanded;
}

// ── Default seeded roles (per tenant). `*` = wildcard (all permissions). ──
export interface DefaultRole {
  name: string;
  description: string;
  dataScope: 'OWN' | 'TEAM' | 'TERRITORY' | 'TENANT';
  permissions: string[];
}

const allButAdmin = PERMISSION_KEYS.filter(
  (k) => !k.startsWith('role:') && !k.startsWith('settings:') && k !== 'user:delete',
);

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    name: 'Super Admin',
    description: 'Full access to everything in the workspace.',
    dataScope: 'TENANT',
    permissions: ['*'],
  },
  {
    name: 'Admin',
    description: 'Administers users, roles and settings.',
    dataScope: 'TENANT',
    permissions: PERMISSION_KEYS,
  },
  {
    name: 'Manager',
    description: "Sees and manages the whole team's records.",
    dataScope: 'TEAM',
    permissions: allButAdmin,
  },
  {
    name: 'Team Lead',
    description: "Manages their team's pipeline.",
    dataScope: 'TEAM',
    permissions: allButAdmin.filter((k) => !k.endsWith(':delete')),
  },
  {
    name: 'Sales Rep',
    description: 'Works their own assigned records.',
    dataScope: 'OWN',
    permissions: [
      'lead:view', 'lead:create', 'lead:edit',
      'contact:view', 'contact:create', 'contact:edit',
      'account:view', 'account:create', 'account:edit',
      'deal:view', 'deal:create', 'deal:edit',
      'activity:view', 'activity:create', 'activity:edit',
      'message:view', 'message:create',
      'call:view', 'call:create',
      'pipeline:view', 'dashboard:view', 'report:view',
    ],
  },
  {
    name: 'Marketing/Ops',
    description: 'Manages campaigns, imports and integrations.',
    dataScope: 'TENANT',
    permissions: [
      'lead:view', 'lead:create', 'lead:edit', 'lead:export', 'lead:assign',
      'contact:view', 'contact:export',
      'report:view', 'report:export', 'dashboard:view',
      'integration:view', 'integration:manage',
      'import:create', 'export:create', 'custom_field:view', 'custom_field:manage',
    ],
  },
  {
    name: 'Read-Only / Client',
    description: 'Read-only access to dashboards and their own records.',
    dataScope: 'OWN',
    permissions: ['lead:view', 'contact:view', 'deal:view', 'dashboard:view', 'report:view'],
  },
];
