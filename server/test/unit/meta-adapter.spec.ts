import * as crypto from 'node:crypto';
import { MetaLeadAdsAdapter } from '../../src/integrations/adapters/meta.adapter';
import { InboundContext } from '../../src/integrations/lead-source-adapter.interface';

const APP_SECRET = 'super_secret';
const VERIFY_TOKEN = 'my_verify_token';

function ctx(partial: Partial<InboundContext>): InboundContext {
  return {
    headers: {},
    rawBody: Buffer.from('{}'),
    query: {},
    connection: { id: 'c1', config: { appSecret: APP_SECRET, verifyToken: VERIFY_TOKEN } },
    ...partial,
  };
}

describe('MetaLeadAdsAdapter', () => {
  const adapter = new MetaLeadAdsAdapter();

  it('verifies the GET challenge only with the correct verify token', () => {
    const ok = adapter.verifyChallenge(
      ctx({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '4242' } }),
    );
    expect(ok).toEqual({ ok: true, challenge: '4242' });

    const bad = adapter.verifyChallenge(
      ctx({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '4242' } }),
    );
    expect(bad.ok).toBe(false);
  });

  it('accepts a correct X-Hub-Signature-256 and rejects a bad one', () => {
    const body = JSON.stringify({ object: 'page', entry: [] });
    const sig = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
    expect(
      adapter.verifyWebhook(ctx({ rawBody: Buffer.from(body), headers: { 'x-hub-signature-256': sig } })),
    ).toBe(true);
    expect(
      adapter.verifyWebhook(ctx({ rawBody: Buffer.from(body), headers: { 'x-hub-signature-256': 'sha256=deadbeef' } })),
    ).toBe(false);
    // Tampered body with the original signature must fail.
    expect(
      adapter.verifyWebhook(ctx({ rawBody: Buffer.from(body + 'x'), headers: { 'x-hub-signature-256': sig } })),
    ).toBe(false);
  });

  it('normalizes field_data with alias fallbacks and preserves custom answers', () => {
    const lead = adapter.normalizeToLead({
      leadgen_id: 'lg_1',
      page_id: 'p_1',
      form_id: 'f_1',
      ad_id: 'a_1',
      field_data: [
        { name: 'full_name', values: ['Priya Sharma'] },
        { name: 'phone_number', values: ['9810011223'] },
        { name: 'email', values: ['priya@northwind.co'] },
        { name: 'what_is_your_budget', values: ['5 lakh'] },
      ],
    });
    expect(lead).toMatchObject({
      firstName: 'Priya',
      lastName: 'Sharma',
      phone: '9810011223',
      email: 'priya@northwind.co',
      source: 'meta_lead_ads',
      formId: 'f_1',
      pageId: 'p_1',
      adId: 'a_1',
      sourceDedupeKey: 'lg_1',
    });
    expect((lead.customFields as any).what_is_your_budget).toBe('5 lakh');
  });
});
