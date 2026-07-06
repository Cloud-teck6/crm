import { Global, Module } from '@nestjs/common';
import { WebhooksOutController } from './webhooks-out.controller';
import { WebhooksOutService } from './webhooks-out.service';

// Global so AutomationService can dispatch outbound webhooks on events.
@Global()
@Module({
  controllers: [WebhooksOutController],
  providers: [WebhooksOutService],
  exports: [WebhooksOutService],
})
export class WebhooksOutModule {}
