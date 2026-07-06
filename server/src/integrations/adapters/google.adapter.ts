import { IntegrationProvider } from '@prisma/client';
import { InboundContext, LeadSourceAdapter, NormalizedLead } from '../lead-source-adapter.interface';
import { mapStandardFields } from './mapping';

/**
 * Google Ads Lead Form adapter. The lead-form webhook POSTs:
 *   { lead_id, user_column_data: [{ column_id, string_value }], campaign_id,
 *     gcl_id, google_key, ... }
 * Authenticity is the configured `google_key` echoed in the payload.
 */
export class GoogleAdsAdapter implements LeadSourceAdapter {
  readonly provider = IntegrationProvider.GOOGLE_ADS;

  verifyWebhook(ctx: InboundContext): boolean {
    const config = (ctx.connection?.config ?? {}) as any;
    if (!config.googleKey) return false;
    const body = JSON.parse(ctx.rawBody.toString());
    return body.google_key === config.googleKey;
  }

  normalizeToLead(payload: unknown, ctx: InboundContext): NormalizedLead {
    const body: any = payload ?? JSON.parse(ctx.rawBody.toString());
    const answers: Record<string, any> = {};
    for (const col of body.user_column_data ?? []) {
      answers[col.column_id] = col.string_value;
    }
    const std = mapStandardFields(answers);
    return {
      ...std,
      source: 'google_ads',
      campaign: body.campaign_id ? String(body.campaign_id) : undefined,
      rawPayload: body,
      sourceDedupeKey: body.lead_id ? String(body.lead_id) : undefined,
      customFields: { ...answers, gclid: body.gcl_id ?? body.gclid },
    };
  }
}
