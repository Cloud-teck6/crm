import { Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { CommsWebhookController } from './comms-webhook.controller';
import { MessagingService } from './messaging.service';
import { CallsService } from './calls.service';
import { TemplatesService } from './templates.service';

@Module({
  controllers: [MessagingController, CommsWebhookController],
  providers: [MessagingService, CallsService, TemplatesService],
  exports: [MessagingService],
})
export class MessagingModule {}
