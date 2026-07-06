import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getStore } from '../../common/context/request-context';

export interface AuditInput {
  action: string;
  resource: string;
  resourceId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  // Overrides (used pre-auth, e.g. login, where there is no request store).
  tenantId?: string;
  actorId?: string | null;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Writing an audit row must never break the underlying operation.
  async log(input: AuditInput): Promise<void> {
    const store = getStore();
    const tenantId = input.tenantId ?? store?.tenantId;
    if (!tenantId) {
      this.logger.warn(`Skipping audit "${input.action}" — no tenant in context`);
      return;
    }
    try {
      await this.prisma.client.auditLog.create({
        data: {
          tenantId,
          actorId: input.actorId !== undefined ? input.actorId : store?.userId ?? null,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId ?? null,
          before: input.before === null ? Prisma.JsonNull : input.before,
          after: input.after === null ? Prisma.JsonNull : input.after,
          ip: input.ip ?? store?.ip ?? null,
          userAgent: input.userAgent ?? store?.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log "${input.action}": ${err}`);
    }
  }
}
