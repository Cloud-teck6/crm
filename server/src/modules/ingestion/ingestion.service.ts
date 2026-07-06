import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AutomationService } from '../automation/automation.service';
import { getLeadSourceAdapter } from '../../integrations/adapters/registry';
import { InboundContext, NormalizedLead } from '../../integrations/lead-source-adapter.interface';
import { validateLead } from './validation';

const MAX_RETRIES = 5;

export type IngestOneResult = {
  status: 'created' | 'duplicate' | 'rejected';
  leadId?: string;
  reason?: string;
};

export interface IngestSummary {
  ok: boolean;
  duplicateDelivery?: boolean;
  results?: IngestOneResult[];
  error?: string;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly automation: AutomationService,
  ) {}

  /** Resolve an active connection by id (pre-auth, so deliberately unscoped). */
  async resolveConnection(connectionId: string) {
    return this.prisma.client.integrationConnection.findFirst({
      where: { id: connectionId, deletedAt: null },
    });
  }

  async verifyApiKey(apiKeyHash: string | null, provided?: string): Promise<boolean> {
    if (!apiKeyHash || !provided) return false;
    try {
      return await argon2.verify(apiKeyHash, provided);
    } catch {
      return false;
    }
  }

  /** Record a rejected/failed verification attempt for the integration log. */
  async logFailedVerification(connection: any, ctx: InboundContext, reason: string) {
    try {
      await this.prisma.client.webhookEvent.create({
        data: {
          tenantId: connection.tenantId,
          connectionId: connection.id,
          provider: connection.provider,
          providerEventId: `failverify:${crypto.randomBytes(8).toString('hex')}`,
          eventType: 'verification',
          sourceIp: ctx.sourceIp ?? null,
          verificationStatus: 'FAILED',
          processingStatus: 'FAILED',
          rawPayload: this.safeJson(ctx.rawBody),
          error: reason.slice(0, 500),
        } as any,
      });
    } catch (err) {
      this.logger.warn(`Could not log failed verification: ${err}`);
    }
  }

  /**
   * Process a verified inbound delivery: log the WebhookEvent idempotently,
   * normalize via the provider adapter, and ingest each lead.
   */
  async handleWebhook(connection: any, ctx: InboundContext): Promise<IngestSummary> {
    const adapter = getLeadSourceAdapter(connection.provider);
    if (!adapter) return { ok: false, error: 'No adapter for provider' };

    const providerEventId = this.computeEventId(connection.provider, ctx);

    // Idempotency: the unique (provider, providerEventId) blocks double-processing.
    let event;
    try {
      event = await this.prisma.client.webhookEvent.create({
        data: {
          tenantId: connection.tenantId,
          connectionId: connection.id,
          provider: connection.provider,
          providerEventId,
          eventType: 'inbound',
          sourceIp: ctx.sourceIp ?? null,
          verificationStatus: 'VERIFIED',
          processingStatus: 'PROCESSING',
          rawPayload: this.safeJson(ctx.rawBody),
        } as any,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { ok: true, duplicateDelivery: true };
      }
      throw err;
    }

    try {
      const details = adapter.fetchLeadDetail ? await adapter.fetchLeadDetail(ctx) : [this.safeJson(ctx.rawBody)];
      const normalized = (Array.isArray(details) ? details : [details]).flatMap((d) => {
        const out = adapter.normalizeToLead(d, ctx);
        return Array.isArray(out) ? out : [out];
      });

      const results: IngestOneResult[] = [];
      for (const lead of normalized) results.push(await this.ingestOne(connection, lead));

      await this.prisma.client.webhookEvent.updateMany({
        where: { id: event.id },
        data: { processingStatus: 'PROCESSED', processedAt: new Date() },
      });
      await this.prisma.client.integrationConnection.updateMany({
        where: { id: connection.id },
        data: { lastSyncAt: new Date(), status: 'connected', lastError: null },
      });
      return { ok: true, results };
    } catch (err: any) {
      this.logger.error(`Ingestion failed for ${connection.provider}: ${err.message}`);
      const retries = (event.retries ?? 0) + 1;
      await this.prisma.client.webhookEvent.updateMany({
        where: { id: event.id },
        data: {
          processingStatus: retries >= MAX_RETRIES ? 'DEAD_LETTER' : 'FAILED',
          retries,
          error: String(err.message).slice(0, 1000),
        },
      });
      await this.prisma.client.integrationConnection.updateMany({
        where: { id: connection.id },
        data: { lastError: String(err.message).slice(0, 500), lastErrorAt: new Date() },
      });
      return { ok: false, error: err.message };
    }
  }

  /** Validate → dedup (touchpoint) → assign owner → create lead → notify. */
  private async ingestOne(connection: any, lead: NormalizedLead): Promise<IngestOneResult> {
    const tenantId: string = connection.tenantId;
    const email = lead.email?.toLowerCase() ?? null;
    const phone = lead.phone ?? null;

    const check = validateLead({ email, phone });
    if (!check.valid) return { status: 'rejected' as const, reason: check.reason };

    // Dedup within the tenant by email or phone.
    const or: any[] = [];
    if (email) or.push({ email });
    if (phone) or.push({ phone });

    const existing = or.length
      ? await this.prisma.client.lead.findFirst({ where: { tenantId, deletedAt: null, OR: or } })
      : null;

    if (existing) {
      const cf = (existing.customFields as any) ?? {};
      const touchpoints = Array.isArray(cf._touchpoints) ? cf._touchpoints : [];
      touchpoints.push({ source: lead.source, campaign: lead.campaign ?? null, at: new Date().toISOString() });
      await this.prisma.client.lead.updateMany({
        where: { id: existing.id, tenantId },
        data: { customFields: { ...cf, _touchpoints: touchpoints } },
      });
      return { status: 'duplicate' as const, leadId: existing.id };
    }

    // Link to an existing contact if one matches.
    const contact = or.length
      ? await this.prisma.client.contact.findFirst({ where: { tenantId, deletedAt: null, OR: or } })
      : null;

    const ownerId = await this.assignOwner(tenantId, connection);
    const created = await this.prisma.client.lead.create({
      data: {
        tenantId,
        ownerId,
        contactId: contact?.id ?? null,
        firstName: lead.firstName ?? null,
        lastName: lead.lastName ?? null,
        email,
        phone,
        company: lead.company ?? null,
        source: lead.source,
        campaign: lead.campaign ?? null,
        adId: lead.adId ?? null,
        formId: lead.formId ?? null,
        pageId: lead.pageId ?? null,
        status: 'NEW',
        rawPayload: this.safeJson(lead.rawPayload),
        sourceDedupeKey: lead.sourceDedupeKey ?? null,
        customFields: {
          ...(lead.customFields ?? {}),
          _touchpoints: [{ source: lead.source, campaign: lead.campaign ?? null, at: new Date().toISOString() }],
        },
      } as any,
    });

    if (ownerId) {
      await this.prisma.client.notification.create({
        data: {
          tenantId,
          userId: ownerId,
          channel: 'IN_APP',
          title: 'New lead assigned',
          body: `${[lead.firstName, lead.lastName].filter(Boolean).join(' ') || email || phone} via ${lead.source}`,
          entityRef: `Lead:${created.id}`,
        } as any,
      });
    }

    await this.audit.log({
      tenantId,
      actorId: null,
      action: 'lead.ingest',
      resource: 'Lead',
      resourceId: created.id,
      after: { source: lead.source, ownerId },
    });
    // Scoring + workflow automation on the freshly ingested lead.
    await this.automation.onLeadCreated(tenantId, created);
    return { status: 'created' as const, leadId: created.id };
  }

  /** Owner routing: connection default, else least-loaded active user. */
  private async assignOwner(tenantId: string, connection: any): Promise<string | null> {
    const configured = (connection.config as any)?.defaultOwnerId;
    if (configured) {
      const u = await this.prisma.client.user.findFirst({
        where: { id: configured, tenantId, status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      });
      if (u) return u.id;
    }
    const users = await this.prisma.client.user.findMany({
      where: { tenantId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (users.length === 0) return null;

    // Least-loaded: pick the active user with the fewest open leads.
    const counts = await Promise.all(
      users.map(async (u) => ({
        id: u.id,
        n: await this.prisma.client.lead.count({ where: { tenantId, ownerId: u.id, deletedAt: null } }),
      })),
    );
    counts.sort((a, b) => a.n - b.n);
    return counts[0].id;
  }

  /** Admin replay of a failed / dead-letter event (authenticated context). */
  async replayEvent(eventId: string) {
    const event = await this.prisma.client.webhookEvent.findFirst({ where: { id: eventId } });
    if (!event) return { ok: false, error: 'Event not found' };
    const connection = await this.prisma.client.integrationConnection.findFirst({
      where: { id: event.connectionId ?? '', deletedAt: null },
    });
    if (!connection) return { ok: false, error: 'Connection not found' };

    const adapter = getLeadSourceAdapter(connection.provider);
    if (!adapter) return { ok: false, error: 'No adapter' };

    const ctx: InboundContext = {
      headers: {},
      rawBody: Buffer.from(JSON.stringify(event.rawPayload ?? {})),
      query: {},
      sourceIp: event.sourceIp ?? undefined,
      connection: { id: connection.id, config: connection.config, secretsRef: connection.secretsRef },
    };
    try {
      const details = adapter.fetchLeadDetail ? await adapter.fetchLeadDetail(ctx) : [event.rawPayload];
      const normalized = (Array.isArray(details) ? details : [details]).flatMap((d) => {
        const out = adapter.normalizeToLead(d, ctx);
        return Array.isArray(out) ? out : [out];
      });
      const results: IngestOneResult[] = [];
      for (const lead of normalized) results.push(await this.ingestOne(connection, lead));
      await this.prisma.client.webhookEvent.updateMany({
        where: { id: event.id },
        data: { processingStatus: 'PROCESSED', processedAt: new Date(), error: null },
      });
      return { ok: true, results };
    } catch (err: any) {
      await this.prisma.client.webhookEvent.updateMany({
        where: { id: event.id },
        data: { error: String(err.message).slice(0, 1000) },
      });
      return { ok: false, error: err.message };
    }
  }

  private computeEventId(provider: IntegrationProvider, ctx: InboundContext): string {
    const body = this.safeJson(ctx.rawBody) as any;
    if (provider === IntegrationProvider.META_LEAD_ADS) {
      const id = body?.entry?.[0]?.changes?.[0]?.value?.leadgen_id;
      if (id) return `meta:${id}`;
    }
    if (provider === IntegrationProvider.GOOGLE_ADS && body?.lead_id) return `google:${body.lead_id}`;
    if (body?.id) return `${provider}:${body.id}`;
    return `${provider}:${crypto.createHash('sha256').update(ctx.rawBody).digest('hex')}`;
  }

  private safeJson(raw: unknown): any {
    if (Buffer.isBuffer(raw)) {
      try {
        return JSON.parse(raw.toString());
      } catch {
        return { _raw: raw.toString().slice(0, 2000) };
      }
    }
    return raw ?? {};
  }
}
