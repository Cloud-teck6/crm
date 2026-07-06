import { DataScope } from '@prisma/client';

// Shape attached to `req.user` by JwtAuthGuard and returned by @CurrentUser().
export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  roleId: string;
  roleName: string;
  dataScope: DataScope;
  permissions: Set<string>; // already expanded (manage→*, '*'→all)
  fieldRestrictions: Record<string, string[]>; // { resource: [hiddenField, ...] }
  teamId: string | null;
  territoryId: string | null;
}
