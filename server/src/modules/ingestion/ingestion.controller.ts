import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { IntegrationProvider } from '@prisma/client';
import { IngestionService } from './ingestion.service';
import { Public } from '../../common/decorators/public.decorator';
import { getLeadSourceAdapter } from '../../integrations/adapters/registry';
import { InboundContext } from '../../integrations/lead-source-adapter.interface';

/**
 * Public inbound endpoints (no JWT). The connection id in the path + a
 * per-provider auth mechanism (API key / signature / shared key) authenticate
 * the caller and determine the tenant.
 */
@Controller()
@Public()
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  private buildCtx(req: RawBodyRequest<Request>, connection: any): InboundContext {
    const xff = req.headers['x-forwarded-for'];
    const sourceIp =
      (typeof xff === 'string' && xff.split(',')[0].trim()) || req.ip || req.socket?.remoteAddress || undefined;
    return {
      headers: req.headers,
      rawBody: req.rawBody ?? Buffer.from(JSON.stringify((req as any).body ?? {})),
      query: req.query as Record<string, unknown>,
      sourceIp: sourceIp || undefined,
      connection: { id: connection.id, config: connection.config, secretsRef: connection.secretsRef },
    };
  }

  private async resolveOrThrow(connectionId: string, provider: IntegrationProvider) {
    const conn = await this.ingestion.resolveConnection(connectionId);
    if (!conn || conn.provider !== provider) throw new NotFoundException('Unknown connection');
    if (!conn.isActive) throw new ForbiddenException('Connection is disabled');
    return conn;
  }

  // ── Generic inbound API (X-Api-Key) ──────────────────────────────────────
  @Post('ingest/:connectionId')
  @HttpCode(202)
  async generic(@Param('connectionId') connectionId: string, @Req() req: RawBodyRequest<Request>) {
    const conn = await this.resolveOrThrow(connectionId, IntegrationProvider.GENERIC_INBOUND);
    const key = (req.headers['x-api-key'] as string) || '';
    if (!(await this.ingestion.verifyApiKey(conn.apiKeyHash, key))) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.ingestion.handleWebhook(conn, this.buildCtx(req, conn));
  }

  // ── Website / landing-page form (honeypot) ───────────────────────────────
  @Post('forms/:connectionId')
  @HttpCode(202)
  async website(@Param('connectionId') connectionId: string, @Req() req: RawBodyRequest<Request>) {
    const conn = await this.resolveOrThrow(connectionId, IntegrationProvider.WEBSITE_FORM);
    const ctx = this.buildCtx(req, conn);
    const adapter = getLeadSourceAdapter(conn.provider)!;
    if (!(await adapter.verifyWebhook(ctx))) {
      await this.ingestion.logFailedVerification(conn, ctx, 'honeypot triggered');
      return { ok: false, rejected: 'spam' };
    }
    return this.ingestion.handleWebhook(conn, ctx);
  }

  // ── Meta Lead Ads: GET challenge + POST signed event ─────────────────────
  @Get('webhooks/meta/:connectionId')
  async metaChallenge(@Param('connectionId') connectionId: string, @Req() req: RawBodyRequest<Request>) {
    const conn = await this.resolveOrThrow(connectionId, IntegrationProvider.META_LEAD_ADS);
    const adapter = getLeadSourceAdapter(conn.provider)!;
    const result = adapter.verifyChallenge!(this.buildCtx(req, conn));
    if (!result.ok) throw new ForbiddenException('Verification failed');
    return result.challenge; // echoed verbatim per Meta's handshake
  }

  @Post('webhooks/meta/:connectionId')
  @HttpCode(200)
  async metaEvent(@Param('connectionId') connectionId: string, @Req() req: RawBodyRequest<Request>) {
    const conn = await this.resolveOrThrow(connectionId, IntegrationProvider.META_LEAD_ADS);
    const ctx = this.buildCtx(req, conn);
    const adapter = getLeadSourceAdapter(conn.provider)!;
    if (!(await adapter.verifyWebhook(ctx))) {
      await this.ingestion.logFailedVerification(conn, ctx, 'invalid X-Hub-Signature-256');
      throw new UnauthorizedException('Invalid signature');
    }
    return this.ingestion.handleWebhook(conn, ctx);
  }

  // ── Google Ads lead form (shared key in body) ────────────────────────────
  @Post('webhooks/google/:connectionId')
  @HttpCode(200)
  async googleEvent(@Param('connectionId') connectionId: string, @Req() req: RawBodyRequest<Request>) {
    const conn = await this.resolveOrThrow(connectionId, IntegrationProvider.GOOGLE_ADS);
    const ctx = this.buildCtx(req, conn);
    const adapter = getLeadSourceAdapter(conn.provider)!;
    if (!(await adapter.verifyWebhook(ctx))) {
      await this.ingestion.logFailedVerification(conn, ctx, 'invalid google_key');
      throw new UnauthorizedException('Invalid key');
    }
    return this.ingestion.handleWebhook(conn, ctx);
  }
}
