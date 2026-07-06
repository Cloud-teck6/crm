import { Injectable, Logger } from '@nestjs/common';
import { MessageChannel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { channelAdapterFor } from '../../integrations/adapters/channel/channel.factory';
import { AuthUser } from '../../common/types/auth-user';
import { UpdatePreferencesDto } from './dto/notifications.dto';

interface NotifyInput {
  tenantId: string;
  userId: string;
  title: string;
  body?: string;
  entityRef?: string;
  trigger?: string; // for per-user muting
}

const DEFAULT_PREFS = { channels: ['IN_APP'], slackWebhookUrl: null, quietHoursStart: null, quietHoursEnd: null, mutedTriggers: [] as string[] };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── User-facing (in authenticated context) ──────────────────────────────
  async list(user: AuthUser, unreadOnly = false, take = 50) {
    const where = { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) };
    const [items, unread] = await Promise.all([
      this.prisma.client.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.client.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { items, unread };
  }

  unreadCount(user: AuthUser) {
    return this.prisma.client.notification.count({ where: { userId: user.id, readAt: null } }).then((unread) => ({ unread }));
  }

  async markRead(user: AuthUser, id: string) {
    await this.prisma.client.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.client.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async getPreferences(user: AuthUser) {
    const pref = await this.prisma.client.notificationPreference.findFirst({ where: { userId: user.id } });
    return pref ?? { userId: user.id, ...DEFAULT_PREFS };
  }

  async updatePreferences(user: AuthUser, dto: UpdatePreferencesDto) {
    const existing = await this.prisma.client.notificationPreference.findFirst({ where: { userId: user.id } });
    if (existing) {
      await this.prisma.client.notificationPreference.updateMany({
        where: { userId: user.id },
        data: {
          ...(dto.channels !== undefined ? { channels: dto.channels } : {}),
          ...(dto.slackWebhookUrl !== undefined ? { slackWebhookUrl: dto.slackWebhookUrl } : {}),
          ...(dto.quietHoursStart !== undefined ? { quietHoursStart: dto.quietHoursStart } : {}),
          ...(dto.quietHoursEnd !== undefined ? { quietHoursEnd: dto.quietHoursEnd } : {}),
          ...(dto.mutedTriggers !== undefined ? { mutedTriggers: dto.mutedTriggers } : {}),
        },
      });
    } else {
      await this.prisma.client.notificationPreference.create({
        data: {
          userId: user.id,
          channels: dto.channels ?? ['IN_APP'],
          slackWebhookUrl: dto.slackWebhookUrl ?? null,
          quietHoursStart: dto.quietHoursStart ?? null,
          quietHoursEnd: dto.quietHoursEnd ?? null,
          mutedTriggers: dto.mutedTriggers ?? [],
        } as any,
      });
    }
    return this.getPreferences(user);
  }

  // ── System dispatch (tenant-explicit; safe to call anywhere) ─────────────
  async notify(input: NotifyInput) {
    const prefs = (await this.prisma.client.notificationPreference.findFirst({ where: { userId: input.userId } })) ?? DEFAULT_PREFS;
    if (input.trigger && prefs.mutedTriggers?.includes(input.trigger)) return null;

    // In-app is always persisted (it's the bell).
    const notif = await this.prisma.client.notification.create({
      data: { tenantId: input.tenantId, userId: input.userId, channel: 'IN_APP', title: input.title, body: input.body ?? null, entityRef: input.entityRef ?? null } as any,
    });

    if (!this.isQuietHours(prefs)) {
      if (prefs.channels?.includes('SLACK') && (prefs as any).slackWebhookUrl) {
        await this.postSlack((prefs as any).slackWebhookUrl, input.title, input.body);
      }
      if (prefs.channels?.includes('EMAIL')) {
        await this.emailUser(input.tenantId, input.userId, input.title, input.body);
      }
    }
    return notif;
  }

  /**
   * SLA escalation: leads created > slaMinutes ago, still uncontacted (no
   * message/activity), notify the owner and escalate to their team manager.
   */
  async runSlaCheck(tenantId: string) {
    const tenant = await this.prisma.client.tenant.findFirst({ where: { id: tenantId } });
    const slaMinutes = Number((tenant?.settings as any)?.slaMinutes ?? 30);
    const cutoff = new Date(Date.now() - slaMinutes * 60000);

    const stale = await this.prisma.client.lead.findMany({
      where: { tenantId, deletedAt: null, status: { in: ['NEW', 'CONTACTED'] }, ownerId: { not: null }, createdAt: { lt: cutoff } },
      take: 200,
    });

    let escalated = 0;
    for (const lead of stale) {
      const [msgs, acts, already] = await Promise.all([
        this.prisma.client.message.count({ where: { tenantId, leadId: lead.id, direction: 'OUTBOUND' } }),
        this.prisma.client.activity.count({ where: { tenantId, leadId: lead.id, deletedAt: null } }),
        this.prisma.client.notification.count({ where: { tenantId, entityRef: `Lead:${lead.id}`, title: { contains: 'SLA' } } }),
      ]);
      if (msgs > 0 || acts > 0 || already > 0) continue; // contacted or already escalated

      const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'lead';
      await this.notify({ tenantId, userId: lead.ownerId!, title: 'SLA breach: lead uncontacted', body: `${name} has not been contacted within ${slaMinutes} min`, entityRef: `Lead:${lead.id}`, trigger: 'sla.breach' });

      const owner = await this.prisma.client.user.findFirst({ where: { id: lead.ownerId!, tenantId }, select: { teamId: true } });
      if (owner?.teamId) {
        const team = await this.prisma.client.team.findFirst({ where: { id: owner.teamId, tenantId }, select: { managerId: true } });
        if (team?.managerId && team.managerId !== lead.ownerId) {
          await this.notify({ tenantId, userId: team.managerId, title: 'SLA escalation', body: `Lead "${name}" breached the ${slaMinutes}-min SLA`, entityRef: `Lead:${lead.id}`, trigger: 'sla.escalation' });
        }
      }
      escalated++;
    }
    return { checked: stale.length, escalated };
  }

  private isQuietHours(prefs: any): boolean {
    if (prefs.quietHoursStart == null || prefs.quietHoursEnd == null) return false;
    const hour = new Date().getHours();
    const { quietHoursStart: s, quietHoursEnd: e } = prefs;
    return s <= e ? hour >= s && hour < e : hour >= s || hour < e; // handles overnight ranges
  }

  private async postSlack(url: string, title: string, body?: string) {
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `*${title}*\n${body ?? ''}` }) });
    } catch (err) {
      this.logger.warn(`Slack notify failed: ${err}`);
    }
  }

  private async emailUser(tenantId: string, userId: string, title: string, body?: string) {
    const user = await this.prisma.client.user.findFirst({ where: { id: userId, tenantId }, select: { email: true } });
    if (!user) return;
    await channelAdapterFor(MessageChannel.EMAIL).send({ to: user.email, subject: title, body: body ?? title });
  }
}
