import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { evaluateConditions } from '../../common/rules/conditions';
import { CreateScoringRuleDto, UpdateScoringRuleDto } from './dto/automation.dto';

@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.client.scoringRule.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } });
  }

  async create(dto: CreateScoringRuleDto) {
    const rule = await this.prisma.client.scoringRule.create({
      data: { name: dto.name, condition: dto.condition as any, points: dto.points, isActive: dto.isActive ?? true } as any,
    });
    await this.audit.log({ action: 'scoring_rule.create', resource: 'ScoringRule', resourceId: rule.id });
    return rule;
  }

  async update(id: string, dto: UpdateScoringRuleDto) {
    const res = await this.prisma.client.scoringRule.updateMany({
      where: { id, deletedAt: null },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.condition !== undefined ? { condition: dto.condition as any } : {}),
        ...(dto.points !== undefined ? { points: dto.points } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    if (res.count === 0) throw new NotFoundException('Scoring rule not found');
    return this.prisma.client.scoringRule.findFirst({ where: { id } });
  }

  async remove(id: string) {
    const res = await this.prisma.client.scoringRule.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (res.count === 0) throw new NotFoundException('Scoring rule not found');
    return { ok: true };
  }

  /** Compute and persist a lead's score from active rules (tenant-explicit). */
  async scoreLead(tenantId: string, lead: any): Promise<number> {
    const rules = await this.prisma.client.scoringRule.findMany({ where: { tenantId, isActive: true, deletedAt: null } });
    let score = 0;
    for (const rule of rules) {
      if (evaluateConditions(rule.condition as any, lead)) score += rule.points;
    }
    await this.prisma.client.lead.updateMany({ where: { id: lead.id, tenantId }, data: { score } });
    return score;
  }
}
