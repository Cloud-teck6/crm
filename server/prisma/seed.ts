/**
 * Idempotent seed:
 *  - Populates the global Permission catalog.
 *  - Creates a demo tenant with the 7 default roles, a default pipeline,
 *    and a Super Admin user you can log in with.
 *
 * Re-running is safe (upserts). Credentials are dev-only; override via env.
 */
import { PrismaClient, DataScope } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS, DEFAULT_ROLES } from '../src/common/config/permissions';

const prisma = new PrismaClient();

const SEED_TENANT_SLUG = process.env.SEED_TENANT_SLUG || 'demo-agency';
const SEED_TENANT_NAME = process.env.SEED_TENANT_NAME || 'Demo Agency';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@demo.test';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Agency Admin';

async function main() {
  // 1. Global permission catalog
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { resource: p.resource, action: p.action, description: p.description },
      create: p,
    });
  }
  console.log(`Seeded ${PERMISSIONS.length} permissions.`);

  // 2. Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: SEED_TENANT_SLUG },
    update: {},
    create: {
      slug: SEED_TENANT_SLUG,
      name: SEED_TENANT_NAME,
      currency: process.env.DEFAULT_CURRENCY || 'INR',
      timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
    },
  });
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // 3. Default roles
  for (const r of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: r.name } },
      update: {
        description: r.description,
        dataScope: r.dataScope as DataScope,
        permissions: r.permissions,
        isSystem: true,
      },
      create: {
        tenantId: tenant.id,
        name: r.name,
        description: r.description,
        dataScope: r.dataScope as DataScope,
        permissions: r.permissions,
        isSystem: true,
      },
    });
  }
  console.log(`Seeded ${DEFAULT_ROLES.length} default roles.`);

  const superAdmin = await prisma.role.findUniqueOrThrow({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Super Admin' } },
  });

  // 4. Admin user
  const passwordHash = await argon2.hash(ADMIN_PASSWORD);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: ADMIN_EMAIL } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
      passwordHash,
      status: 'ACTIVE',
      roleId: superAdmin.id,
    },
  });
  console.log(`Admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  // 5. Default pipeline + stages
  const pipeline = await prisma.pipeline.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Sales Pipeline' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Sales Pipeline', isDefault: true },
  });
  const stages = [
    { name: 'New', order: 1, probability: 10 },
    { name: 'Contacted', order: 2, probability: 25 },
    { name: 'Qualified', order: 3, probability: 50 },
    { name: 'Proposal', order: 4, probability: 70 },
    { name: 'Won', order: 5, probability: 100, isWon: true },
    { name: 'Lost', order: 6, probability: 0, isLost: true },
  ];
  for (const s of stages) {
    const existing = await prisma.stage.findFirst({
      where: { tenantId: tenant.id, pipelineId: pipeline.id, name: s.name },
    });
    if (!existing) {
      await prisma.stage.create({
        data: { tenantId: tenant.id, pipelineId: pipeline.id, ...s },
      });
    }
  }
  console.log('Seeded default pipeline + stages.');
}

main()
  .then(() => console.log('Seed complete.'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
