import { IntegrationProvider } from '@prisma/client';
import { InboundContext, LeadSourceAdapter, NormalizedLead } from '../lead-source-adapter.interface';
import { mapStandardFields } from './mapping';

/**
 * Catch-all adapter for the documented generic inbound API. Any source
 * (IndiaMART, JustDial, Zapier/Make, custom forms, ...) can POST a flat JSON
 * object — or an array of them — and we normalize via field aliases.
 * Authentication (per-connection API key) is handled by the controller.
 */
export class GenericInboundAdapter implements LeadSourceAdapter {
  readonly provider: IntegrationProvider = IntegrationProvider.GENERIC_INBOUND;
  protected defaultSource = 'generic';

  verifyWebhook(_ctx?: InboundContext): boolean {
    return true; // API-key auth performed before the adapter is invoked
  }

  normalizeToLead(payload: unknown, _ctx?: InboundContext): NormalizedLead | NormalizedLead[] {
    if (Array.isArray(payload)) return payload.map((p) => this.one(p));
    return this.one(payload);
  }

  protected one(body: any): NormalizedLead {
    const answers = body?.fields ?? body?.data ?? body ?? {};
    const std = mapStandardFields(answers);
    return {
      ...std,
      source: body?.source ?? this.defaultSource,
      campaign: body?.campaign ?? body?.utm_campaign,
      adId: body?.ad_id ?? body?.adId,
      formId: body?.form_id ?? body?.formId,
      rawPayload: body,
      sourceDedupeKey: body?.id ? String(body.id) : undefined,
      customFields: {},
    };
  }
}
