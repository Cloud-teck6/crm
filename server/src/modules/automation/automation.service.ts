import { Injectable, Logger } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { WorkflowEngine } from './workflow.engine';
import { evaluateConditions } from '../../common/rules/conditions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WebhooksOutService } from '../webhooks-out/webhooks-out.service';

/**
 * Entry point other modules call on domain events. Never throws into the caller
 * — automation must not break lead creation / deal moves.
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly engine: WorkflowEngine,
    private readonly webhooksOut: WebhooksOutService,
  ) {}

  async onLeadCreated(tenantId: string, lead: any) {
    try {
      lead.score = await this.scoring.scoreLead(tenantId, lead);
      await this.engine.run(tenantId, 'lead.created', 'lead', lead);
      await this.webhooksOut.dispatch(tenantId, 'lead.created', lead);
    } catch (err: any) {
      this.logger.error(`onLeadCreated failed: ${err.message}`);
    }
  }

  async onDealStageChanged(tenantId: string, deal: any) {
    try {
      await this.engine.run(tenantId, 'deal.stage_changed', 'deal', deal);
      await this.webhooksOut.dispatch(tenantId, 'deal.stage_changed', deal);
    } catch (err: any) {
      this.logger.error(`onDealStageChanged failed: ${err.message}`);
    }
  }

  /** Dry-run a workflow's conditions against a sample record (UI preview). */
  async testWorkflow(id: string, sample: Record<string, unknown>) {
    const wf = await this.prisma.client.workflow.findFirst({ where: { id, deletedAt: null } });
    if (!wf) return { matched: false, error: 'Workflow not found' };
    const matched = evaluateConditions(wf.conditions as any, sample);
    return { matched, actions: matched ? (wf.actions as any[]) : [] };
  }
}
