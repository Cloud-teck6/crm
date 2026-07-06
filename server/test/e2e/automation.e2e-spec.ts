import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';

/**
 * Phase 5 (Automation & scoring) e2e — requires a migrated Postgres.
 * Headline acceptance: a no-code workflow ("new lead from CampaignX with
 * budget > Y → assign senior rep + send WhatsApp template + create task") runs
 * end-to-end. Also covers rule-based lead scoring and permission gating.
 */
describe('Automation & scoring (e2e)', () => {
  let app: INestApplication;
  let server: any;
  const suffix = randomUUID().slice(0, 8);
  const admin = { companyName: `Auto Co ${suffix}`, fullName: 'Admin', email: `admin-${suffix}@test.local`, password: 'Password123' };
  let agent: ReturnType<typeof request.agent>;
  let managerId: string;
  let managerRoleId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
    agent = request.agent(server);
    await agent.post('/api/auth/register').send(admin).expect(201);

    // Custom field so leads can carry a numeric budget.
    await agent.post('/api/custom-fields').send({ objectType: 'Lead', name: 'Budget', apiName: 'budget', type: 'NUMBER' }).expect(201);

    // A "senior rep" — a Manager-role user to route hot leads to.
    const roles = await agent.get('/api/roles').expect(200);
    managerRoleId = roles.body.find((r: any) => r.name === 'Manager').id;
    const mgr = await agent.post('/api/users').send({ email: `mgr-${suffix}@test.local`, fullName: 'Senior Rep', roleId: managerRoleId, password: 'Password123' }).expect(201);
    managerId = mgr.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('scores a lead from active scoring rules on creation', async () => {
    await agent
      .post('/api/scoring-rules')
      .send({ name: `big-budget-${suffix}`, condition: { match: 'AND', rules: [{ field: 'budget', op: 'gte', value: 100000 }] }, points: 50 })
      .expect(201);

    const lead = await agent
      .post('/api/leads')
      .send({ firstName: 'Scored', email: `scored-${suffix}@x.com`, customFields: { budget: 200000 } })
      .expect(201);
    expect(lead.body.score).toBe(50);

    const low = await agent
      .post('/api/leads')
      .send({ firstName: 'LowBudget', email: `low-${suffix}@x.com`, customFields: { budget: 1000 } })
      .expect(201);
    expect(low.body.score).toBe(0);
  });

  it('runs the headline workflow end-to-end', async () => {
    const tpl = await agent
      .post('/api/templates')
      .send({ name: `hot-${suffix}`, channel: 'WHATSAPP', body: 'Hi {{firstName}}, a senior rep will call shortly.', status: 'APPROVED' })
      .expect(201);

    const wf = await agent
      .post('/api/workflows')
      .send({
        name: `hot-leads-${suffix}`,
        trigger: { type: 'lead.created' },
        conditions: { match: 'AND', rules: [{ field: 'campaign', op: 'eq', value: 'CampaignX' }, { field: 'budget', op: 'gt', value: 50000 }] },
        actions: [
          { type: 'assign_owner', config: { roleId: managerRoleId } },
          { type: 'send_message', config: { channel: 'WHATSAPP', templateId: tpl.body.id } },
          { type: 'create_task', config: { subject: 'Call hot lead', dueInDays: 1 } },
          { type: 'add_tag', config: { tag: 'hot' } },
        ],
        isActive: true,
      })
      .expect(201);

    // dry-run preview
    const test = await agent.post(`/api/workflows/${wf.body.id}/test`).send({ campaign: 'CampaignX', budget: 200000 }).expect(201);
    expect(test.body.matched).toBe(true);

    // A matching lead fires the whole workflow.
    const lead = await agent
      .post('/api/leads')
      .send({ firstName: 'Hot', lastName: 'Prospect', email: `hot-${suffix}@x.com`, phone: '919810022334', campaign: 'CampaignX', customFields: { budget: 200000 } })
      .expect(201);

    // assign_owner → the senior rep; add_tag → "hot".
    expect(lead.body.ownerId).toBe(managerId);
    expect(lead.body.tags).toContain('hot');

    // send_message → a WhatsApp message on the lead.
    const msgs = await agent.get(`/api/messages?leadId=${lead.body.id}`).expect(200);
    const wa = msgs.body.items.find((m: any) => m.channel === 'WHATSAPP');
    expect(wa).toBeTruthy();
    expect(wa.body).toBe('Hi Hot, a senior rep will call shortly.');

    // create_task → a TASK activity on the lead.
    const acts = await agent.get(`/api/activities?leadId=${lead.body.id}`).expect(200);
    expect(acts.body.items.some((a: any) => a.type === 'TASK' && a.subject === 'Call hot lead')).toBe(true);
  });

  it('does not fire the workflow for non-matching leads', async () => {
    const lead = await agent
      .post('/api/leads')
      .send({ firstName: 'Cold', email: `cold-${suffix}@x.com`, phone: '919810022999', campaign: 'OtherCampaign', customFields: { budget: 200000 } })
      .expect(201);
    expect(lead.body.tags).not.toContain('hot');
    const msgs = await agent.get(`/api/messages?leadId=${lead.body.id}`).expect(200);
    expect(msgs.body.items.length).toBe(0);
  });

  it('requires workflow:manage to create workflows', async () => {
    const roles = await agent.get('/api/roles').expect(200);
    const repRole = roles.body.find((r: any) => r.name === 'Sales Rep');
    const email = `rep-${suffix}@test.local`;
    await agent.post('/api/users').send({ email, fullName: 'Rep', roleId: repRole.id, password: 'Password123' }).expect(201);

    const rep = request.agent(server);
    await rep.post('/api/auth/login').send({ email, password: 'Password123' }).expect(201);
    await rep
      .post('/api/workflows')
      .send({ name: 'nope', trigger: { type: 'lead.created' }, actions: [] })
      .expect(403);
  });
});
