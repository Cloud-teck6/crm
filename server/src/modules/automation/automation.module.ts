import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { WorkflowService } from './workflow.service';
import { WorkflowEngine } from './workflow.engine';
import { ScoringService } from './scoring.service';
import { AssignmentService } from './assignment.service';

@Module({
  imports: [MessagingModule],
  controllers: [AutomationController],
  providers: [AutomationService, WorkflowService, WorkflowEngine, ScoringService, AssignmentService],
  exports: [AutomationService],
})
export class AutomationModule {}
