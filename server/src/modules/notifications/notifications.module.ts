import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SlaCronService } from './sla-cron.service';

// Global so any module can inject NotificationsService.notify().
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SlaCronService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
