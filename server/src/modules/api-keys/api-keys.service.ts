import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/types/auth-user';
import { PERMISSION_KEYS, expandPermissions } from '../../common/config/permissions';

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const keys = await this.prisma.client.apiKey.findMany({ where: { revokedAt: null }, orderBy: { createdAt: 'desc' } });
    return keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, permissions: k.permissions, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt }));
  }

  async create(user: AuthUser, dto: { name: string; permissions: string[] }) {
    const valid = new Set([...PERMISSION_KEYS, '*']);
    const bad = (dto.permissions ?? []).filter((p) => !valid.has(p));
    if (bad.length) throw new BadRequestException(`Unknown permission(s): ${bad.join(', ')}`);

    const key = 'ck_' + crypto.randomBytes(24).toString('base64url');
    const rec = await this.prisma.client.apiKey.create({
      data: {
        name: dto.name,
        keyHash: sha256(key),
        prefix: key.slice(0, 11) + '…',
        permissions: dto.permissions ?? [],
        createdById: user.id,
      } as any,
    });
    await this.audit.log({ action: 'api_key.create', resource: 'ApiKey', resourceId: rec.id, after: { name: rec.name } });
    // The plaintext key is shown ONCE.
    return { id: rec.id, name: rec.name, prefix: rec.prefix, permissions: rec.permissions, key };
  }

  async revoke(id: string) {
    const res = await this.prisma.client.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (res.count === 0) throw new NotFoundException('API key not found');
    await this.audit.log({ action: 'api_key.revoke', resource: 'ApiKey', resourceId: id });
    return { ok: true };
  }

  /** Resolve a presented API key to an AuthUser (used by the auth guard). */
  async resolve(plainKey: string): Promise<AuthUser | null> {
    if (!plainKey?.startsWith('ck_')) return null;
    // Unscoped lookup (pre-auth): the key hash is globally unique.
    const ak = await this.prisma.client.apiKey.findFirst({ where: { keyHash: sha256(plainKey), revokedAt: null } });
    if (!ak) return null;
    // Touch lastUsedAt without blocking the request.
    void this.prisma.client.apiKey.updateMany({ where: { id: ak.id }, data: { lastUsedAt: new Date() } });
    return {
      id: ak.createdById ?? `apikey_${ak.id}`,
      tenantId: ak.tenantId,
      email: `apikey:${ak.name}`,
      fullName: `API Key: ${ak.name}`,
      roleId: 'api-key',
      roleName: 'API Key',
      dataScope: 'TENANT' as any,
      permissions: expandPermissions(ak.permissions),
      fieldRestrictions: {},
      teamId: null,
      territoryId: null,
    };
  }
}
