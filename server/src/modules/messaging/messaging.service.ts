import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageChannel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../../common/rbac/scope.service';
import { AuthUser } from '../../common/types/auth-user';
import { channelAdapterFor } from '../../integrations/adapters/channel/channel.factory';
import { renderTemplate } from './render';
import { SendMessageDto } from './dto/messaging.dto';

const WINDOW_MS = 24 * 60 * 60 * 1000; // WhatsApp customer service window

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly config: ConfigService,
  ) {}

  async send(user: AuthUser, dto: SendMessageDto) {
    const link = await this.resolveLink(user, dto);
    const to = dto.to ?? (dto.channel === MessageChannel.EMAIL ? link.record?.email : link.record?.phone);
    if (!to) throw new BadRequestException('No recipient address/number for this channel');

    const threadId = `${dto.channel}:${dto.contactId ?? dto.leadId ?? to}`;

    // Resolve body/subject — from a template or free-form.
    let body = dto.body ?? '';
    let subject = dto.subject ?? null;
    let templateNameForProvider: string | undefined;

    if (dto.templateId) {
      const tpl = await this.prisma.client.messageTemplate.findFirst({
        where: { id: dto.templateId, deletedAt: null },
      });
      if (!tpl) throw new BadRequestException('Template not found');
      if (tpl.channel !== dto.channel) throw new BadRequestException('Template channel mismatch');
      if (dto.channel === MessageChannel.WHATSAPP && tpl.status !== 'APPROVED') {
        throw new BadRequestException('WhatsApp template is not approved');
      }
      const context = { ...this.recordContext(link.record), ...(dto.templateVars ?? {}) };
      body = renderTemplate(tpl.body, context);
      subject = tpl.subject ? renderTemplate(tpl.subject, context) : null;
      templateNameForProvider = tpl.providerTemplateId ?? tpl.name;
    } else if (!body) {
      throw new BadRequestException('Provide a body or a templateId');
    }

    // WhatsApp: free-form replies only inside the 24h window of the last inbound.
    if (dto.channel === MessageChannel.WHATSAPP && !dto.templateId) {
      await this.assertWithinWindow(threadId);
    }

    const message = await this.prisma.client.message.create({
      data: {
        channel: dto.channel,
        direction: 'OUTBOUND',
        status: 'QUEUED',
        threadId,
        templateId: dto.templateId ?? null,
        toAddress: to,
        fromAddress: this.fromFor(dto.channel),
        subject,
        body,
        ownerId: user.id,
        contactId: dto.contactId ?? null,
        leadId: dto.leadId ?? null,
        dealId: dto.dealId ?? null,
      } as any,
    });

    const adapter = channelAdapterFor(dto.channel);
    const result = await adapter.send({
      to,
      from: this.fromFor(dto.channel),
      subject: subject ?? undefined,
      body,
      templateId: templateNameForProvider,
      templateParams: dto.templateVars,
    });

    await this.prisma.client.message.updateMany({
      where: { id: message.id },
      data: {
        status: result.status === 'sent' ? 'SENT' : 'FAILED',
        providerMessageId: result.providerMessageId ?? null,
        sentAt: new Date(),
      },
    });
    await this.audit.log({
      action: 'message.send',
      resource: 'Message',
      resourceId: message.id,
      after: { channel: dto.channel, to, status: result.status },
    });

    return this.prisma.client.message.findFirst({ where: { id: message.id } });
  }

  /**
   * System send (no user context) for workflow/automation actions. Tenant is
   * explicit. WhatsApp system sends must use an approved template.
   */
  async sendSystem(
    tenantId: string,
    opts: { channel: MessageChannel; contactId?: string; leadId?: string; dealId?: string; to?: string; templateId?: string; templateVars?: Record<string, string>; body?: string },
  ) {
    const record = opts.contactId
      ? await this.prisma.client.contact.findFirst({ where: { id: opts.contactId, tenantId, deletedAt: null } })
      : opts.leadId
      ? await this.prisma.client.lead.findFirst({ where: { id: opts.leadId, tenantId, deletedAt: null } })
      : null;
    const to = opts.to ?? (opts.channel === MessageChannel.EMAIL ? record?.email : record?.phone);
    if (!to) return null;

    let body = opts.body ?? '';
    let subject: string | null = null;
    let templateNameForProvider: string | undefined;

    if (opts.templateId) {
      const tpl = await this.prisma.client.messageTemplate.findFirst({ where: { id: opts.templateId, tenantId, deletedAt: null } });
      if (!tpl) return null;
      if (opts.channel === MessageChannel.WHATSAPP && tpl.status !== 'APPROVED') return null;
      const context = { ...this.recordContext(record), ...(opts.templateVars ?? {}) };
      body = renderTemplate(tpl.body, context);
      subject = tpl.subject ? renderTemplate(tpl.subject, context) : null;
      templateNameForProvider = tpl.providerTemplateId ?? tpl.name;
    } else if (opts.channel === MessageChannel.WHATSAPP) {
      return null; // proactive WhatsApp requires an approved template
    }

    const threadId = `${opts.channel}:${opts.contactId ?? opts.leadId ?? to}`;
    const message = await this.prisma.client.message.create({
      data: {
        tenantId,
        channel: opts.channel,
        direction: 'OUTBOUND',
        status: 'QUEUED',
        threadId,
        templateId: opts.templateId ?? null,
        toAddress: to,
        fromAddress: this.fromFor(opts.channel),
        subject,
        body,
        ownerId: (record as any)?.ownerId ?? null,
        contactId: opts.contactId ?? null,
        leadId: opts.leadId ?? null,
        dealId: opts.dealId ?? null,
      } as any,
    });

    const result = await channelAdapterFor(opts.channel).send({
      to, from: this.fromFor(opts.channel), subject: subject ?? undefined, body, templateId: templateNameForProvider, templateParams: opts.templateVars,
    });
    await this.prisma.client.message.updateMany({
      where: { id: message.id },
      data: { status: result.status === 'sent' ? 'SENT' : 'FAILED', providerMessageId: result.providerMessageId ?? null, sentAt: new Date() },
    });
    return this.prisma.client.message.findFirst({ where: { id: message.id } });
  }

  /** Resolve a messaging connection by id (pre-auth webhook → unscoped). */
  resolveConnection(connectionId: string) {
    return this.prisma.client.integrationConnection.findFirst({ where: { id: connectionId, deletedAt: null } });
  }

  /** Inbound message (public webhook → no auth context; tenant is explicit). */
  async handleInbound(
    connection: any,
    input: { from: string; body: string; providerMessageId?: string; to?: string },
  ) {
    const tenantId: string = connection.tenantId;
    const channel: MessageChannel = this.channelForProvider(connection.provider);
    const from = input.from;

    // Match an existing contact/lead by phone or email; else create a lead.
    const byContact = await this.prisma.client.contact.findFirst({
      where: { tenantId, deletedAt: null, OR: [{ phone: from }, { email: from.toLowerCase() }] },
    });
    let lead = byContact
      ? null
      : await this.prisma.client.lead.findFirst({
          where: { tenantId, deletedAt: null, OR: [{ phone: from }, { email: from.toLowerCase() }] },
        });
    if (!byContact && !lead) {
      lead = await this.prisma.client.lead.create({
        data: {
          tenantId,
          source: channel.toLowerCase(),
          phone: channel === MessageChannel.EMAIL ? null : from,
          email: channel === MessageChannel.EMAIL ? from.toLowerCase() : null,
          status: 'NEW',
        } as any,
      });
    }

    const contactId = byContact?.id ?? null;
    const leadId = lead?.id ?? null;
    const ownerId = byContact?.ownerId ?? lead?.ownerId ?? null;
    const threadId = `${channel}:${contactId ?? leadId ?? from}`;

    const message = await this.prisma.client.message.create({
      data: {
        tenantId,
        channel,
        direction: 'INBOUND',
        status: 'RECEIVED',
        threadId,
        fromAddress: from,
        toAddress: input.to ?? null,
        body: input.body,
        providerMessageId: input.providerMessageId ?? null,
        contactId,
        leadId,
        ownerId,
        sentAt: new Date(),
      } as any,
    });

    if (ownerId) {
      await this.prisma.client.notification.create({
        data: {
          tenantId,
          userId: ownerId,
          channel: 'IN_APP',
          title: `New ${channel.toLowerCase()} message`,
          body: input.body.slice(0, 140),
          entityRef: contactId ? `Contact:${contactId}` : `Lead:${leadId}`,
        } as any,
      });
    }
    return message;
  }

  /** Merged, chronological timeline of messages + calls + activities. */
  async timeline(user: AuthUser, recordType: 'lead' | 'contact' | 'deal', recordId: string) {
    const key = { lead: 'leadId', contact: 'contactId', deal: 'dealId' }[recordType];
    if (!key) throw new BadRequestException('Invalid record type');
    const where = { [key]: recordId } as any;

    const [messages, calls, activities] = await Promise.all([
      this.prisma.client.message.findMany({ where, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.call.findMany({ where, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.activity.findMany({ where: { ...where, deletedAt: null }, orderBy: { createdAt: 'desc' } }),
    ]);

    const items = [
      ...messages.map((m) => ({ kind: 'message' as const, at: m.sentAt ?? m.createdAt, data: m })),
      ...calls.map((c) => ({ kind: 'call' as const, at: c.startedAt ?? c.createdAt, data: c })),
      ...activities.map((a) => ({ kind: 'activity' as const, at: a.createdAt, data: a })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return { items };
  }

  // ── helpers ───────────────────────────────────────────────────────────
  private async resolveLink(user: AuthUser, dto: SendMessageDto): Promise<{ record: any | null }> {
    if (dto.contactId) {
      const record = await this.prisma.client.contact.findFirst({ where: { id: dto.contactId, deletedAt: null } });
      if (!record) throw new NotFoundException('Contact not found');
      if (!(await this.scope.canSeeOwner(user, record.ownerId))) throw new ForbiddenException('Out of scope');
      return { record };
    }
    if (dto.leadId) {
      const record = await this.prisma.client.lead.findFirst({ where: { id: dto.leadId, deletedAt: null } });
      if (!record) throw new NotFoundException('Lead not found');
      if (!(await this.scope.canSeeOwner(user, record.ownerId))) throw new ForbiddenException('Out of scope');
      return { record };
    }
    return { record: null };
  }

  private async assertWithinWindow(threadId: string) {
    const lastInbound = await this.prisma.client.message.findFirst({
      where: { threadId, channel: MessageChannel.WHATSAPP, direction: 'INBOUND' },
      orderBy: { createdAt: 'desc' },
    });
    const ts = lastInbound?.sentAt ?? lastInbound?.createdAt;
    if (!ts || Date.now() - new Date(ts).getTime() > WINDOW_MS) {
      throw new BadRequestException('Outside the 24-hour WhatsApp window — send an approved template instead');
    }
  }

  private recordContext(record: any): Record<string, unknown> {
    if (!record) return {};
    return {
      firstName: record.firstName ?? '',
      lastName: record.lastName ?? '',
      email: record.email ?? '',
      phone: record.phone ?? '',
      company: record.company ?? '',
    };
  }

  private channelForProvider(provider: string): MessageChannel {
    if (provider === 'WHATSAPP') return MessageChannel.WHATSAPP;
    if (provider === 'SMS') return MessageChannel.SMS;
    return MessageChannel.EMAIL;
  }

  private fromFor(channel: MessageChannel): string | undefined {
    if (channel === MessageChannel.EMAIL) return this.config.get<string>('EMAIL_FROM');
    if (channel === MessageChannel.WHATSAPP) return this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    return this.config.get<string>('MSG91_SENDER_ID');
  }
}
