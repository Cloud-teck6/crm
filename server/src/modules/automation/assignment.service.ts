import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { evaluateConditions, ConditionGroup } from '../../common/rules/conditions';

export interface AssignmentOptions {
  strategy?: 'load_balanced' | 'round_robin' | 'rule_based' | 'territory';
  assigneeId?: string; // assign to a specific user
  roleId?: string; // restrict the candidate pool to a role (e.g. senior reps)
  territoryId?: string;
  rules?: Array<{ condition: ConditionGroup; assigneeId: string }>;
}

/**
 * Owner routing. All queries are tenant-explicit so the engine works both in an
 * authenticated request and in the (context-less) ingestion path.
 */
@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(tenantId: string, lead: any, opts: AssignmentOptions = {}): Promise<string | null> {
    // Explicit user wins.
    if (opts.assigneeId && (await this.isActive(tenantId, opts.assigneeId))) return opts.assigneeId;

    // Rule-based: first matching rule's assignee.
    if (opts.strategy === 'rule_based' && opts.rules) {
      for (const rule of opts.rules) {
        if (evaluateConditions(rule.condition, lead) && (await this.isActive(tenantId, rule.assigneeId))) {
          return rule.assigneeId;
        }
      }
    }

    const candidates = await this.candidatePool(tenantId, opts);
    if (candidates.length === 0) return null;

    if (opts.strategy === 'round_robin') {
      const total = await this.prisma.client.lead.count({ where: { tenantId, deletedAt: null } });
      return candidates[total % candidates.length];
    }

    // Default: load-balanced (fewest open leads).
    return this.leastLoaded(tenantId, candidates);
  }

  private async candidatePool(tenantId: string, opts: AssignmentOptions): Promise<string[]> {
    const where: any = { tenantId, status: 'ACTIVE', deletedAt: null };
    if (opts.roleId) where.roleId = opts.roleId;
    if (opts.strategy === 'territory' && opts.territoryId) where.territoryId = opts.territoryId;
    const users = await this.prisma.client.user.findMany({ where, select: { id: true }, orderBy: { id: 'asc' } });
    return users.map((u) => u.id);
  }

  private async leastLoaded(tenantId: string, candidates: string[]): Promise<string> {
    const counts = await Promise.all(
      candidates.map(async (id) => ({
        id,
        n: await this.prisma.client.lead.count({ where: { tenantId, ownerId: id, deletedAt: null } }),
      })),
    );
    counts.sort((a, b) => a.n - b.n);
    return counts[0].id;
  }

  private async isActive(tenantId: string, userId: string): Promise<boolean> {
    const u = await this.prisma.client.user.findFirst({
      where: { id: userId, tenantId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    return !!u;
  }
}
