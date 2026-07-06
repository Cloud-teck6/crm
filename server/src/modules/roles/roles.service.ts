import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSION_KEYS, PERMISSIONS, RESOURCE_LABELS } from '../../common/config/permissions';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  catalog() {
    return { permissions: PERMISSIONS, resourceLabels: RESOURCE_LABELS };
  }

  async list() {
    const roles = await this.prisma.client.role.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      dataScope: r.dataScope,
      isSystem: r.isSystem,
      permissions: r.permissions,
      fieldRestrictions: r.fieldRestrictions,
      userCount: r._count.users,
    }));
  }

  async get(id: string) {
    const role = await this.prisma.client.role.findFirst({ where: { id, deletedAt: null } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(dto: CreateRoleDto) {
    this.validatePermissions(dto.permissions);
    const exists = await this.prisma.client.role.findFirst({
      where: { name: dto.name, deletedAt: null },
    });
    if (exists) throw new BadRequestException('A role with that name already exists');

    const role = await this.prisma.client.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        dataScope: dto.dataScope,
        permissions: dto.permissions,
        fieldRestrictions: dto.fieldRestrictions ?? {},
        isSystem: false,
        // tenantId injected by the tenant extension
      } as any,
    });
    await this.audit.log({
      action: 'role.create',
      resource: 'Role',
      resourceId: role.id,
      after: { name: role.name, permissions: role.permissions },
    });
    return role;
  }

  async update(id: string, dto: UpdateRoleDto) {
    const before = await this.prisma.client.role.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Role not found');
    if (before.name === 'Super Admin' && dto.permissions) {
      throw new ForbiddenException('Super Admin permissions cannot be changed');
    }
    if (dto.permissions) this.validatePermissions(dto.permissions);

    const res = await this.prisma.client.role.updateMany({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.dataScope !== undefined ? { dataScope: dto.dataScope } : {}),
        ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
        ...(dto.fieldRestrictions !== undefined ? { fieldRestrictions: dto.fieldRestrictions } : {}),
      },
    });
    if (res.count === 0) throw new NotFoundException('Role not found');

    await this.audit.log({
      action: 'role.update',
      resource: 'Role',
      resourceId: id,
      before: { permissions: before.permissions, dataScope: before.dataScope },
      after: { permissions: dto.permissions, dataScope: dto.dataScope },
    });
    return this.get(id);
  }

  async remove(id: string) {
    const role = await this.prisma.client.role.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be deleted');
    if (role._count.users > 0) {
      throw new BadRequestException('Reassign users before deleting this role');
    }
    await this.prisma.client.role.updateMany({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({ action: 'role.delete', resource: 'Role', resourceId: id });
    return { ok: true };
  }

  private validatePermissions(keys: string[]) {
    const valid = new Set([...PERMISSION_KEYS, '*']);
    const bad = keys.filter((k) => !valid.has(k));
    if (bad.length) throw new BadRequestException(`Unknown permission(s): ${bad.join(', ')}`);
  }
}
