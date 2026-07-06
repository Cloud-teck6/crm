import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit:view')
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('resource') resource?: string,
    @Query('action') action?: string,
  ) {
    const take = Math.min(Number(pageSize) || 50, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // tenantId injected by the Prisma tenant extension.
    const where = {
      ...(resource ? { resource } : {}),
      ...(action ? { action: { contains: action, mode: 'insensitive' as const } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    return { items, total, page: Number(page) || 1, pageSize: take };
  }
}
