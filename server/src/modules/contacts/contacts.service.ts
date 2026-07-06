import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../../common/rbac/scope.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { AuthUser } from '../../common/types/auth-user';
import { ownerScopeWhere, parsePagination, restrict } from '../../common/crud/crud.util';
import { CreateContactDto, UpdateContactDto } from './dto/contacts.dto';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly customFields: CustomFieldsService,
  ) {}

  async list(user: AuthUser, query: { page?: string; pageSize?: string; q?: string; accountId?: string }) {
    const { take, skip, page, pageSize } = parsePagination(query.page, query.pageSize);
    const ownerIds = await this.scope.visibleOwnerIds(user);
    const where: any = {
      deletedAt: null,
      ...ownerScopeWhere(ownerIds),
      ...(query.accountId ? { accountId: query.accountId } : {}),
    };
    if (query.q) {
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.client.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { account: { select: { id: true, name: true } } },
      }),
      this.prisma.client.contact.count({ where }),
    ]);
    return { items: restrict(items, 'contact', user), total, page, pageSize };
  }

  async get(user: AuthUser, id: string) {
    const contact = await this.prisma.client.contact.findFirst({
      where: { id, deletedAt: null },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!contact || !(await this.scope.canSeeOwner(user, contact.ownerId))) {
      throw new NotFoundException('Contact not found');
    }
    return restrict(contact, 'contact', user);
  }

  async create(user: AuthUser, dto: CreateContactDto) {
    const customFields = await this.customFields.validateValues('Contact', dto.customFields);
    const contact = await this.prisma.client.contact.create({
      data: {
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        email: dto.email?.toLowerCase() ?? null,
        phone: dto.phone ?? null,
        accountId: dto.accountId ?? null,
        ownerId: dto.ownerId ?? user.id,
        tags: dto.tags ?? [],
        customFields,
        createdById: user.id,
      } as any,
    });
    await this.audit.log({ action: 'contact.create', resource: 'Contact', resourceId: contact.id });
    return this.get(user, contact.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateContactDto) {
    await this.get(user, id);
    const data: any = {
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.email !== undefined ? { email: dto.email?.toLowerCase() ?? null } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.accountId !== undefined ? { accountId: dto.accountId } : {}),
      ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
      ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
    };
    if (dto.customFields !== undefined) {
      const current = await this.prisma.client.contact.findFirst({ where: { id }, select: { customFields: true } });
      data.customFields = await this.customFields.mergeAndValidate('Contact', current?.customFields as any, dto.customFields);
    }
    await this.prisma.client.contact.updateMany({ where: { id }, data });
    await this.audit.log({ action: 'contact.update', resource: 'Contact', resourceId: id });
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.client.contact.updateMany({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ action: 'contact.delete', resource: 'Contact', resourceId: id });
    return { ok: true };
  }
}
