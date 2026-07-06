import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ScopeService } from '../../common/rbac/scope.service';
import { AuthUser } from '../../common/types/auth-user';

interface Range {
  from: Date;
  to: Date;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  private range(q: { from?: string; to?: string }): Range {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86400000);
    return { from, to };
  }

  private async ownerFilter(user: AuthUser, field = 'ownerId') {
    const ids = await this.scope.visibleOwnerIds(user);
    return ids ? { [field]: { in: ids } } : {};
  }

  /** Headline KPI cards. */
  async kpis(user: AuthUser, q: { from?: string; to?: string }) {
    const { from, to } = this.range(q);
    const own = await this.ownerFilter(user);
    const leadWhere = { tenantId: user.tenantId, deletedAt: null, ...own } as any;
    const dealWhere = { tenantId: user.tenantId, deletedAt: null, ...own } as any;

    const [totalLeads, newLeads, openDeals, wonAgg, closedDeals, wonDeals, forecast] = await Promise.all([
      this.prisma.client.lead.count({ where: leadWhere }),
      this.prisma.client.lead.count({ where: { ...leadWhere, createdAt: { gte: from, lte: to } } }),
      this.prisma.client.deal.count({ where: { ...dealWhere, stage: { isWon: false, isLost: false } } }),
      this.prisma.client.deal.aggregate({ where: { ...dealWhere, stage: { isWon: true } }, _sum: { value: true } }),
      this.prisma.client.deal.count({ where: { ...dealWhere, stage: { OR: [{ isWon: true }, { isLost: true }] } } }),
      this.prisma.client.deal.count({ where: { ...dealWhere, stage: { isWon: true } } }),
      this.prisma.client.deal.findMany({
        where: { ...dealWhere, stage: { isWon: false, isLost: false } },
        select: { value: true, probability: true },
      }),
    ]);

    const weightedForecast = forecast.reduce((s, d) => s + Number(d.value) * (d.probability / 100), 0);
    const winRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
    const speedToLeadMins = await this.avgSpeedToLead(user, from, to);

    return {
      totalLeads,
      newLeads,
      openDeals,
      wonValue: Number(wonAgg._sum.value ?? 0),
      weightedForecast: Math.round(weightedForecast),
      winRate,
      avgSpeedToLeadMins: speedToLeadMins,
    };
  }

  /** Leads by source with conversion + (optional) cost-per-lead from settings. */
  async leadsBySource(user: AuthUser, q: { from?: string; to?: string }) {
    const { from, to } = this.range(q);
    const own = await this.ownerFilter(user);
    const where = { tenantId: user.tenantId, deletedAt: null, createdAt: { gte: from, lte: to }, ...own } as any;

    const [grouped, converted, tenant] = await Promise.all([
      this.prisma.client.lead.groupBy({ by: ['source'], where, _count: { _all: true } }),
      this.prisma.client.lead.groupBy({ by: ['source'], where: { ...where, status: 'CONVERTED' }, _count: { _all: true } }),
      this.prisma.client.tenant.findFirst({ where: { id: user.tenantId } }),
    ]);
    const convMap = new Map(converted.map((c) => [c.source, c._count._all]));
    const spend = ((tenant?.settings as any)?.adSpend ?? {}) as Record<string, number>;

    return grouped
      .map((g) => {
        const count = g._count._all;
        const source = g.source ?? 'unknown';
        const spendAmt = spend[source];
        return {
          source,
          count,
          converted: convMap.get(g.source) ?? 0,
          costPerLead: spendAmt && count > 0 ? Math.round(spendAmt / count) : null,
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  /** Conversion funnel: deals per stage in a pipeline. */
  async conversionByStage(user: AuthUser, q: { pipelineId?: string }) {
    const own = await this.ownerFilter(user);
    const pipeline = q.pipelineId
      ? await this.prisma.client.pipeline.findFirst({ where: { id: q.pipelineId, deletedAt: null }, include: { stages: { orderBy: { order: 'asc' } } } })
      : await this.prisma.client.pipeline.findFirst({ where: { deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], include: { stages: { orderBy: { order: 'asc' } } } });
    if (!pipeline) return { pipeline: null, stages: [] };

    const grouped = await this.prisma.client.deal.groupBy({
      by: ['stageId'],
      where: { tenantId: user.tenantId, deletedAt: null, pipelineId: pipeline.id, ...own } as any,
      _count: { _all: true },
      _sum: { value: true },
    });
    const map = new Map(grouped.map((g) => [g.stageId, g]));
    const stages = pipeline.stages.map((s) => ({
      stageId: s.id,
      name: s.name,
      order: s.order,
      isWon: s.isWon,
      isLost: s.isLost,
      count: map.get(s.id)?._count._all ?? 0,
      value: Number(map.get(s.id)?._sum.value ?? 0),
    }));
    return { pipeline: { id: pipeline.id, name: pipeline.name }, stages };
  }

  /** Rep activity leaderboard. */
  async repActivity(user: AuthUser, q: { from?: string; to?: string }) {
    const { from, to } = this.range(q);
    const ids = await this.scope.visibleOwnerIds(user);
    const userWhere: any = { tenantId: user.tenantId, status: 'ACTIVE', deletedAt: null };
    if (ids) userWhere.id = { in: ids };
    const users = await this.prisma.client.user.findMany({ where: userWhere, select: { id: true, fullName: true } });
    const dateIn = { gte: from, lte: to };

    const rows = await Promise.all(
      users.map(async (u) => {
        const [leads, wonAgg, activities, messages, calls] = await Promise.all([
          this.prisma.client.lead.count({ where: { tenantId: user.tenantId, ownerId: u.id, deletedAt: null, createdAt: dateIn } }),
          this.prisma.client.deal.aggregate({ where: { tenantId: user.tenantId, ownerId: u.id, deletedAt: null, stage: { isWon: true } }, _sum: { value: true } }),
          this.prisma.client.activity.count({ where: { tenantId: user.tenantId, assigneeId: u.id, deletedAt: null, createdAt: dateIn } }),
          this.prisma.client.message.count({ where: { tenantId: user.tenantId, ownerId: u.id, direction: 'OUTBOUND', createdAt: dateIn } }),
          this.prisma.client.call.count({ where: { tenantId: user.tenantId, ownerId: u.id, createdAt: dateIn } }),
        ]);
        return { userId: u.id, name: u.fullName, leads, wonValue: Number(wonAgg._sum.value ?? 0), activities, messages, calls };
      }),
    );
    return rows.sort((a, b) => b.wonValue - a.wonValue || b.leads - a.leads);
  }

  /** Source/campaign attribution → conversion. */
  async attribution(user: AuthUser, q: { from?: string; to?: string }) {
    const { from, to } = this.range(q);
    const own = await this.ownerFilter(user);
    const where = { tenantId: user.tenantId, deletedAt: null, createdAt: { gte: from, lte: to }, ...own } as any;
    const grouped = await this.prisma.client.lead.groupBy({ by: ['source', 'campaign'], where, _count: { _all: true } });
    const converted = await this.prisma.client.lead.groupBy({ by: ['source', 'campaign'], where: { ...where, status: 'CONVERTED' }, _count: { _all: true } });
    const key = (s: any, c: any) => `${s ?? ''}|${c ?? ''}`;
    const convMap = new Map(converted.map((c) => [key(c.source, c.campaign), c._count._all]));
    return grouped
      .map((g) => {
        const leads = g._count._all;
        const conv = convMap.get(key(g.source, g.campaign)) ?? 0;
        return { source: g.source ?? 'unknown', campaign: g.campaign ?? '—', leads, converted: conv, conversionRate: leads ? Math.round((conv / leads) * 100) : 0 };
      })
      .sort((a, b) => b.leads - a.leads);
  }

  private async avgSpeedToLead(user: AuthUser, from: Date, to: Date): Promise<number | null> {
    const own = await this.ownerFilter(user);
    const leads = await this.prisma.client.lead.findMany({
      where: { tenantId: user.tenantId, deletedAt: null, createdAt: { gte: from, lte: to }, ...own } as any,
      select: { id: true, createdAt: true },
      take: 1000,
    });
    if (leads.length === 0) return null;
    const ids = leads.map((l) => l.id);
    const [msgMin, actMin] = await Promise.all([
      this.prisma.client.message.groupBy({ by: ['leadId'], where: { tenantId: user.tenantId, leadId: { in: ids }, direction: 'OUTBOUND' }, _min: { createdAt: true } }),
      this.prisma.client.activity.groupBy({ by: ['leadId'], where: { tenantId: user.tenantId, leadId: { in: ids }, deletedAt: null }, _min: { createdAt: true } }),
    ]);
    const first = new Map<string, number>();
    const consider = (leadId: string | null, at?: Date | null) => {
      if (!leadId || !at) return;
      const t = new Date(at).getTime();
      if (!first.has(leadId) || t < first.get(leadId)!) first.set(leadId, t);
    };
    msgMin.forEach((m) => consider(m.leadId, m._min.createdAt));
    actMin.forEach((a) => consider(a.leadId, a._min.createdAt));

    const diffs: number[] = [];
    for (const l of leads) {
      const ft = first.get(l.id);
      if (ft) diffs.push((ft - new Date(l.createdAt).getTime()) / 60000);
    }
    if (diffs.length === 0) return null;
    return Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length);
  }
}
