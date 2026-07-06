import * as crypto from 'node:crypto';
import { Logger } from '@nestjs/common';
import { MessageChannel } from '@prisma/client';
import { ChannelAdapter, OutboundMessage, SendResult } from '../../channel-adapter.interface';

/**
 * Default sandbox adapter used when no real provider credentials are configured.
 * It "accepts" the message (logs it) and returns a synthetic provider id, so the
 * unified timeline and status lifecycle work end-to-end without external calls.
 */
export class LogChannelAdapter implements ChannelAdapter {
  private readonly logger = new Logger('LogChannelAdapter');

  constructor(public readonly channel: MessageChannel) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    this.logger.log(`[${this.channel}] → ${message.to} :: ${message.templateId ? `template ${message.templateId}` : (message.body ?? '').slice(0, 80)}`);
    return { providerMessageId: `log_${this.channel.toLowerCase()}_${crypto.randomBytes(6).toString('hex')}`, status: 'sent' };
  }

  parseStatusCallback(payload: any): { providerMessageId: string; status: string } {
    return { providerMessageId: payload?.providerMessageId ?? payload?.id, status: payload?.status ?? 'delivered' };
  }
}
