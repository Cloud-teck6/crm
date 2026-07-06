import { BadRequestException, Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ScopeService } from '../../common/rbac/scope.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { ownerScopeWhere } from '../../common/crud/crud.util';
import { toCsv } from '../../common/util/csv';

const COLUMNS: Record<string, string[]> = {
  lead: ['id', 'firstName', 'lastName', 'email', 'phone', 'company', 'source', 'campaign', 'status', 'score', 'ownerId', 'createdAt'],
  contact: ['id', 'firstName', 'lastName', 'email', 'phone', 'accountId', 'ownerId', 'createdAt'],
  deal: ['id', 'title', 'value', 'currency', 'pipelineId', 'stageId', 'probability', 'ownerId', 'createdAt'],
};

@Controller('export')
export class ExportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  // GET /api/export/lead.csv — scope-aware list export.
  @Get(':object.csv')
  @RequirePermissions('lead:export')
  async export(@CurrentUser() user: AuthUser, @Param('object') object: string, @Res() res: Response) {
    const cols = COLUMNS[object];
    if (!cols) throw new BadRequestException('Exportable objects: lead, contact, deal');

    const ownerIds = await this.scope.visibleOwnerIds(user);
    const where = { deletedAt: null, ...ownerScopeWhere(ownerIds) } as any;
    const model = object === 'lead' ? this.prisma.client.lead : object === 'contact' ? this.prisma.client.contact : this.prisma.client.deal;
    const rows = await (model as any).findMany({ where, orderBy: { createdAt: 'desc' }, take: 50000 });

    const csv = toCsv(
      rows.map((r: any) => Object.fromEntries(cols.map((c) => [c, r[c] != null ? String(r[c]) : '']))),
      cols,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${object}s.csv"`);
    res.send(csv);
  }
}
