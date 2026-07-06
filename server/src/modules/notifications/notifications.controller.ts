import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { UpdatePreferencesDto } from './dto/notifications.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // Per-user — any authenticated user sees their own notifications.
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.notifications.list(user, unread === 'true');
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Get('preferences')
  getPrefs(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreferences(user);
  }

  @Put('preferences')
  updatePrefs(@CurrentUser() user: AuthUser, @Body() dto: UpdatePreferencesDto) {
    return this.notifications.updatePreferences(user, dto);
  }

  // Admin/cron-triggered SLA sweep (the cron schedule lands in Phase 8).
  @Post('run-sla-check')
  @RequirePermissions('settings:manage')
  runSla(@CurrentUser() user: AuthUser) {
    return this.notifications.runSlaCheck(user.tenantId);
  }
}
