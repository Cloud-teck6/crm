import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';

/**
 * Phase 6 (Dashboards & notifications) e2e — requires a migrated Postgres.
 * Covers the analytics API (KPIs, leads-by-source incl. cost-per-lead,
 * conversion-by-stage, rep-activity), CSV export, the notification bell +
 * preferences/muting, and SLA escalation.
 */
describe('Dashboards & notifications (e2e)', () => {
  let app: INestApplication;
  let server: any;
  const suffix = randomUUID().slice(0, 8);
  const admin = { companyName: `Dash Co ${suffix}`, fullName: 'Admin', email: `admin-${suffix}@test.local`, password: 'Password123' };
  let agent: ReturnType<typeof request.agent>;
  let pipelineId: string;
  let stage2: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
    agent = request.agent(server);
    await agent.post('/api/auth/register').send(admin).expect(201);

    // SLA window 0 (so any uncontacted lead breaches) + ad spend for CPL.
    await agent.patch('/api/tenant').send({ settings: { slaMinutes: 0, adSpend: { meta_lead_ads: 10000 } } }).expect(200);

    // Leads across sources.
    await agent.post('/api/leads').send({ email: `m1-${suffix}@x.com`, source: 'meta_lead_ads' }).expect(201);
    await agent.post('/api/leads').send({ email: `m2-${suffix}@x.com`, source: 'meta_lead_ads' }).expect(201);
    await agent.post('/api/leads').send({ email: `w1-${suffix}@x.com`, source: 'website' }).expect(201);

    // Pipeline + deals for the funnel.
    const p = await agent.post('/api/pipelines').send({ name: 'Sales' }).expect(201);
    pipelineId = p.body.id;
    stage2 = p.body.stages[1].id;
    const d1 = await agent.post('/api/deals').send({ title: 'Deal A', pipelineId, value: 100000 }).expect(201);
    await agent.post('/api/deals').send({ title: 'Deal B', pipelineId, value: 50000 }).expect(201);
    await agent.post(`/api/deals/${d1.body.id}/move`).send({ stageId: stage2 }).expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns KPI cards', async () => {
    const kpis = (await agent.get('/api/reports/kpis').expect(200)).body;
    expect(kpis.totalLeads).toBeGreaterThanOrEqual(3);
    expect(kpis.openDeals).toBeGreaterThanOrEqual(2);
    expect(kpis).toHaveProperty('weightedForecast');
    expect(kpis).toHaveProperty('winRate');
  });

  it('reports leads by source with cost-per-lead', async () => {
    const rows = (await agent.get('/api/reports/leads-by-source').expect(200)).body;
    const meta = rows.find((r: any) => r.source === 'meta_lead_ads');
    expect(meta.count).toBe(2);
    expect(meta.costPerLead).toBe(5000); // 10000 spend / 2 leads
  });

  it('reports the conversion funnel by stage', async () => {
    const res = (await agent.get(`/api/reports/conversion-by-stage?pipelineId=${pipelineId}`).expect(200)).body;
    expect(res.stages.length).toBe(6);
    const total = res.stages.reduce((s: number, st: any) => s + st.count, 0);
    expect(total).toBe(2); // two deals
  });

  it('reports rep activity', async () => {
    const rows = (await agent.get('/api/reports/rep-activity').expect(200)).body;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]).toHaveProperty('leads');
    expect(rows[0]).toHaveProperty('wonValue');
  });

  it('exports a report as CSV', async () => {
    const res = await agent.get('/api/reports/export?metric=leads-by-source').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\n')[0]).toBe('source,count,converted,costPerLead');
    expect(res.text).toContain('meta_lead_ads,2');
  });

  it('delivers and clears bell notifications on deal stage change', async () => {
    const before = (await agent.get('/api/notifications/unread-count').expect(200)).body.unread;
    const d = await agent.post('/api/deals').send({ title: 'Notify Deal', pipelineId }).expect(201);
    await agent.post(`/api/deals/${d.body.id}/move`).send({ stageId: stage2 }).expect(201);

    const list = (await agent.get('/api/notifications').expect(200)).body;
    const moved = list.items.find((n: any) => n.title === 'Deal stage changed');
    expect(moved).toBeTruthy();
    expect(list.unread).toBeGreaterThan(before);

    await agent.post(`/api/notifications/${moved.id}/read`).expect(201);
    const after = (await agent.get('/api/notifications/unread-count').expect(200)).body.unread;
    expect(after).toBe(list.unread - 1);
  });

  it('respects muted triggers in preferences', async () => {
    await agent.put('/api/notifications/preferences').send({ channels: ['IN_APP'], mutedTriggers: ['deal.stage_changed'] }).expect(200);
    const prefs = (await agent.get('/api/notifications/preferences').expect(200)).body;
    expect(prefs.mutedTriggers).toContain('deal.stage_changed');

    const before = (await agent.get('/api/notifications/unread-count').expect(200)).body.unread;
    const d = await agent.post('/api/deals').send({ title: 'Muted Deal', pipelineId }).expect(201);
    await agent.post(`/api/deals/${d.body.id}/move`).send({ stageId: stage2 }).expect(201);
    const after = (await agent.get('/api/notifications/unread-count').expect(200)).body.unread;
    expect(after).toBe(before); // muted → no new notification
  });

  it('escalates uncontacted leads past the SLA', async () => {
    await agent.post('/api/leads').send({ firstName: 'Uncontacted', email: `sla-${suffix}@x.com` }).expect(201);
    const res = (await agent.post('/api/notifications/run-sla-check').expect(201)).body;
    expect(res.escalated).toBeGreaterThanOrEqual(1);

    const list = (await agent.get('/api/notifications').expect(200)).body;
    expect(list.items.some((n: any) => n.title.includes('SLA'))).toBe(true);

    // Idempotent: a second run does not re-escalate the same lead.
    const second = (await agent.post('/api/notifications/run-sla-check').expect(201)).body;
    expect(second.escalated).toBe(0);
  });
});
