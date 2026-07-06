import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class WebhooksOutService {
  private readonly logger = new Logger(WebhooksOutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.client.webhookSubscription.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  async create(dto: { name: string; url: string; events: string[]; secret?: string }) {
    const sub = await this.prisma.client.webhookSubscription.create({
      data: { name: dto.name, url: dto.url, events: dto.events ?? [], secret: dto.secret ?? null } as any,
    });
    await this.audit.log({ action: 'webhook_subscription.create', resource: 'WebhookSubscription', resourceId: sub.id });
    return sub;
  }

  async update(id: string, dto: { name?: string; url?: string; events?: string[]; isActive?: boolean; secret?: string }) {
    const res = await this.prisma.client.webhookSubscription.updateMany({
      where: { id, deletedAt: null },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        ...(dto.events !== undefined ? { events: dto.events } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.secret !== undefined ? { secret: dto.secret } : {}),
      },
    });
    if (res.count === 0) throw new NotFoundException('Subscription not found');
    return this.prisma.client.webhookSubscription.findFirst({ where: { id } });
  }

  async remove(id: string) {
    const res = await this.prisma.client.webhookSubscription.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (res.count === 0) throw new NotFoundException('Subscription not found');
    return { ok: true };
  }

  /** Fire matching subscriptions for an event (tenant-explicit, non-blocking). */
  async dispatch(tenantId: string, event: string, data: unknown) {
    const subs = await this.prisma.client.webhookSubscription.findMany({
      where: { tenantId, isActive: true, deletedAt: null, events: { has: event } },
    });
    for (const sub of subs) {
      const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sub.secret) headers['X-Signature'] = 'sha256=' + crypto.createHmac('sha256', sub.secret).update(payload).digest('hex');
      fetch(sub.url, { method: 'POST', headers, body: payload }).catch((err) => this.logger.warn(`Webhook ${sub.id} failed: ${err.message}`));
    }
  }
}
