import * as crypto from 'node:crypto';
import { IntegrationProvider } from '@prisma/client';
import { InboundContext, LeadSourceAdapter, NormalizedLead } from '../lead-source-adapter.interface';
import { mapStandardFields } from './mapping';

/**
 * Meta Lead Ads (Facebook + Instagram) adapter.
 *  - verifyChallenge: GET handshake (hub.mode/hub.verify_token/hub.challenge).
 *  - verifyWebhook: X-Hub-Signature-256 = HMAC-SHA256(rawBody, appSecret).
 *  - fetchLeadDetail: the webhook only carries leadgen_id; fetch the full field
 *    set from the Graph API using the stored Page Access Token. If the event
 *    already includes `field_data` (replay/test), that is used directly.
 *  - normalizeToLead: maps field_data with alias fallbacks; preserves all
 *    custom questions in customFields.
 *
 * Assumption (isolated here so it can change without touching core): Graph
 * lead endpoint `GET /{version}/{leadgen_id}?access_token=...` returns
 * `{ field_data: [{ name, values: [...] }], ... }`.
 */
export class MetaLeadAdsAdapter implements LeadSourceAdapter {
  readonly provider = IntegrationProvider.META_LEAD_ADS;

  constructor(private readonly graphApiVersion = process.env.META_GRAPH_API_VERSION || 'v21.0') {}

  verifyChallenge(ctx: InboundContext): { ok: boolean; challenge?: string } {
    const q = ctx.query as any;
    const config = (ctx.connection?.config ?? {}) as any;
    const mode = q['hub.mode'];
    const token = q['hub.verify_token'];
    const challenge = q['hub.challenge'];
    if (mode === 'subscribe' && token && token === config.verifyToken) {
      return { ok: true, challenge: String(challenge ?? '') };
    }
    return { ok: false };
  }

  verifyWebhook(ctx: InboundContext): boolean {
    const config = (ctx.connection?.config ?? {}) as any;
    const appSecret: string | undefined = config.appSecret;
    if (!appSecret) return false;
    const header = (ctx.headers['x-hub-signature-256'] as string) || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(ctx.rawBody).digest('hex');
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /** Returns one raw detail object per leadgen change in the webhook. */
  async fetchLeadDetail(ctx: InboundContext): Promise<any[]> {
    const config = (ctx.connection?.config ?? {}) as any;
    const body = JSON.parse(ctx.rawBody.toString());
    const details: any[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;
        const v = change.value ?? {};
        const base = {
          leadgen_id: v.leadgen_id,
          page_id: v.page_id ?? entry.id,
          form_id: v.form_id,
          ad_id: v.ad_id,
          campaign_id: v.campaign_id,
          created_time: v.created_time,
        };
        if (v.field_data) {
          details.push({ ...base, field_data: v.field_data });
        } else {
          const fetched = await this.graphFetchLead(v.leadgen_id, config.pageAccessToken);
          details.push({ ...base, ...fetched });
        }
      }
    }
    return details;
  }

  normalizeToLead(detail: any): NormalizedLead {
    const answers: Record<string, any> = {};
    for (const fd of detail.field_data ?? []) {
      answers[fd.name] = Array.isArray(fd.values) ? fd.values[0] : fd.values;
    }
    const std = mapStandardFields(answers);
    // Preserve every form answer (incl. custom questions) for the record.
    return {
      ...std,
      source: 'meta_lead_ads',
      campaign: detail.campaign_id ? String(detail.campaign_id) : undefined,
      adId: detail.ad_id ? String(detail.ad_id) : undefined,
      formId: detail.form_id ? String(detail.form_id) : undefined,
      pageId: detail.page_id ? String(detail.page_id) : undefined,
      rawPayload: detail,
      sourceDedupeKey: detail.leadgen_id ? String(detail.leadgen_id) : undefined,
      customFields: answers,
    };
  }

  private async graphFetchLead(leadgenId: string, accessToken?: string): Promise<any> {
    if (!accessToken) throw new Error('Missing Page Access Token for Meta connection');
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${leadgenId}?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Graph API ${res.status}: ${await res.text()}`);
    return res.json();
  }
}
