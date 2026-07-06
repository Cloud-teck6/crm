import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../../common/rbac/scope.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { AuthUser } from '../../common/types/auth-user';
import { ownerScopeWhere, parsePagination, restrict } from '../../common/crud/crud.util';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly customFields: CustomFieldsService,
  ) {}

  async list(user: AuthUser, query: { page?: string; pageSize?: string; q?: string }) {
    const { take, skip, page, pageSize } = parsePagination(query.page, query.pageSize);
    const ownerIds = await this.scope.visibleOwnerIds(user);
    const where = {
      deletedAt: null,
      ...ownerScopeWhere(ownerIds),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.client.account.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.client.account.count({ where }),
    ]);
    return { items: restrict(items, 'account', user), total, page, pageSize };
  }

  async get(user: AuthUser, id: string) {
    const account = await this.prisma.client.account.findFirst({ where: { id, deletedAt: null } });
    if (!account || !(await this.scope.canSeeOwner(user, account.ownerId))) {
      throw new NotFoundException('Account not found');
    }
    return restrict(account, 'account', user);
  }

  async create(user: AuthUser, dto: CreateAccountDto) {
    const customFields = await this.customFields.validateValues('Account', dto.customFields);
    const account = await this.prisma.client.account.create({
      data: {
        name: dto.name,
        domain: dto.domain ?? null,
        industry: dto.industry ?? null,
        ownerId: dto.ownerId ?? user.id,
        customFields,
        createdById: user.id,
      } as any,
    });
    await this.audit.log({ action: 'account.create', resource: 'Account', resourceId: account.id, after: { name: account.name } });
    return restrict(account, 'account', user);
  }

  async update(user: AuthUser, id: string, dto: UpdateAccountDto) {
    await this.get(user, id); // scope + existence check
    const data: any = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.domain !== undefined ? { domain: dto.domain } : {}),
      ...(dto.industry !== undefined ? { industry: dto.industry } : {}),
      ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
    };
    if (dto.customFields !== undefined) {
      const current = await this.prisma.client.account.findFirst({ where: { id }, select: { customFields: true } });
      data.customFields = await this.customFields.mergeAndValidate('Account', current?.customFields as any, dto.customFields);
    }
    await this.prisma.client.account.updateMany({ where: { id }, data });
    await this.audit.log({ action: 'account.update', resource: 'Account', resourceId: id });
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.client.account.updateMany({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ action: 'account.delete', resource: 'Account', resourceId: id });
    return { ok: true };
  }
}
