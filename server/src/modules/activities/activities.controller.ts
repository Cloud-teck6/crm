import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateActivityDto, UpdateActivityDto } from './dto/activities.dto';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermissions('activity:view')
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.activities.list(user, query);
  }

  @Get('timeline/:recordType/:recordId')
  @RequirePermissions('activity:view')
  timeline(
    @Param('recordType') recordType: 'lead' | 'contact' | 'deal',
    @Param('recordId') recordId: string,
  ) {
    return this.activities.timeline(recordType, recordId);
  }

  @Post()
  @RequirePermissions('activity:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateActivityDto) {
    return this.activities.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('activity:edit')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.activities.update(user, id, dto);
  }

  @Post(':id/complete')
  @RequirePermissions('activity:edit')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.activities.setCompleted(user, id, true);
  }

  @Post(':id/reopen')
  @RequirePermissions('activity:edit')
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.activities.setCompleted(user, id, false);
  }

  @Delete(':id')
  @RequirePermissions('activity:delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.activities.remove(user, id);
  }
}
