import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/types/auth-user';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';

const PUBLIC_SELECT = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  phone: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  roleId: true,
  teamId: true,
  territoryId: true,
  role: { select: { id: true, name: true, dataScope: true } },
  team: { select: { id: true, name: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(page = 1, pageSize = 50) {
    const take = Math.min(pageSize, 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where: { deletedAt: null },
        select: PUBLIC_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.user.count({ where: { deletedAt: null } }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async get(id: string) {
    const user = await this.prisma.client.user.findFirst({
      where: { id, deletedAt: null },
      select: PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    await this.assertRoleInTenant(dto.roleId);

    const existing = await this.prisma.client.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existing) throw new BadRequestException('A user with that email already exists');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.client.user.create({
      data: {
        email,
        fullName: dto.fullName,
        roleId: dto.roleId,
        teamId: dto.teamId ?? null,
        territoryId: dto.territoryId ?? null,
        passwordHash,
        status: 'ACTIVE',
        invitedById: actor.id,
        // tenantId injected by the tenant extension
      } as any,
      select: PUBLIC_SELECT,
    });

    await this.audit.log({
      action: 'user.create',
      resource: 'User',
      resourceId: user.id,
      after: { email: user.email, roleId: user.roleId },
    });
    return user;
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const before = await this.prisma.client.user.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('User not found');
    if (dto.roleId) await this.assertRoleInTenant(dto.roleId);

    const updated = await this.prisma.client.user.updateMany({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
        ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
        ...(dto.territoryId !== undefined ? { territoryId: dto.territoryId } : {}),
      },
    });
    if (updated.count === 0) throw new NotFoundException('User not found');

    await this.audit.log({
      action: 'user.update',
      resource: 'User',
      resourceId: id,
      before: { fullName: before.fullName, roleId: before.roleId, teamId: before.teamId },
      after: { fullName: dto.fullName, roleId: dto.roleId, teamId: dto.teamId },
    });
    return this.get(id);
  }

  async setStatus(actor: AuthUser, id: string, status: 'ACTIVE' | 'DEACTIVATED') {
    if (id === actor.id && status === 'DEACTIVATED') {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    const before = await this.prisma.client.user.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('User not found');

    const res = await this.prisma.client.user.updateMany({ where: { id }, data: { status } });
    if (res.count === 0) throw new NotFoundException('User not found');

    if (status === 'DEACTIVATED') {
      // Revoke all live sessions so access ends immediately.
      await this.prisma.client.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.log({
      action: status === 'DEACTIVATED' ? 'user.deactivate' : 'user.reactivate',
      resource: 'User',
      resourceId: id,
      before: { status: before.status },
      after: { status },
    });
    return this.get(id);
  }

  private async assertRoleInTenant(roleId: string) {
    const role = await this.prisma.client.role.findFirst({ where: { id: roleId, deletedAt: null } });
    if (!role) throw new BadRequestException('Role not found in this workspace');
  }
}
