import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Phase 7 (Import/export, public API, compliance) e2e.
 * Covers background CSV import (mapping + dedup + error report), API-key
 * authentication on the public REST API, DPDP/GDPR export + delete-my-data,
 * and scope-aware list export.
 */
describe('Import / API / compliance (e2e)', () => {
  let app: INestApplication;
  let server: any;
  const suffix = randomUUID().slice(0, 8);
  const admin = { companyName: `IO Co ${suffix}`, fullName: 'Admin', email: `admin-${suffix}@test.local`, password: 'Password123' };
  let agent: ReturnType<typeof request.agent>;

  const csv =
    `First Name,Last Name,Email,Phone,Company\n` +
    `Ravi,Kumar,ravi-${suffix}@imp.com,9810000001,RaviCo\n` +
    `Sita,Devi,sita-${suffix}@imp.com,9810000002,SitaCo\n` +
    `Bad,Row,not-an-email,,\n`;

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

  async function waitForImport(id: string) {
    for (let i = 0; i < 50; i++) {
      const job = (await agent.get(`/api/imports/${id}`).expect(200)).body;
      if (job.status === 'COMPLETED' || job.status === 'FAILED') return job;
      await sleep(100);
    }
    throw new Error('import did not finish');
  }

  it('previews a CSV and suggests a column mapping', async () => {
    const res = (await agent.post('/api/imports/preview').send({ objectType: 'Lead', csv }).expect(201)).body;
    expect(res.headers).toEqual(['First Name', 'Last Name', 'Email', 'Phone', 'Company']);
    expect(res.totalRows).toBe(3);
    expect(res.suggestedMapping['Email']).toBe('email');
    expect(res.suggestedMapping['First Name']).toBe('firstName');
  });

  it('imports leads in the background with dedup + an error report', async () => {
    const mapping = { 'First Name': 'firstName', 'Last Name': 'lastName', Email: 'email', Phone: 'phone', Company: 'company' };
    const job = (await agent.post('/api/imports').send({ objectType: 'Lead', csv, mapping, dedupeStrategy: 'skip' }).expect(201)).body;

    const done = await waitForImport(job.id);
    expect(done.status).toBe('COMPLETED');
    expect(done.created).toBe(2);
    expect(done.failed).toBe(1); // the invalid-email row

    // The two valid leads exist.
    const leads = (await agent.get(`/api/leads?q=imp.com&pageSize=200`).expect(200)).body;
    expect(leads.items.length).toBeGreaterThanOrEqual(2);

    // Error report download.
    const errs = await agent.get(`/api/imports/${job.id}/errors.csv`).expect(200);
    expect(errs.headers['content-type']).toContain('text/csv');
    expect(errs.text).toContain('invalid email');

    // Re-import with skip → both dedupe to skipped.
    const job2 = (await agent.post('/api/imports').send({ objectType: 'Lead', csv, mapping, dedupeStrategy: 'skip' }).expect(201)).body;
    const done2 = await waitForImport(job2.id);
    expect(done2.created).toBe(0);
    expect(done2.skipped).toBe(2);
  });

  it('authenticates the public REST API with an API key', async () => {
    const key = (await agent.post('/api/api-keys').send({ name: 'CI key', permissions: ['lead:view', 'lead:create'] }).expect(201)).body;
    expect(key.key).toMatch(/^ck_/);

    // The key can read + create leads.
    await request(server).get('/api/leads').set('X-Api-Key', key.key).expect(200);
    const created = await request(server).post('/api/leads').set('X-Api-Key', key.key).send({ email: `apikey-${suffix}@x.com` }).expect(201);
    expect(created.body.email).toBe(`apikey-${suffix}@x.com`);

    // ...but not endpoints outside its permissions.
    await request(server).get('/api/users').set('X-Api-Key', key.key).expect(403);
    // Invalid key → 401.
    await request(server).get('/api/leads').set('X-Api-Key', 'ck_invalid').expect(401);
  });

  it('exports a scope-aware list as CSV', async () => {
    const res = await agent.get('/api/export/lead.csv').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\n')[0]).toBe('id,firstName,lastName,email,phone,company,source,campaign,status,score,ownerId,createdAt');
  });

  it('exports and erases a data subject (DPDP/GDPR)', async () => {
    const email = `subject-${suffix}@x.com`;
    const contact = (await agent.post('/api/contacts').send({ firstName: 'Data', lastName: 'Subject', email, phone: '9810005555' }).expect(201)).body;
    await agent.post('/api/messages').send({ channel: 'EMAIL', contactId: contact.id, subject: 'Hi', body: 'Hello there' }).expect(201);

    const exp = (await agent.post('/api/compliance/export').send({ email }).expect(201)).body;
    expect(exp.contacts.length).toBe(1);
    expect(exp.messages.length).toBeGreaterThanOrEqual(1);

    const del = (await agent.post('/api/compliance/delete').send({ email }).expect(201)).body;
    expect(del.erased.contacts).toBe(1);

    // The contact is now erased (soft-deleted) → 404.
    await agent.get(`/api/contacts/${contact.id}`).expect(404);
  });

  it('manages outbound webhook subscriptions', async () => {
    const sub = (await agent.post('/api/webhook-subscriptions').send({ name: 'Zap', url: 'https://example.com/hook', events: ['lead.created'] }).expect(201)).body;
    expect(sub.events).toContain('lead.created');
    const list = (await agent.get('/api/webhook-subscriptions').expect(200)).body;
    expect(list.some((s: any) => s.id === sub.id)).toBe(true);
    await agent.delete(`/api/webhook-subscriptions/${sub.id}`).expect(200);
  });
});
