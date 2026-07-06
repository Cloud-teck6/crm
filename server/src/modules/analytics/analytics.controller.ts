import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { toCsv } from '../../common/util/csv';

@Controller('reports')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('kpis')
  @RequirePermissions('report:view')
  kpis(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.analytics.kpis(user, q);
  }

  @Get('leads-by-source')
  @RequirePermissions('report:view')
  leadsBySource(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.analytics.leadsBySource(user, q);
  }

  @Get('conversion-by-stage')
  @RequirePermissions('report:view')
  conversionByStage(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.analytics.conversionByStage(user, q);
  }

  @Get('rep-activity')
  @RequirePermissions('report:view')
  repActivity(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.analytics.repActivity(user, q);
  }

  @Get('attribution')
  @RequirePermissions('report:view')
  attribution(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.analytics.attribution(user, q);
  }

  // CSV export of any tabular report (respects the caller's data scope).
  @Get('export')
  @RequirePermissions('report:export')
  async export(@CurrentUser() user: AuthUser, @Query() q: any, @Res() res: Response) {
    let rows: any[];
    switch (q.metric) {
      case 'leads-by-source':
        rows = await this.analytics.leadsBySource(user, q);
        break;
      case 'rep-activity':
        rows = await this.analytics.repActivity(user, q);
        break;
      case 'attribution':
        rows = await this.analytics.attribution(user, q);
        break;
      case 'conversion-by-stage':
        rows = (await this.analytics.conversionByStage(user, q)).stages;
        break;
      default:
        throw new BadRequestException('Unknown export metric');
    }
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${q.metric}.csv"`);
    res.send(csv);
  }
}
