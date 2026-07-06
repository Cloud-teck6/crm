import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AssignmentService } from './assignment.service';
import { MessagingService } from '../messaging/messaging.service';
import { evaluateConditions } from '../../common/rules/conditions';

type Entity = 'lead' | 'deal' | 'contact';

interface ActionResult {
  type: string;
  status: 'done' | 'skipped' | 'failed';
  detail?: string;
}

/**
 * Executes workflows whose trigger matches an event: evaluate conditions, then
 * run actions in order. Tenant-explicit throughout so it runs in any context.
 */
@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assignment: AssignmentService,
    private readonly messaging: MessagingService,
  ) {}

  async run(tenantId: string, triggerType: string, entity: Entity, record: any) {
    const workflows = await this.prisma.client.workflow.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
    });
    const matched = workflows.filter((w) => (w.trigger as any)?.type === triggerType);

    const fired: Array<{ workflowId: string; results: ActionResult[] }> = [];
    for (const wf of matched) {
      if (!evaluateConditions(wf.conditions as any, record)) continue;
      const results: ActionResult[] = [];
      for (const action of (wf.actions as any[]) ?? []) {
        results.push(await this.execute(tenantId, entity, record, action));
      }
      await this.audit.log({
        tenantId,
        actorId: null,
        action: 'workflow.run',
        resource: 'Workflow',
        resourceId: wf.id,
        after: { trigger: triggerType, entityId: record.id, results } as any,
      });
      fired.push({ workflowId: wf.id, results });
    }
    return { fired };
  }

  private async execute(tenantId: string, entity: Entity, record: any, action: any): Promise<ActionResult> {
    try {
      const cfg = action.config ?? {};
      switch (action.type) {
        case 'assign_owner': {
          const ownerId = await this.assignment.assign(tenantId, record, cfg);
          if (!ownerId) return { type: action.type, status: 'skipped', detail: 'no eligible owner' };
          await this.updateEntity(tenantId, entity, record.id, { ownerId });
          record.ownerId = ownerId;
          return { type: action.type, status: 'done', detail: ownerId };
        }
        case 'send_message': {
          const msg = await this.messaging.sendSystem(tenantId, {
            channel: cfg.channel,
            contactId: record.contactId ?? (entity === 'contact' ? record.id : undefined),
            leadId: entity === 'lead' ? record.id : undefined,
            dealId: entity === 'deal' ? record.id : undefined,
            templateId: cfg.templateId,
            templateVars: cfg.templateVars,
            body: cfg.body,
          });
          return msg ? { type: action.type, status: 'done' } : { type: action.type, status: 'skipped', detail: 'no recipient/template' };
        }
        case 'create_task': {
          await this.prisma.client.activity.create({
            data: {
              tenantId,
              type: 'TASK',
              subject: cfg.subject ?? 'Follow up',
              body: cfg.body ?? null,
              assigneeId: record.ownerId ?? null,
              dueAt: cfg.dueInDays ? new Date(Date.now() + Number(cfg.dueInDays) * 86400000) : null,
              leadId: entity === 'lead' ? record.id : record.leadId ?? null,
              contactId: entity === 'contact' ? record.id : record.contactId ?? null,
              dealId: entity === 'deal' ? record.id : null,
            } as any,
          });
          return { type: action.type, status: 'done' };
        }
        case 'update_field': {
          if (!cfg.field) return { type: action.type, status: 'skipped' };
          await this.updateEntity(tenantId, entity, record.id, { [cfg.field]: cfg.value });
          record[cfg.field] = cfg.value;
          return { type: action.type, status: 'done', detail: `${cfg.field}=${cfg.value}` };
        }
        case 'add_tag': {
          const tags = Array.isArray(record.tags) ? record.tags : [];
          if (cfg.tag && !tags.includes(cfg.tag)) {
            const next = [...tags, cfg.tag];
            await this.updateEntity(tenantId, entity, record.id, { tags: next });
            record.tags = next;
          }
          return { type: action.type, status: 'done' };
        }
        case 'webhook': {
          if (!cfg.url) return { type: action.type, status: 'skipped' };
          await fetch(cfg.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity, record, event: action.event ?? null }),
          });
          return { type: action.type, status: 'done' };
        }
        case 'wait':
          // Deferred delays need the BullMQ scheduler (Phase 8); skipped synchronously.
          return { type: action.type, status: 'skipped', detail: 'wait requires scheduler' };
        default:
          return { type: action.type, status: 'skipped', detail: 'unknown action' };
      }
    } catch (err: any) {
      this.logger.error(`Action ${action.type} failed: ${err.message}`);
      return { type: action.type, status: 'failed', detail: err.message };
    }
  }

  private async updateEntity(tenantId: string, entity: Entity, id: string, data: any) {
    const model =
      entity === 'lead' ? this.prisma.client.lead : entity === 'deal' ? this.prisma.client.deal : this.prisma.client.contact;
    await (model as any).updateMany({ where: { id, tenantId }, data });
  }
}
