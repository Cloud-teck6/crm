import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantExtension } from './tenant.extension';

function buildClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  }).$extends(tenantExtension);
}

export type TenantPrismaClient = ReturnType<typeof buildClient>;

/**
 * Injectable wrapper around the tenant-scoped Prisma client.
 * Access models via `prisma.client.<model>` — the `client` is always the
 * extended, tenant-isolating client (see tenant.extension.ts).
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public readonly client: TenantPrismaClient;
  private readonly base: PrismaClient;

  constructor() {
    this.base = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    this.client = this.base.$extends(tenantExtension) as unknown as TenantPrismaClient;
  }

  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    // Connect eagerly, but don't crash the app if the DB isn't up yet — Prisma
    // reconnects lazily on the first query, and /health reports DB status.
    try {
      await this.base.$connect();
    } catch (err) {
      this.logger.warn(`Database not reachable at startup: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }
}
