import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../../common/rbac/scope.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { AutomationService } from '../automation/automation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/types/auth-user';
import { ownerScopeWhere, parsePagination, restrict } from '../../common/crud/crud.util';
import { CreateDealDto, UpdateDealDto } from './dto/deals.dto';

const DAY_MS = 86_400_000;

const DEAL_INCLUDE = {
  stage: { select: { id: true, name: true, order: true, isWon: true, isLost: true } },
  pipeline: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  account: { select: { id: true, name: true } },
} as const;

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly customFields: CustomFieldsService,
    private readonly automation: AutomationService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    user: AuthUser,
    query: { page?: string; pageSize?: string; q?: string; pipelineId?: string; stageId?: string },
  ) {
    const { take, skip, page, pageSize } = parsePagination(query.page, query.pageSize);
    const ownerIds = await this.scope.visibleOwnerIds(user);
    const where: any = {
      deletedAt: null,
      ...ownerScopeWhere(ownerIds),
      ...(query.pipelineId ? { pipelineId: query.pipelineId } : {}),
      ...(query.stageId ? { stageId: query.stageId } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.client.deal.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take, include: DEAL_INCLUDE }),
      this.prisma.client.deal.count({ where }),
    ]);
    return { items: restrict(items, 'deal', user), total, page, pageSize };
  }

  /** Kanban board: stages with their (scoped) deals, aging + weighted totals. */
  async board(user: AuthUser, pipelineId?: string) {
    const pipeline = pipelineId
      ? await this.prisma.client.pipeline.findFirst({
          where: { id: pipelineId, deletedAt: null },
          include: { stages: { orderBy: { order: 'asc' } } },
        })
      : await this.prisma.client.pipeline.findFirst({
          where: { deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          include: { stages: { orderBy: { order: 'asc' } } },
        });
    if (!pipeline) return { pipeline: null, columns: [] };

    const ownerIds = await this.scope.visibleOwnerIds(user);
    const deals = await this.prisma.client.deal.findMany({
      where: { deletedAt: null, pipelineId: pipeline.id, ...ownerScopeWhere(ownerIds) },
      orderBy: { stageEnteredAt: 'asc' },
      include: DEAL_INCLUDE,
    });

    const now = Date.now();
    const byStage = new Map<string, any[]>();
    for (const stage of pipeline.stages) byStage.set(stage.id, []);
    for (const deal of deals) {
      const daysInStage = Math.floor((now - new Date(deal.stageEnteredAt).getTime()) / DAY_MS);
      const stageDef = pipeline.stages.find((s) => s.id === deal.stageId);
      const isRotting = !!stageDef?.rotDays && daysInStage > stageDef.rotDays;
      const enriched = { ...restrict(deal, 'deal', user), daysInStage, isRotting };
      byStage.get(deal.stageId)?.push(enriched);
    }

    const columns = pipeline.stages.map((stage) => {
      const stageDeals = byStage.get(stage.id) ?? [];
      const total = stageDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);
      const weighted = stageDeals.reduce((s, d) => s + (Number(d.value ?? 0) * stage.probability) / 100, 0);
      return {
        id: stage.id,
        name: stage.name,
        order: stage.order,
        probability: stage.probability,
        isWon: stage.isWon,
        isLost: stage.isLost,
        rotDays: stage.rotDays,
        count: stageDeals.length,
        total,
        weighted,
        deals: stageDeals,
      };
    });

    return { pipeline: { id: pipeline.id, name: pipeline.name }, columns };
  }

  async get(user: AuthUser, id: string) {
    const deal = await this.prisma.client.deal.findFirst({ where: { id, deletedAt: null }, include: DEAL_INCLUDE });
    if (!deal || !(await this.scope.canSeeOwner(user, deal.ownerId))) {
      throw new NotFoundException('Deal not found');
    }
    return restrict(deal, 'deal', user);
  }

  async create(user: AuthUser, dto: CreateDealDto) {
    const { stage } = await this.resolveStage(dto.pipelineId, dto.stageId);
    const customFields = await this.customFields.validateValues('Deal', dto.customFields);
    const deal = await this.prisma.client.deal.create({
      data: {
        title: dto.title,
        pipelineId: dto.pipelineId,
        stageId: stage.id,
        value: dto.value ?? 0,
        currency: dto.currency ?? 'INR',
        probability: dto.probability ?? stage.probability,
        contactId: dto.contactId ?? null,
        accountId: dto.accountId ?? null,
        ownerId: dto.ownerId ?? user.id,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
        stageEnteredAt: new Date(),
        tags: dto.tags ?? [],
        customFields,
        createdById: user.id,
      } as any,
    });
    await this.audit.log({ action: 'deal.create', resource: 'Deal', resourceId: deal.id, after: { title: deal.title, stageId: stage.id } });
    return this.get(user, deal.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateDealDto) {
    await this.get(user, id);
    const data: any = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.value !== undefined ? { value: dto.value } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.contactId !== undefined ? { contactId: dto.contactId } : {}),
      ...(dto.accountId !== undefined ? { accountId: dto.accountId } : {}),
      ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
      ...(dto.probability !== undefined ? { probability: dto.probability } : {}),
      ...(dto.expectedCloseDate !== undefined
        ? { expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null }
        : {}),
      ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
    };
    if (dto.customFields !== undefined) {
      const current = await this.prisma.client.deal.findFirst({ where: { id }, select: { customFields: true } });
      data.customFields = await this.customFields.mergeAndValidate('Deal', current?.customFields as any, dto.customFields);
    }
    await this.prisma.client.deal.updateMany({ where: { id }, data });
    await this.audit.log({ action: 'deal.update', resource: 'Deal', resourceId: id });
    return this.get(user, id);
  }

  /** Kanban move: change stage, reset aging, sync probability to the stage. */
  async move(user: AuthUser, id: string, stageId: string) {
    const deal = await this.prisma.client.deal.findFirst({ where: { id, deletedAt: null } });
    if (!deal || !(await this.scope.canSeeOwner(user, deal.ownerId))) {
      throw new NotFoundException('Deal not found');
    }
    const stage = await this.prisma.client.stage.findFirst({ where: { id: stageId, pipelineId: deal.pipelineId } });
    if (!stage) throw new BadRequestException('Stage does not belong to this deal\'s pipeline');

    await this.prisma.client.deal.updateMany({
      where: { id },
      data: { stageId, stageEnteredAt: new Date(), probability: stage.probability },
    });
    await this.audit.log({
      action: 'deal.move',
      resource: 'Deal',
      resourceId: id,
      before: { stageId: deal.stageId },
      after: { stageId },
    });
    const moved = await this.prisma.client.deal.findFirst({ where: { id } });
    await this.automation.onDealStageChanged(user.tenantId, moved);
    if (moved?.ownerId) {
      await this.notifications.notify({
        tenantId: user.tenantId,
        userId: moved.ownerId,
        title: 'Deal stage changed',
        body: `${moved.title} moved to ${stage.name}`,
        entityRef: `Deal:${id}`,
        trigger: 'deal.stage_changed',
      });
    }
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.client.deal.updateMany({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ action: 'deal.delete', resource: 'Deal', resourceId: id });
    return { ok: true };
  }

  private async resolveStage(pipelineId: string, stageId?: string) {
    const pipeline = await this.prisma.client.pipeline.findFirst({ where: { id: pipelineId, deletedAt: null } });
    if (!pipeline) throw new BadRequestException('Pipeline not found');
    const stage = stageId
      ? await this.prisma.client.stage.findFirst({ where: { id: stageId, pipelineId } })
      : await this.prisma.client.stage.findFirst({ where: { pipelineId }, orderBy: { order: 'asc' } });
    if (!stage) throw new BadRequestException('Stage not found for pipeline');
    return { pipeline, stage };
  }
}
