import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';

/**
 * Phase 2 (Core CRM) e2e — requires a migrated Postgres (DATABASE_URL).
 * Verifies CRUD, lead→contact/deal conversion, the Kanban board + stage move,
 * data-scoping (a Sales Rep can't see another owner's records), and the
 * activity timeline.
 */
describe('Core CRM (e2e)', () => {
  let app: INestApplication;
  const suffix = randomUUID().slice(0, 8);
  const admin = {
    companyName: `CRM Co ${suffix}`,
    fullName: 'Admin',
    email: `admin-${suffix}@test.local`,
    password: 'Password123',
  };
  const adminCreds = { email: admin.email, password: admin.password };

  let agent: ReturnType<typeof request.agent>;
  let pipelineId: string;
  let firstStageId: string;
  let secondStageId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();

    agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/register').send(admin).expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates a pipeline with default stages and an empty board', async () => {
    const res = await agent.post('/api/pipelines').send({ name: 'Sales' }).expect(201);
    pipelineId = res.body.id;
    expect(res.body.stages.length).toBe(6);
    firstStageId = res.body.stages[0].id;
    secondStageId = res.body.stages[1].id;

    const board = await agent.get(`/api/deals/board?pipelineId=${pipelineId}`).expect(200);
    expect(board.body.columns.length).toBe(6);
    expect(board.body.columns.every((c: any) => c.count === 0)).toBe(true);
  });

  it('creates accounts, contacts and leads', async () => {
    const acc = await agent.post('/api/accounts').send({ name: `Acme ${suffix}` }).expect(201);
    expect(acc.body.name).toContain('Acme');

    const contact = await agent
      .post('/api/contacts')
      .send({ firstName: 'Jane', lastName: 'Doe', email: `jane-${suffix}@x.com`, accountId: acc.body.id })
      .expect(201);
    expect(contact.body.account.id).toBe(acc.body.id);

    const lead = await agent
      .post('/api/leads')
      .send({ firstName: 'John', lastName: 'Buyer', email: `john-${suffix}@x.com`, phone: '9991112222', company: 'BuyerCo' })
      .expect(201);
    expect(lead.body.status).toBe('NEW');
  });

  it('detects duplicates by email/phone', async () => {
    const res = await agent.get(`/api/leads/duplicates?email=john-${suffix}@x.com`).expect(200);
    expect(res.body.leads.length).toBeGreaterThanOrEqual(1);
  });

  it('converts a lead into a contact, account and deal', async () => {
    const lead = await agent
      .post('/api/leads')
      .send({ firstName: 'Convert', lastName: 'Me', email: `conv-${suffix}@x.com`, company: 'ConvertCo' })
      .expect(201);

    const conv = await agent
      .post(`/api/leads/${lead.body.id}/convert`)
      .send({ createAccount: true, createDeal: true, dealTitle: 'Big deal', pipelineId })
      .expect(201);
    expect(conv.body.contactId).toBeTruthy();
    expect(conv.body.accountId).toBeTruthy();
    expect(conv.body.dealId).toBeTruthy();

    const reloaded = await agent.get(`/api/leads/${lead.body.id}`).expect(200);
    expect(reloaded.body.status).toBe('CONVERTED');

    const board = await agent.get(`/api/deals/board?pipelineId=${pipelineId}`).expect(200);
    const totalDeals = board.body.columns.reduce((s: number, c: any) => s + c.count, 0);
    expect(totalDeals).toBe(1);
  });

  it('creates and moves a deal across stages (Kanban)', async () => {
    const deal = await agent
      .post('/api/deals')
      .send({ title: 'Movable', pipelineId, value: 50000 })
      .expect(201);
    expect(deal.body.stage.id).toBe(firstStageId);

    const moved = await agent
      .post(`/api/deals/${deal.body.id}/move`)
      .send({ stageId: secondStageId })
      .expect(201);
    expect(moved.body.stage.id).toBe(secondStageId);

    // Rejects a stage from a different pipeline.
    const other = await agent.post('/api/pipelines').send({ name: 'Other' }).expect(201);
    await agent
      .post(`/api/deals/${deal.body.id}/move`)
      .send({ stageId: other.body.stages[0].id })
      .expect(400);
  });

  it('records and lists an activity on the timeline', async () => {
    const deal = await agent.post('/api/deals').send({ title: 'WithActivity', pipelineId }).expect(201);
    await agent
      .post('/api/activities')
      .send({ type: 'CALL', subject: 'Intro call', dealId: deal.body.id })
      .expect(201);

    const timeline = await agent.get(`/api/activities/timeline/deal/${deal.body.id}`).expect(200);
    expect(timeline.body.length).toBe(1);
    expect(timeline.body[0].subject).toBe('Intro call');
  });

  it('enforces data scope: a Sales Rep sees only their own leads', async () => {
    // Admin creates a lead they own.
    const adminLead = await agent
      .post('/api/leads')
      .send({ firstName: 'Admin', lastName: 'Owned', email: `adminlead-${suffix}@x.com` })
      .expect(201);

    // Admin provisions a Sales Rep (OWN scope).
    const roles = await agent.get('/api/roles').expect(200);
    const repRole = roles.body.find((r: any) => r.name === 'Sales Rep');
    const repEmail = `rep-${suffix}@test.local`;
    await agent
      .post('/api/users')
      .send({ email: repEmail, fullName: 'Rep', roleId: repRole.id, password: 'Password123' })
      .expect(201);

    const rep = request.agent(app.getHttpServer());
    await rep.post('/api/auth/login').send({ email: repEmail, password: 'Password123' }).expect(201);

    // Rep creates their own lead.
    const repLead = await rep
      .post('/api/leads')
      .send({ firstName: 'Rep', lastName: 'Owned', email: `replead-${suffix}@x.com` })
      .expect(201);

    // Rep's list contains their lead but NOT the admin's.
    const list = await rep.get('/api/leads?pageSize=200').expect(200);
    const ids = list.body.items.map((l: any) => l.id);
    expect(ids).toContain(repLead.body.id);
    expect(ids).not.toContain(adminLead.body.id);

    // Rep cannot fetch the admin's lead by id.
    await rep.get(`/api/leads/${adminLead.body.id}`).expect(404);

    // Rep cannot delete leads (no lead:delete permission).
    await rep.delete(`/api/leads/${repLead.body.id}`).expect(403);
  });

  it('authorizes what lead conversion creates (deal:create required)', async () => {
    // Custom role: may edit leads + create contacts, but NOT deals/accounts.
    const role = await agent
      .post('/api/roles')
      .send({
        name: 'Converter',
        dataScope: 'TENANT',
        permissions: ['lead:view', 'lead:edit', 'contact:view', 'contact:create'],
      })
      .expect(201);
    const email = `converter-${suffix}@test.local`;
    await agent
      .post('/api/users')
      .send({ email, fullName: 'Converter', roleId: role.body.id, password: 'Password123' })
      .expect(201);

    const lead = await agent
      .post('/api/leads')
      .send({ firstName: 'Auth', lastName: 'Gap', email: `authgap-${suffix}@x.com`, company: 'GapCo' })
      .expect(201);

    const conv = request.agent(app.getHttpServer());
    await conv.post('/api/auth/login').send({ email, password: 'Password123' }).expect(201);

    // Creating a deal during convert is blocked (no deal:create).
    await conv.post(`/api/leads/${lead.body.id}/convert`).send({ createDeal: true, pipelineId }).expect(403);
    // Contact-only conversion is allowed.
    await conv.post(`/api/leads/${lead.body.id}/convert`).send({}).expect(201);
  });

  it('merges custom fields on partial update (no data loss)', async () => {
    await agent.post('/api/custom-fields').send({ objectType: 'Lead', name: 'Budget', apiName: 'budget', type: 'NUMBER' }).expect(201);
    await agent.post('/api/custom-fields').send({ objectType: 'Lead', name: 'Region', apiName: 'region', type: 'TEXT' }).expect(201);

    const lead = await agent
      .post('/api/leads')
      .send({ firstName: 'CF', lastName: 'Test', email: `cf-${suffix}@x.com`, customFields: { budget: 1000, region: 'North' } })
      .expect(201);
    expect(lead.body.customFields).toEqual({ budget: 1000, region: 'North' });

    // Patch only `budget` — `region` must survive.
    await agent.patch(`/api/leads/${lead.body.id}`).send({ customFields: { budget: 2500 } }).expect(200);
    const reloaded = await agent.get(`/api/leads/${lead.body.id}`).expect(200);
    expect(reloaded.body.customFields).toEqual({ budget: 2500, region: 'North' });

    // Unknown custom field is rejected.
    await agent.patch(`/api/leads/${lead.body.id}`).send({ customFields: { nope: 1 } }).expect(400);
  });
});
