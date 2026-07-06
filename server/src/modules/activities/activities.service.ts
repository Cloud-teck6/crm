import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../../common/rbac/scope.service';
import { AuthUser } from '../../common/types/auth-user';
import { ownerScopeWhere, parsePagination } from '../../common/crud/crud.util';
import { CreateActivityDto, UpdateActivityDto } from './dto/activities.dto';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  async list(
    user: AuthUser,
    query: {
      page?: string;
      pageSize?: string;
      type?: string;
      leadId?: string;
      contactId?: string;
      dealId?: string;
      completed?: string;
      mine?: string;
    },
  ) {
    const { take, skip, page, pageSize } = parsePagination(query.page, query.pageSize);
    const ownerIds = await this.scope.visibleOwnerIds(user);
    const where: any = {
      deletedAt: null,
      ...ownerScopeWhere(query.mine === 'true' ? [user.id] : ownerIds, 'assigneeId'),
      ...(query.type ? { type: query.type } : {}),
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.dealId ? { dealId: query.dealId } : {}),
      ...(query.completed === 'true' ? { completedAt: { not: null } } : {}),
      ...(query.completed === 'false' ? { completedAt: null } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.client.activity.findMany({
        where,
        orderBy: [{ completedAt: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.client.activity.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Full timeline for one record (no scope filter — caller already sees it). */
  timeline(recordType: 'lead' | 'contact' | 'deal', recordId: string) {
    const key = { lead: 'leadId', contact: 'contactId', deal: 'dealId' }[recordType];
    if (!key) throw new BadRequestException('Invalid record type');
    return this.prisma.client.activity.findMany({
      where: { deletedAt: null, [key]: recordId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const activity = await this.prisma.client.activity.findFirst({ where: { id, deletedAt: null } });
    if (!activity) throw new NotFoundException('Activity not found');
    const ids = await this.scope.visibleOwnerIds(user);
    if (ids !== null && (!activity.assigneeId || !ids.includes(activity.assigneeId))) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }

  async create(user: AuthUser, dto: CreateActivityDto) {
    if (!dto.leadId && !dto.contactId && !dto.dealId) {
      throw new BadRequestException('Link the activity to a lead, contact or deal');
    }
    const activity = await this.prisma.client.activity.create({
      data: {
        type: dto.type,
        subject: dto.subject ?? null,
        body: dto.body ?? null,
        assigneeId: dto.assigneeId ?? user.id,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        leadId: dto.leadId ?? null,
        contactId: dto.contactId ?? null,
        dealId: dto.dealId ?? null,
        createdById: user.id,
      } as any,
    });
    await this.audit.log({ action: 'activity.create', resource: 'Activity', resourceId: activity.id, after: { type: activity.type } });
    return activity;
  }

  async update(user: AuthUser, id: string, dto: UpdateActivityDto) {
    await this.get(user, id);
    await this.prisma.client.activity.updateMany({
      where: { id },
      data: {
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
      },
    });
    await this.audit.log({ action: 'activity.update', resource: 'Activity', resourceId: id });
    return this.get(user, id);
  }

  async setCompleted(user: AuthUser, id: string, completed: boolean) {
    await this.get(user, id);
    await this.prisma.client.activity.updateMany({
      where: { id },
      data: { completedAt: completed ? new Date() : null },
    });
    await this.audit.log({ action: completed ? 'activity.complete' : 'activity.reopen', resource: 'Activity', resourceId: id });
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.client.activity.updateMany({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ action: 'activity.delete', resource: 'Activity', resourceId: id });
    return { ok: true };
  }
}
