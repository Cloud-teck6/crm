import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'node:crypto';
import { IntegrationProvider } from '@prisma/client';
import { MessagingService } from './messaging.service';
import { CallsService } from './calls.service';
import { Public } from '../../common/decorators/public.decorator';

interface InboundItem {
  from: string;
  body: string;
  providerMessageId?: string;
  to?: string;
}

/** Public inbound webhooks for the communication hub (no JWT). */
@Controller('webhooks')
@Public()
export class CommsWebhookController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly calls: CallsService,
  ) {}

  // WhatsApp Cloud API verification handshake (same shape as Meta).
  @Get('whatsapp/:connectionId')
  async whatsappChallenge(@Param('connectionId') id: string, @Query() q: any) {
    const conn = await this.resolve(id, IntegrationProvider.WHATSAPP);
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === (conn.config as any)?.verifyToken) {
      return q['hub.challenge'];
    }
    throw new ForbiddenException('Verification failed');
  }

  @Post('whatsapp/:connectionId')
  @HttpCode(200)
  async whatsapp(@Param('connectionId') id: string, @Req() req: RawBodyRequest<Request>, @Body() body: any) {
    const conn = await this.resolve(id, IntegrationProvider.WHATSAPP);
    // Enforce X-Hub-Signature-256 when an app secret is configured.
    const appSecret = (conn.config as any)?.appSecret;
    if (appSecret) {
      const raw = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
      const provided = Buffer.from((req.headers['x-hub-signature-256'] as string) || '');
      const expectedBuf = Buffer.from(expected);
      if (provided.length !== expectedBuf.length || !crypto.timingSafeEqual(provided, expectedBuf)) {
        throw new UnauthorizedException('Invalid signature');
      }
    }
    const items = this.parseInbound(IntegrationProvider.WHATSAPP, body);
    const results: any[] = [];
    for (const item of items) results.push(await this.messaging.handleInbound(conn, item));
    return { ok: true, received: results.length };
  }

  @Post('sms/:connectionId')
  @HttpCode(200)
  sms(@Param('connectionId') id: string, @Body() body: any) {
    return this.ingest(id, IntegrationProvider.SMS, body);
  }

  @Post('email/inbound/:connectionId')
  @HttpCode(200)
  email(@Param('connectionId') id: string, @Body() body: any) {
    return this.ingest(id, IntegrationProvider.EMAIL, body);
  }

  // Telephony status / recording callback.
  @Post('voice/status')
  @HttpCode(200)
  voiceStatus(@Body() body: any) {
    return this.calls.handleStatusCallback(body);
  }

  private async ingest(connectionId: string, provider: IntegrationProvider, body: any) {
    const conn = await this.resolve(connectionId, provider);
    const items = this.parseInbound(provider, body);
    const results: any[] = [];
    for (const item of items) results.push(await this.messaging.handleInbound(conn, item));
    return { ok: true, received: results.length };
  }

  private async resolve(connectionId: string, provider: IntegrationProvider) {
    const conn = await this.messaging.resolveConnection(connectionId);
    if (!conn || conn.provider !== provider) throw new NotFoundException('Unknown connection');
    if (!conn.isActive) throw new ForbiddenException('Connection is disabled');
    return conn;
  }

  /** Map provider payloads (Cloud API shape or normalized keys) to inbound items. */
  private parseInbound(provider: IntegrationProvider, body: any): InboundItem[] {
    if (provider === IntegrationProvider.WHATSAPP && body?.entry) {
      const out: InboundItem[] = [];
      for (const e of body.entry ?? []) {
        for (const c of e.changes ?? []) {
          const v = c.value ?? {};
          for (const m of v.messages ?? []) {
            out.push({
              from: m.from,
              body: m.text?.body ?? m.button?.text ?? '',
              providerMessageId: m.id,
              to: v.metadata?.display_phone_number,
            });
          }
        }
      }
      return out;
    }
    // Normalized / common provider keys (Twilio, MSG91, SendGrid, generic).
    const from = body?.from ?? body?.From ?? body?.sender ?? body?.mobile;
    const text = body?.body ?? body?.text ?? body?.Body ?? body?.message ?? body?.content;
    const id = body?.providerMessageId ?? body?.id ?? body?.MessageSid ?? body?.message_id;
    const to = body?.to ?? body?.To;
    if (from && text != null) {
      return [{ from: String(from), body: String(text), providerMessageId: id ? String(id) : undefined, to: to ? String(to) : undefined }];
    }
    return [];
  }
}
