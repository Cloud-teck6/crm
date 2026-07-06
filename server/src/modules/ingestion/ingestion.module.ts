import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [AutomationModule],
  providers: [IngestionService],
  controllers: [IngestionController],
  exports: [IngestionService],
})
export class IngestionModule {}
