import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../../common/rbac/scope.service';
import { AuthUser } from '../../common/types/auth-user';
import { voiceAdapter } from '../../integrations/adapters/voice/log-voice.adapter';
import { ClickToCallDto, LogCallDto } from './dto/messaging.dto';

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly config: ConfigService,
  ) {}

  async clickToCall(user: AuthUser, dto: ClickToCallDto) {
    const record = await this.resolve(user, dto);
    const to = dto.to ?? record?.phone;
    if (!to) throw new BadRequestException('No number to dial');
    const from = this.config.get<string>('EXOTEL_CALLER_ID') ?? 'crm';

    const { providerCallId } = await voiceAdapter().click2call({ from, to, record: true });
    const call = await this.prisma.client.call.create({
      data: {
        direction: 'OUTBOUND',
        fromNumber: from,
        toNumber: to,
        providerCallId,
        disposition: 'initiated',
        ownerId: user.id,
        contactId: dto.contactId ?? null,
        leadId: dto.leadId ?? null,
        dealId: dto.dealId ?? null,
        startedAt: new Date(),
      } as any,
    });
    await this.audit.log({ action: 'call.initiate', resource: 'Call', resourceId: call.id, after: { to } });
    return call;
  }

  async logCall(user: AuthUser, dto: LogCallDto) {
    const call = await this.prisma.client.call.create({
      data: {
        direction: dto.direction,
        disposition: dto.disposition ?? null,
        notes: dto.notes ?? null,
        ownerId: user.id,
        contactId: dto.contactId ?? null,
        leadId: dto.leadId ?? null,
        dealId: dto.dealId ?? null,
        startedAt: new Date(),
      } as any,
    });
    await this.audit.log({ action: 'call.log', resource: 'Call', resourceId: call.id });
    return call;
  }

  /** Provider status/recording callback (public webhook). */
  async handleStatusCallback(payload: any) {
    const parsed = voiceAdapter().parseCallCallback!(payload);
    if (!parsed.providerCallId) return { ok: false };
    const call = await this.prisma.client.call.findFirst({ where: { providerCallId: parsed.providerCallId } });
    if (!call) return { ok: false };
    await this.prisma.client.call.updateMany({
      where: { id: call.id },
      data: {
        ...(parsed.duration !== undefined ? { duration: parsed.duration } : {}),
        ...(parsed.recordingUrl ? { recordingUrl: parsed.recordingUrl } : {}),
        ...(parsed.disposition ? { disposition: parsed.disposition } : {}),
      },
    });
    return { ok: true };
  }

  private async resolve(user: AuthUser, dto: ClickToCallDto): Promise<any | null> {
    if (dto.contactId) {
      const record = await this.prisma.client.contact.findFirst({ where: { id: dto.contactId, deletedAt: null } });
      if (!record) throw new NotFoundException('Contact not found');
      if (!(await this.scope.canSeeOwner(user, record.ownerId))) throw new ForbiddenException('Out of scope');
      return record;
    }
    if (dto.leadId) {
      const record = await this.prisma.client.lead.findFirst({ where: { id: dto.leadId, deletedAt: null } });
      if (!record) throw new NotFoundException('Lead not found');
      if (!(await this.scope.canSeeOwner(user, record.ownerId))) throw new ForbiddenException('Out of scope');
      return record;
    }
    return null;
  }
}
