import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';

/**
 * Full Phase-1 acceptance e2e. Requires a reachable, migrated Postgres
 * (DATABASE_URL). In CI: `prisma migrate deploy` then `npm test`.
 *
 * Verifies:
 *   1. Self-serve register → login → /me round trip with cookies.
 *   2. RBAC: a Read-Only user is denied user:create on the API (403).
 *   3. Tenant isolation: tenant A cannot see tenant B's users (list + by id).
 *   4. Refresh + logout.
 */
describe('Auth + RBAC + Tenant isolation (e2e)', () => {
  let app: INestApplication;

  const suffix = randomUUID().slice(0, 8);
  const tenantA = {
    companyName: `Agency A ${suffix}`,
    fullName: 'Admin A',
    email: `admin-a-${suffix}@test.local`,
    password: 'Password123',
  };
  const tenantB = {
    companyName: `Agency B ${suffix}`,
    fullName: 'Admin B',
    email: `admin-b-${suffix}@test.local`,
    password: 'Password123',
  };
  const readOnlyUser = {
    email: `readonly-${suffix}@test.local`,
    fullName: 'Read Only',
    password: 'Password123',
  };
  // Login accepts only credentials (the strict validation pipe rejects extras).
  const credsA = { email: tenantA.email, password: tenantA.password };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers tenant A and returns an authenticated session', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/api/auth/register').send(tenantA).expect(201);
    expect(res.body.tenant.slug).toContain('agency-a');
    expect(JSON.stringify(res.headers['set-cookie'])).toContain('access_token');

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.email).toBe(tenantA.email.toLowerCase());
    expect(me.body.role.name).toBe('Super Admin');
    expect(me.body.permissions).toContain('user:create');
  });

  it('denies a Read-Only user from creating users (RBAC 403)', async () => {
    // Admin A logs in.
    const admin = request.agent(app.getHttpServer());
    await admin.post('/api/auth/login').send(credsA).expect(201);

    // Find the seeded Read-Only role.
    const roles = await admin.get('/api/roles').expect(200);
    const readOnlyRole = roles.body.find((r: any) => r.name === 'Read-Only / Client');
    expect(readOnlyRole).toBeTruthy();

    // Admin creates a Read-Only user.
    await admin
      .post('/api/users')
      .send({ ...readOnlyUser, roleId: readOnlyRole.id })
      .expect(201);

    // That user logs in and is blocked from creating users.
    const ro = request.agent(app.getHttpServer());
    await ro.post('/api/auth/login').send({ email: readOnlyUser.email, password: readOnlyUser.password }).expect(201);

    await ro
      .post('/api/users')
      .send({ email: `x-${suffix}@test.local`, fullName: 'X', roleId: readOnlyRole.id, password: 'Password123' })
      .expect(403);

    // ...but can read the permission catalog (no record data).
    await ro.get('/api/roles/permission-catalog').expect(200);
  });

  it('isolates data between tenants', async () => {
    const adminA = request.agent(app.getHttpServer());
    await adminA.post('/api/auth/login').send(credsA).expect(201);

    const adminB = request.agent(app.getHttpServer());
    await adminB.post('/api/auth/register').send(tenantB).expect(201);

    // Admin B creates a user in tenant B.
    const rolesB = await adminB.get('/api/roles').expect(200);
    const repRoleB = rolesB.body.find((r: any) => r.name === 'Sales Rep');
    const created = await adminB
      .post('/api/users')
      .send({
        email: `rep-b-${suffix}@test.local`,
        fullName: 'Rep B',
        roleId: repRoleB.id,
        password: 'Password123',
      })
      .expect(201);
    const repBId = created.body.id;

    // Admin A's user list must not contain tenant B's user.
    const listA = await adminA.get('/api/users?pageSize=200').expect(200);
    const emails = listA.body.items.map((u: any) => u.email);
    expect(emails).not.toContain(`rep-b-${suffix}@test.local`);

    // Admin A fetching tenant B's user by id → 404 (scoped away).
    await adminA.get(`/api/users/${repBId}`).expect(404);
  });

  it('refreshes and logs out', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send(credsA).expect(201);
    await agent.post('/api/auth/refresh').expect(201);
    await agent.post('/api/auth/logout').expect(201);
    // After logout the access cookie is cleared → /me is unauthorized.
    await agent.get('/api/auth/me').expect(401);
  });
});
