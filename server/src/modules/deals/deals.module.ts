import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [AutomationModule],
  controllers: [DealsController],
  providers: [DealsService],
})
export class DealsModule {}
