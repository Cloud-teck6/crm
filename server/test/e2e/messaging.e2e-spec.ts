import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';

/**
 * Phase 4 (Communication hub) e2e — requires a migrated Postgres.
 * Covers unified send (email/WhatsApp/SMS via the sandbox adapter), template
 * rendering, the WhatsApp 24-hour window rule, inbound webhooks, click-to-call
 * + status callback, the unified timeline, and permission gating.
 */
describe('Communication hub (e2e)', () => {
  let app: INestApplication;
  let server: any;
  const suffix = randomUUID().slice(0, 8);
  const admin = {
    companyName: `Comms Co ${suffix}`,
    fullName: 'Admin',
    email: `admin-${suffix}@test.local`,
    password: 'Password123',
  };
  let agent: ReturnType<typeof request.agent>;
  let contactId: string;
  const phone = '919810012345';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
    agent = request.agent(server);
    await agent.post('/api/auth/register').send(admin).expect(201);

    const c = await agent
      .post('/api/contacts')
      .send({ firstName: 'Asha', lastName: 'Rao', email: `asha-${suffix}@buyer.com`, phone })
      .expect(201);
    contactId = c.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('sends an email and shows it on the timeline', async () => {
    const msg = await agent
      .post('/api/messages')
      .send({ channel: 'EMAIL', contactId, subject: 'Hello', body: 'Welcome aboard' })
      .expect(201);
    expect(msg.body.direction).toBe('OUTBOUND');
    expect(msg.body.status).toBe('SENT');
    expect(msg.body.providerMessageId).toMatch(/^log_email_/);

    const tl = await agent.get(`/api/timeline/contact/${contactId}`).expect(200);
    expect(tl.body.items.some((i: any) => i.kind === 'message' && i.data.subject === 'Hello')).toBe(true);
  });

  it('renders a template with merge variables', async () => {
    const tpl = await agent
      .post('/api/templates')
      .send({ name: `welcome-${suffix}`, channel: 'EMAIL', subject: 'Hi {{firstName}}', body: 'Dear {{firstName}} from {{company}}, thanks!' })
      .expect(201);
    expect(tpl.body.variables).toEqual(expect.arrayContaining(['firstName', 'company']));

    const msg = await agent
      .post('/api/messages')
      .send({ channel: 'EMAIL', contactId, templateId: tpl.body.id, templateVars: { company: 'Acme' } })
      .expect(201);
    expect(msg.body.body).toBe('Dear Asha from Acme, thanks!');
    expect(msg.body.subject).toBe('Hi Asha');
  });

  it('enforces the WhatsApp 24-hour window', async () => {
    // No prior inbound → free-form is blocked.
    await agent
      .post('/api/messages')
      .send({ channel: 'WHATSAPP', contactId, body: 'free form hi' })
      .expect(400);

    // An APPROVED template can be sent proactively (outside the window).
    const tpl = await agent
      .post('/api/templates')
      .send({ name: `wa-${suffix}`, channel: 'WHATSAPP', body: 'Hi {{firstName}}, your order shipped.', status: 'APPROVED' })
      .expect(201);
    const proactive = await agent
      .post('/api/messages')
      .send({ channel: 'WHATSAPP', contactId, templateId: tpl.body.id })
      .expect(201);
    expect(proactive.body.body).toBe('Hi Asha, your order shipped.');
  });

  it('receives an inbound WhatsApp message and then allows free-form replies', async () => {
    const conn = await agent
      .post('/api/integrations')
      .send({ provider: 'WHATSAPP', name: 'WA Cloud', config: { verifyToken: 'vt' } })
      .expect(201);

    // Cloud API inbound shape, from the contact's number.
    const inbound = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: '15550001111' },
                messages: [{ from: phone, id: `wamid-${suffix}`, text: { body: 'Hi, is this available?' } }],
              },
            },
          ],
        },
      ],
    };
    const recv = await request(server).post(`/api/webhooks/whatsapp/${conn.body.id}`).send(inbound).expect(200);
    expect(recv.body.received).toBe(1);

    // The inbound opened the 24h window → a free-form reply now succeeds.
    const reply = await agent
      .post('/api/messages')
      .send({ channel: 'WHATSAPP', contactId, body: 'Yes it is!' })
      .expect(201);
    expect(reply.body.status).toBe('SENT');

    // Timeline now has the inbound + the outbound reply.
    const tl = await agent.get(`/api/timeline/contact/${contactId}`).expect(200);
    const wa = tl.body.items.filter((i: any) => i.kind === 'message' && i.data.channel === 'WHATSAPP');
    expect(wa.some((i: any) => i.data.direction === 'INBOUND')).toBe(true);
    expect(wa.some((i: any) => i.data.direction === 'OUTBOUND' && i.data.body === 'Yes it is!')).toBe(true);
  });

  it('click-to-call logs a call and a status callback updates it', async () => {
    const call = await agent.post('/api/calls/click-to-call').send({ contactId }).expect(201);
    expect(call.body.direction).toBe('OUTBOUND');
    expect(call.body.providerCallId).toMatch(/^log_call_/);

    await request(server)
      .post('/api/webhooks/voice/status')
      .send({ providerCallId: call.body.providerCallId, duration: 95, recordingUrl: 'https://rec/abc.mp3', disposition: 'completed' })
      .expect(200);

    const tl = await agent.get(`/api/timeline/contact/${contactId}`).expect(200);
    const logged = tl.body.items.find((i: any) => i.kind === 'call');
    expect(logged.data.duration).toBe(95);
    expect(logged.data.recordingUrl).toBe('https://rec/abc.mp3');
  });

  it('denies sending to a user without message:create', async () => {
    const roles = await agent.get('/api/roles').expect(200);
    const readOnly = roles.body.find((r: any) => r.name === 'Read-Only / Client');
    const email = `ro-${suffix}@test.local`;
    await agent.post('/api/users').send({ email, fullName: 'RO', roleId: readOnly.id, password: 'Password123' }).expect(201);

    const ro = request.agent(server);
    await ro.post('/api/auth/login').send({ email, password: 'Password123' }).expect(201);
    await ro.post('/api/messages').send({ channel: 'EMAIL', contactId, body: 'hi' }).expect(403);
  });
});
