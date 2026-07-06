import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [AutomationModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
