import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../../common/rbac/scope.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { AutomationService } from '../automation/automation.service';
import { AuthUser } from '../../common/types/auth-user';
import { ownerScopeWhere, parsePagination, restrict } from '../../common/crud/crud.util';
import { CreateLeadDto, UpdateLeadDto, ConvertLeadDto } from './dto/leads.dto';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly customFields: CustomFieldsService,
    private readonly automation: AutomationService,
  ) {}

  async list(
    user: AuthUser,
    query: { page?: string; pageSize?: string; q?: string; status?: string; source?: string },
  ) {
    const { take, skip, page, pageSize } = parsePagination(query.page, query.pageSize);
    const ownerIds = await this.scope.visibleOwnerIds(user);
    const where: any = {
      deletedAt: null,
      ...ownerScopeWhere(ownerIds),
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
    };
    if (query.q) {
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q } },
        { company: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.client.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.client.lead.count({ where }),
    ]);
    return { items: restrict(items, 'lead', user), total, page, pageSize };
  }

  async get(user: AuthUser, id: string) {
    const lead = await this.prisma.client.lead.findFirst({ where: { id, deletedAt: null } });
    if (!lead || !(await this.scope.canSeeOwner(user, lead.ownerId))) {
      throw new NotFoundException('Lead not found');
    }
    return restrict(lead, 'lead', user);
  }

  /** Dedup groundwork: existing leads/contacts matching email or phone. */
  async findDuplicates(email?: string, phone?: string) {
    if (!email && !phone) return { leads: [], contacts: [] };
    const or: any[] = [];
    if (email) or.push({ email: email.toLowerCase() });
    if (phone) or.push({ phone });
    const [leads, contacts] = await Promise.all([
      this.prisma.client.lead.findMany({ where: { deletedAt: null, OR: or }, take: 10 }),
      this.prisma.client.contact.findMany({ where: { deletedAt: null, OR: or }, take: 10 }),
    ]);
    return { leads, contacts };
  }

  async create(user: AuthUser, dto: CreateLeadDto) {
    const customFields = await this.customFields.validateValues('Lead', dto.customFields);
    const lead = await this.prisma.client.lead.create({
      data: {
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        email: dto.email?.toLowerCase() ?? null,
        phone: dto.phone ?? null,
        company: dto.company ?? null,
        source: dto.source ?? 'manual',
        campaign: dto.campaign ?? null,
        status: dto.status ?? 'NEW',
        score: dto.score ?? 0,
        ownerId: dto.ownerId ?? user.id,
        tags: dto.tags ?? [],
        customFields,
        createdById: user.id,
      } as any,
    });
    await this.audit.log({ action: 'lead.create', resource: 'Lead', resourceId: lead.id, after: { email: lead.email, source: lead.source } });
    // Scoring + workflow automation (may re-assign owner, add tags, etc.).
    await this.automation.onLeadCreated(user.tenantId, lead);
    const fresh = await this.prisma.client.lead.findFirst({ where: { id: lead.id } });
    return restrict(fresh ?? lead, 'lead', user);
  }

  async update(user: AuthUser, id: string, dto: UpdateLeadDto) {
    const before = await this.get(user, id);
    const data: any = {
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.email !== undefined ? { email: dto.email?.toLowerCase() ?? null } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.company !== undefined ? { company: dto.company } : {}),
      ...(dto.source !== undefined ? { source: dto.source } : {}),
      ...(dto.campaign !== undefined ? { campaign: dto.campaign } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.score !== undefined ? { score: dto.score } : {}),
      ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
      ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
    };
    if (dto.customFields !== undefined) {
      const current = await this.prisma.client.lead.findFirst({ where: { id }, select: { customFields: true } });
      data.customFields = await this.customFields.mergeAndValidate('Lead', current?.customFields as any, dto.customFields);
    }
    await this.prisma.client.lead.updateMany({ where: { id }, data });
    await this.audit.log({ action: 'lead.update', resource: 'Lead', resourceId: id, before: { status: (before as any).status } });
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.client.lead.updateMany({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ action: 'lead.delete', resource: 'Lead', resourceId: id });
    return { ok: true };
  }

  /** Convert a lead into a contact (+ optional account + deal). */
  async convert(user: AuthUser, id: string, dto: ConvertLeadDto) {
    const lead = await this.prisma.client.lead.findFirst({ where: { id, deletedAt: null } });
    if (!lead || !(await this.scope.canSeeOwner(user, lead.ownerId))) {
      throw new NotFoundException('Lead not found');
    }
    if (lead.status === 'CONVERTED') throw new BadRequestException('Lead is already converted');

    // Authorize what the conversion will actually create (the route only
    // guarantees lead:edit + contact:create).
    if (dto.createAccount && !user.permissions.has('account:create')) {
      throw new ForbiddenException('Missing permission: account:create');
    }
    if (dto.createDeal && !user.permissions.has('deal:create')) {
      throw new ForbiddenException('Missing permission: deal:create');
    }

    // 1. Account (optional)
    let accountId: string | null = null;
    if (dto.createAccount && lead.company) {
      const account = await this.prisma.client.account.create({
        data: { name: lead.company, ownerId: lead.ownerId ?? user.id, createdById: user.id } as any,
      });
      accountId = account.id;
    }

    // 2. Contact — link existing, dedup by email/phone, or create new.
    let contactId = dto.contactId ?? null;
    if (contactId) {
      const existing = await this.prisma.client.contact.findFirst({ where: { id: contactId, deletedAt: null } });
      if (!existing) throw new BadRequestException('contactId not found');
    } else {
      const dupOr: any[] = [];
      if (lead.email) dupOr.push({ email: lead.email });
      if (lead.phone) dupOr.push({ phone: lead.phone });
      const dupe = dupOr.length
        ? await this.prisma.client.contact.findFirst({ where: { deletedAt: null, OR: dupOr } })
        : null;
      if (dupe) {
        contactId = dupe.id;
        if (accountId) {
          await this.prisma.client.contact.updateMany({ where: { id: dupe.id }, data: { accountId } });
        }
      } else {
        const contact = await this.prisma.client.contact.create({
          data: {
            firstName: lead.firstName,
            lastName: lead.lastName,
            email: lead.email,
            phone: lead.phone,
            accountId,
            ownerId: lead.ownerId ?? user.id,
            createdById: user.id,
          } as any,
        });
        contactId = contact.id;
      }
    }

    // 3. Deal (optional)
    let dealId: string | null = null;
    if (dto.createDeal) {
      const { pipelineId, stageId } = await this.resolvePipelineStage(dto.pipelineId, dto.stageId);
      const deal = await this.prisma.client.deal.create({
        data: {
          title: dto.dealTitle || lead.company || `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'New deal',
          pipelineId,
          stageId,
          contactId,
          accountId,
          ownerId: lead.ownerId ?? user.id,
          createdById: user.id,
        } as any,
      });
      dealId = deal.id;
    }

    // 4. Mark the lead converted + link the contact.
    await this.prisma.client.lead.updateMany({
      where: { id: lead.id },
      data: { status: 'CONVERTED', contactId },
    });
    await this.audit.log({
      action: 'lead.convert',
      resource: 'Lead',
      resourceId: lead.id,
      after: { contactId, accountId, dealId },
    });

    return { leadId: lead.id, contactId, accountId, dealId };
  }

  private async resolvePipelineStage(pipelineId?: string, stageId?: string) {
    const pipeline = pipelineId
      ? await this.prisma.client.pipeline.findFirst({ where: { id: pipelineId, deletedAt: null } })
      : await this.prisma.client.pipeline.findFirst({
          where: { deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        });
    if (!pipeline) throw new BadRequestException('No pipeline available — create one first');

    const stage = stageId
      ? await this.prisma.client.stage.findFirst({ where: { id: stageId, pipelineId: pipeline.id } })
      : await this.prisma.client.stage.findFirst({
          where: { pipelineId: pipeline.id },
          orderBy: { order: 'asc' },
        });
    if (!stage) throw new BadRequestException('Pipeline has no stages');
    return { pipelineId: pipeline.id, stageId: stage.id };
  }
}
