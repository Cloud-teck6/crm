import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { IntegrationProvider } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { API_KEY_PROVIDERS } from '../../integrations/adapters/registry';
import { CreateConnectionDto, UpdateConnectionDto } from './dto/integrations.dto';

const SECRET_KEYS = ['appSecret', 'pageAccessToken', 'googleKey', 'verifyToken', 'recaptchaSecret'];

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const items = await this.prisma.client.integrationConnection.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((c) => this.present(c));
  }

  async get(id: string) {
    const conn = await this.prisma.client.integrationConnection.findFirst({ where: { id, deletedAt: null } });
    if (!conn) throw new NotFoundException('Connection not found');
    return this.present(conn);
  }

  async create(dto: CreateConnectionDto) {
    let apiKeyPlain: string | undefined;
    let apiKeyHash: string | undefined;
    if (API_KEY_PROVIDERS.has(dto.provider)) {
      apiKeyPlain = this.genApiKey();
      apiKeyHash = await argon2.hash(apiKeyPlain);
    }
    const conn = await this.prisma.client.integrationConnection.create({
      data: {
        provider: dto.provider,
        name: dto.name,
        config: (dto.config ?? {}) as any,
        apiKeyHash: apiKeyHash ?? null,
        status: 'connected',
      } as any,
    });
    await this.audit.log({ action: 'integration.create', resource: 'IntegrationConnection', resourceId: conn.id, after: { provider: conn.provider, name: conn.name } });
    // Return the plaintext key ONCE (never stored or shown again).
    return { ...this.present(conn), apiKey: apiKeyPlain };
  }

  async update(id: string, dto: UpdateConnectionDto) {
    const before = await this.prisma.client.integrationConnection.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Connection not found');
    const mergedConfig = dto.config !== undefined ? { ...(before.config as any), ...dto.config } : undefined;
    await this.prisma.client.integrationConnection.updateMany({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(mergedConfig !== undefined ? { config: mergedConfig } : {}),
      },
    });
    await this.audit.log({ action: 'integration.update', resource: 'IntegrationConnection', resourceId: id });
    return this.get(id);
  }

  async regenerateKey(id: string) {
    const conn = await this.prisma.client.integrationConnection.findFirst({ where: { id, deletedAt: null } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (!API_KEY_PROVIDERS.has(conn.provider)) {
      throw new BadRequestException('This provider does not use an API key');
    }
    const apiKey = this.genApiKey();
    await this.prisma.client.integrationConnection.updateMany({
      where: { id },
      data: { apiKeyHash: await argon2.hash(apiKey) },
    });
    await this.audit.log({ action: 'integration.regenerate_key', resource: 'IntegrationConnection', resourceId: id });
    return { ...(await this.get(id)), apiKey };
  }

  async remove(id: string) {
    const res = await this.prisma.client.integrationConnection.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (res.count === 0) throw new NotFoundException('Connection not found');
    await this.audit.log({ action: 'integration.delete', resource: 'IntegrationConnection', resourceId: id });
    return { ok: true };
  }

  async events(connectionId: string, page = 1, pageSize = 50) {
    const take = Math.min(pageSize, 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = { connectionId };
    const [items, total, stats] = await Promise.all([
      this.prisma.client.webhookEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.client.webhookEvent.count({ where }),
      this.eventStats(connectionId),
    ]);
    return { items, total, page, pageSize: take, stats };
  }

  private async eventStats(connectionId: string) {
    const now = Date.now();
    const since = (ms: number) => new Date(now - ms);
    const day = 86_400_000;
    const [today, week, month, total, deadLetter] = await Promise.all([
      this.prisma.client.webhookEvent.count({ where: { connectionId, createdAt: { gte: since(day) } } }),
      this.prisma.client.webhookEvent.count({ where: { connectionId, createdAt: { gte: since(7 * day) } } }),
      this.prisma.client.webhookEvent.count({ where: { connectionId, createdAt: { gte: since(30 * day) } } }),
      this.prisma.client.webhookEvent.count({ where: { connectionId } }),
      this.prisma.client.webhookEvent.count({ where: { connectionId, processingStatus: 'DEAD_LETTER' } }),
    ]);
    return { today, week, month, total, deadLetter };
  }

  private genApiKey(): string {
    return 'lk_' + crypto.randomBytes(24).toString('base64url');
  }

  /** Hide secrets + apiKeyHash; expose inbound URLs for the UI. */
  private present(c: any) {
    const config = { ...(c.config ?? {}) };
    for (const k of SECRET_KEYS) if (config[k]) config[k] = '••••••';
    return {
      id: c.id,
      provider: c.provider,
      name: c.name,
      isActive: c.isActive,
      status: c.status,
      hasApiKey: !!c.apiKeyHash,
      config,
      lastSyncAt: c.lastSyncAt,
      lastError: c.lastError,
      createdAt: c.createdAt,
      inboundPaths: this.inboundPaths(c.provider, c.id),
    };
  }

  private inboundPaths(provider: IntegrationProvider, id: string): Record<string, string> {
    switch (provider) {
      case IntegrationProvider.GENERIC_INBOUND:
        return { post: `/api/ingest/${id}` };
      case IntegrationProvider.WEBSITE_FORM:
        return { post: `/api/forms/${id}` };
      case IntegrationProvider.META_LEAD_ADS:
        return { verify: `/api/webhooks/meta/${id}`, event: `/api/webhooks/meta/${id}` };
      case IntegrationProvider.GOOGLE_ADS:
        return { post: `/api/webhooks/google/${id}` };
      default:
        return {};
    }
  }
}
