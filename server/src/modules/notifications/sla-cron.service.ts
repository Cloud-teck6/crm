import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * Periodic SLA sweep across all tenants. In-process scheduler (no Redis); for
 * multi-instance deployments move this behind a leader-elected BullMQ repeatable
 * job. Disable with DISABLE_CRON=true (e.g. for one-off worker processes).
 */
@Injectable()
export class SlaCronService {
  private readonly logger = new Logger(SlaCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweep() {
    if (process.env.DISABLE_CRON === 'true') return;
    const tenants = await this.prisma.client.tenant.findMany({ where: { deletedAt: null }, select: { id: true } });
    let escalated = 0;
    for (const t of tenants) {
      try {
        const res = await this.notifications.runSlaCheck(t.id);
        escalated += res.escalated;
      } catch (err) {
        this.logger.warn(`SLA sweep failed for tenant ${t.id}: ${err}`);
      }
    }
    if (escalated) this.logger.log(`SLA sweep escalated ${escalated} lead(s) across ${tenants.length} tenant(s)`);
  }
}
