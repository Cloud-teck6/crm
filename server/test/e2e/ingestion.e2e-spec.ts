import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';

/**
 * Phase 3 (Lead ingestion) e2e — requires a migrated Postgres.
 * Covers the generic inbound API, website honeypot, Meta webhook (challenge +
 * X-Hub-Signature-256), validation gate, dedup/touchpoints, idempotency, and
 * the webhook event log.
 */
describe('Lead ingestion (e2e)', () => {
  let app: INestApplication;
  const suffix = randomUUID().slice(0, 8);
  const admin = {
    companyName: `Ingest Co ${suffix}`,
    fullName: 'Admin',
    email: `admin-${suffix}@test.local`,
    password: 'Password123',
  };
  let agent: ReturnType<typeof request.agent>;
  let server: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
    agent = request.agent(server);
    await agent.post('/api/auth/register').send(admin).expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('ingests a lead via the generic API (valid key), rejecting bad keys', async () => {
    const conn = await agent
      .post('/api/integrations')
      .send({ provider: 'GENERIC_INBOUND', name: 'Zapier' })
      .expect(201);
    const id = conn.body.id;
    const apiKey = conn.body.apiKey;
    expect(apiKey).toMatch(/^lk_/);
    expect(conn.body.inboundPaths.post).toBe(`/api/ingest/${id}`);

    // Wrong key → 401.
    await request(server).post(`/api/ingest/${id}`).set('x-api-key', 'nope').send({ email: 'x@y.com' }).expect(401);

    // Valid key → 202 created.
    const res = await request(server)
      .post(`/api/ingest/${id}`)
      .set('x-api-key', apiKey)
      .send({ name: 'Asha Rao', email: `asha-${suffix}@buyer.com`, phone: '9810000001', company: 'BuyerCo', source: 'indiamart' })
      .expect(202);
    expect(res.body.results[0].status).toBe('created');

    // The lead is visible, attributed, and owner-assigned.
    const leads = await agent.get(`/api/leads?q=asha-${suffix}`).expect(200);
    expect(leads.body.items.length).toBe(1);
    expect(leads.body.items[0].source).toBe('indiamart');
    expect(leads.body.items[0].ownerId).toBeTruthy();
  });

  it('rejects spam (placeholder email + invalid phone) without creating a lead', async () => {
    const conn = await agent.post('/api/integrations').send({ provider: 'GENERIC_INBOUND', name: 'Spammy' }).expect(201);
    const res = await request(server)
      .post(`/api/ingest/${conn.body.id}`)
      .set('x-api-key', conn.body.apiKey)
      .send({ id: `spam-${suffix}`, email: 'test@example.com', phone: '0000000000' })
      .expect(202);
    expect(res.body.results[0].status).toBe('rejected');
  });

  it('dedupes by email and records a touchpoint instead of duplicating', async () => {
    const conn = await agent.post('/api/integrations').send({ provider: 'GENERIC_INBOUND', name: 'Dedup' }).expect(201);
    const email = `dup-${suffix}@buyer.com`;
    const post = (id: string, key: string) =>
      request(server).post(`/api/ingest/${conn.body.id}`).set('x-api-key', conn.body.apiKey)
        .send({ email, name: 'Dup Lead', phone: '9810000002', id });

    const first = await post(`e1-${suffix}`, conn.body.apiKey).expect(202);
    expect(first.body.results[0].status).toBe('created');
    const second = await post(`e2-${suffix}`, conn.body.apiKey).expect(202);
    expect(second.body.results[0].status).toBe('duplicate');

    const leads = await agent.get(`/api/leads?q=${email}`).expect(200);
    expect(leads.body.items.length).toBe(1);
  });

  it('is idempotent on repeated delivery of the same event id', async () => {
    const conn = await agent.post('/api/integrations').send({ provider: 'GENERIC_INBOUND', name: 'Idem' }).expect(201);
    const body = { id: `evt-${suffix}`, email: `idem-${suffix}@buyer.com`, phone: '9810000003' };
    await request(server).post(`/api/ingest/${conn.body.id}`).set('x-api-key', conn.body.apiKey).send(body).expect(202);
    const dupe = await request(server).post(`/api/ingest/${conn.body.id}`).set('x-api-key', conn.body.apiKey).send(body).expect(202);
    expect(dupe.body.duplicateDelivery).toBe(true);

    const events = await agent.get(`/api/integrations/${conn.body.id}/events`).expect(200);
    expect(events.body.stats.total).toBeGreaterThanOrEqual(1);
  });

  it('rejects website form submissions that trip the honeypot', async () => {
    const conn = await agent.post('/api/integrations').send({ provider: 'WEBSITE_FORM', name: 'Landing' }).expect(201);
    const spam = await request(server)
      .post(`/api/forms/${conn.body.id}`)
      .send({ email: `bot-${suffix}@buyer.com`, _gotcha: 'i am a bot' })
      .expect(202);
    expect(spam.body.rejected).toBe('spam');

    const real = await request(server)
      .post(`/api/forms/${conn.body.id}`)
      .send({ email: `human-${suffix}@buyer.com`, name: 'Real Human', phone: '9810000004' })
      .expect(202);
    expect(real.body.results[0].status).toBe('created');
  });

  it('handles the Meta webhook: challenge + signed leadgen event', async () => {
    const appSecret = 'meta_app_secret';
    const verifyToken = 'meta_verify_token';
    const conn = await agent
      .post('/api/integrations')
      .send({ provider: 'META_LEAD_ADS', name: 'FB Page', config: { appSecret, verifyToken } })
      .expect(201);
    const id = conn.body.id;

    // GET challenge — correct token echoes the challenge; wrong token → 403.
    const challenge = await request(server)
      .get(`/api/webhooks/meta/${id}`)
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': verifyToken, 'hub.challenge': '13579' })
      .expect(200);
    expect(challenge.text).toBe('13579');
    await request(server)
      .get(`/api/webhooks/meta/${id}`)
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '13579' })
      .expect(403);

    // POST a signed event (field_data inlined so no Graph call is needed).
    const payload = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'page_1',
          changes: [
            {
              field: 'leadgen',
              value: {
                leadgen_id: `lg-${suffix}`,
                page_id: 'page_1',
                form_id: 'form_1',
                ad_id: 'ad_1',
                field_data: [
                  { name: 'full_name', values: ['Meta Lead'] },
                  { name: 'email', values: [`meta-${suffix}@buyer.com`] },
                  { name: 'phone_number', values: ['9810000005'] },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(payload).digest('hex');

    // Bad signature → 401.
    await request(server)
      .post(`/api/webhooks/meta/${id}`)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=bad')
      .send(payload)
      .expect(401);

    // Correct signature → 200, lead created and attributed.
    const ok = await request(server)
      .post(`/api/webhooks/meta/${id}`)
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(payload)
      .expect(200);
    expect(ok.body.results[0].status).toBe('created');

    const leads = await agent.get(`/api/leads?q=meta-${suffix}`).expect(200);
    expect(leads.body.items[0].source).toBe('meta_lead_ads');
    expect(leads.body.items[0].formId).toBe('form_1');
  });
});
