import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';

/**
 * Phase 8 (Hardening) e2e — runs LAST (filename) with its own app whose
 * ThrottlerStorage is isolated, so a tiny rate limit here can't affect other
 * suites. Verifies rate limiting, security headers, readiness, and inbound
 * WhatsApp signature enforcement.
 */
describe('Hardening (e2e)', () => {
  let app: INestApplication;
  let server: any;
  const suffix = randomUUID().slice(0, 8);
  const admin = { companyName: `Sec Co ${suffix}`, fullName: 'Admin', email: `admin-${suffix}@test.local`, password: 'Password123' };
  let agent: ReturnType<typeof request.agent>;
  const prevLimit = process.env.THROTTLE_LIMIT;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '5'; // strict, for this app only
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
    agent = request.agent(server);
    await agent.post('/api/auth/register').send(admin).expect(201);
  });

  afterAll(async () => {
    if (prevLimit === undefined) delete process.env.THROTTLE_LIMIT;
    else process.env.THROTTLE_LIMIT = prevLimit;
    await app?.close();
  });

  it('sets security headers (helmet)', async () => {
    const res = await request(server).get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers).toHaveProperty('x-frame-options');
  });

  it('exposes a readiness probe', async () => {
    const res = await request(server).get('/api/health/ready').expect(200);
    expect(res.body.status).toBe('ready');
  });

  it('rate-limits with HTTP 429', async () => {
    let got429 = false;
    for (let i = 0; i < 9; i++) {
      const res = await agent.get('/api/leads');
      if (res.status === 429) got429 = true;
    }
    expect(got429).toBe(true);
  });

  it('rejects inbound WhatsApp with a bad signature when a secret is set', async () => {
    const appSecret = 'wa_secret';
    const conn = (await agent.post('/api/integrations').send({ provider: 'WHATSAPP', name: `WA ${suffix}`, config: { appSecret } }).expect(201)).body;
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ from: '910000000000', id: 'wamid1', text: { body: 'hi' } }] } }] }] });

    // Wrong signature → 401.
    await request(server).post(`/api/webhooks/whatsapp/${conn.id}`).set('Content-Type', 'application/json').set('x-hub-signature-256', 'sha256=bad').send(payload).expect(401);

    // Correct signature → 200.
    const sig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(payload).digest('hex');
    await request(server).post(`/api/webhooks/whatsapp/${conn.id}`).set('Content-Type', 'application/json').set('x-hub-signature-256', sig).send(payload).expect(200);
  });
});
