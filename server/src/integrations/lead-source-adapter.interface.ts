import { IntegrationProvider } from '@prisma/client';

/**
 * Contract every lead source (Meta Lead Ads, Google Ads, website forms,
 * generic inbound, IndiaMART, ...) implements. Phase 3 supplies concrete
 * adapters; core ingestion code depends only on this interface so a provider
 * can be swapped without touching the pipeline.
 */
export interface NormalizedLead {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  source: string;
  campaign?: string;
  adId?: string;
  formId?: string;
  pageId?: string;
  rawPayload: unknown;
  sourceDedupeKey?: string;
  customFields?: Record<string, unknown>;
}

export interface InboundContext {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer | string;
  query: Record<string, unknown>;
  sourceIp?: string;
  connection?: { id: string; config: unknown; secretsRef?: string | null };
}

export interface LeadSourceAdapter {
  readonly provider: IntegrationProvider;

  /** Verify a webhook handshake/challenge (e.g. Meta hub.challenge). */
  verifyChallenge?(ctx: InboundContext): { ok: boolean; challenge?: string };

  /** Verify the signature/secret of a live inbound event. */
  verifyWebhook(ctx: InboundContext): Promise<boolean> | boolean;

  /** Fetch full lead detail when the webhook only carries an id (Meta). */
  fetchLeadDetail?(ctx: InboundContext): Promise<unknown>;

  /** Map a provider payload to the canonical Lead shape. */
  normalizeToLead(payload: unknown, ctx: InboundContext): NormalizedLead | NormalizedLead[];

  /** Optional: push a conversion signal back (Meta CAPI, Google offline conv). */
  pushConversionBack?(leadId: string, payload: unknown): Promise<void>;
}
