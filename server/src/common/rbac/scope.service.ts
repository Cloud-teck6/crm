import { Injectable } from '@nestjs/common';
import { DataScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../types/auth-user';

/**
 * Resolves the set of owner ids a user may see, per their role's data scope.
 * Returns `null` for TENANT scope (no ownership restriction — see everything in
 * the tenant). Record queries combine this with `ownerScopeWhere` and the
 * Prisma tenant extension (which adds tenantId) for full isolation.
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async visibleOwnerIds(user: AuthUser): Promise<string[] | null> {
    switch (user.dataScope) {
      case DataScope.TENANT:
        return null;
      case DataScope.TEAM:
        return user.teamId
          ? this.idsByGroup({ teamId: user.teamId }, user.id)
          : [user.id];
      case DataScope.TERRITORY:
        return user.territoryId
          ? this.idsByGroup({ territoryId: user.territoryId }, user.id)
          : [user.id];
      case DataScope.OWN:
      default:
        return [user.id];
    }
  }

  /** Whether the user may act on a record owned by `ownerId`. */
  async canSeeOwner(user: AuthUser, ownerId: string | null): Promise<boolean> {
    const ids = await this.visibleOwnerIds(user);
    if (ids === null) return true; // TENANT
    if (!ownerId) return false; // unowned visible only to TENANT scope
    return ids.includes(ownerId);
  }

  private async idsByGroup(
    where: { teamId?: string; territoryId?: string },
    selfId: string,
  ): Promise<string[]> {
    const members = await this.prisma.client.user.findMany({
      where: { ...where, deletedAt: null },
      select: { id: true },
    });
    return Array.from(new Set([selfId, ...members.map((m) => m.id)]));
  }
}
