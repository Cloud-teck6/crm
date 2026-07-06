import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/types/auth-user';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/automation.dto';

export const TRIGGER_TYPES = ['lead.created', 'lead.updated', 'deal.stage_changed', 'message.inbound'];
export const ACTION_TYPES = ['assign_owner', 'send_message', 'create_task', 'update_field', 'add_tag', 'webhook', 'wait'];

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.client.workflow.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const wf = await this.prisma.client.workflow.findFirst({ where: { id, deletedAt: null } });
    if (!wf) throw new NotFoundException('Workflow not found');
    return wf;
  }

  async create(user: AuthUser, dto: CreateWorkflowDto) {
    this.validate(dto.trigger, dto.actions);
    const wf = await this.prisma.client.workflow.create({
      data: {
        name: dto.name,
        trigger: dto.trigger as any,
        conditions: (dto.conditions ?? {}) as any,
        actions: dto.actions as any,
        isActive: dto.isActive ?? false,
        createdById: user.id,
      } as any,
    });
    await this.audit.log({ action: 'workflow.create', resource: 'Workflow', resourceId: wf.id, after: { name: wf.name } });
    return wf;
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    await this.get(id);
    if (dto.trigger || dto.actions) this.validate(dto.trigger, dto.actions);
    await this.prisma.client.workflow.updateMany({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.trigger !== undefined ? { trigger: dto.trigger as any } : {}),
        ...(dto.conditions !== undefined ? { conditions: dto.conditions as any } : {}),
        ...(dto.actions !== undefined ? { actions: dto.actions as any } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ action: 'workflow.update', resource: 'Workflow', resourceId: id });
    return this.get(id);
  }

  async remove(id: string) {
    const res = await this.prisma.client.workflow.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (res.count === 0) throw new NotFoundException('Workflow not found');
    await this.audit.log({ action: 'workflow.delete', resource: 'Workflow', resourceId: id });
    return { ok: true };
  }

  private validate(trigger?: any, actions?: any[]) {
    if (trigger && !TRIGGER_TYPES.includes(trigger.type)) {
      throw new BadRequestException(`Unknown trigger type. Allowed: ${TRIGGER_TYPES.join(', ')}`);
    }
    for (const a of actions ?? []) {
      if (!ACTION_TYPES.includes(a?.type)) {
        throw new BadRequestException(`Unknown action type "${a?.type}". Allowed: ${ACTION_TYPES.join(', ')}`);
      }
    }
  }
}
