import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageChannel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/types/auth-user';
import { extractVariables } from './render';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/messaging.dto';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(channel?: MessageChannel) {
    return this.prisma.client.messageTemplate.findMany({
      where: { deletedAt: null, ...(channel ? { channel } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const t = await this.prisma.client.messageTemplate.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async create(user: AuthUser, dto: CreateTemplateDto) {
    const exists = await this.prisma.client.messageTemplate.findFirst({
      where: { channel: dto.channel, name: dto.name, deletedAt: null },
    });
    if (exists) throw new BadRequestException('A template with that name already exists for this channel');

    // Non-WhatsApp templates need no external approval; default them APPROVED.
    const status = dto.status ?? (dto.channel === MessageChannel.WHATSAPP ? 'DRAFT' : 'APPROVED');
    const template = await this.prisma.client.messageTemplate.create({
      data: {
        name: dto.name,
        channel: dto.channel,
        category: dto.category ?? null,
        language: dto.language ?? 'en',
        subject: dto.subject ?? null,
        body: dto.body,
        variables: extractVariables(dto.body),
        status,
        createdById: user.id,
      } as any,
    });
    await this.audit.log({ action: 'template.create', resource: 'MessageTemplate', resourceId: template.id, after: { name: template.name, channel: template.channel } });
    return template;
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.get(id);
    const data: any = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
    if (dto.body !== undefined) {
      data.body = dto.body;
      data.variables = extractVariables(dto.body);
    }
    await this.prisma.client.messageTemplate.updateMany({ where: { id }, data });
    await this.audit.log({ action: 'template.update', resource: 'MessageTemplate', resourceId: id });
    return this.get(id);
  }

  async remove(id: string) {
    const res = await this.prisma.client.messageTemplate.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Template not found');
    await this.audit.log({ action: 'template.delete', resource: 'MessageTemplate', resourceId: id });
    return { ok: true };
  }
}
