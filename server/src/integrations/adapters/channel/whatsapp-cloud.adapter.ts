import { MessageChannel } from '@prisma/client';
import { ChannelAdapter, OutboundMessage, SendResult } from '../../channel-adapter.interface';

/**
 * Real WhatsApp Business Cloud API adapter (used when WHATSAPP_PROVIDER=cloud_api
 * and an access token is configured). Template sends carry the approved template
 * name; free-form sends a text body (only valid inside the 24h window — enforced
 * upstream in MessagingService).
 *
 * Assumption isolated here: POST /{version}/{phoneNumberId}/messages.
 */
export class WhatsAppCloudApiAdapter implements ChannelAdapter {
  readonly channel = MessageChannel.WHATSAPP;

  constructor(
    private readonly cfg: { phoneNumberId: string; accessToken: string; version?: string },
  ) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    const version = this.cfg.version || process.env.META_GRAPH_API_VERSION || 'v21.0';
    const url = `https://graph.facebook.com/${version}/${this.cfg.phoneNumberId}/messages`;

    const payload = message.templateId
      ? {
          messaging_product: 'whatsapp',
          to: message.to,
          type: 'template',
          template: {
            name: message.templateId,
            language: { code: 'en' },
            components: this.templateComponents(message.templateParams),
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: message.to,
          type: 'text',
          text: { body: message.body ?? '' },
        };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { status: 'failed', error: `WhatsApp ${res.status}: ${await res.text()}` };
      const data: any = await res.json();
      return { providerMessageId: data.messages?.[0]?.id, status: 'sent' };
    } catch (err: any) {
      return { status: 'failed', error: err.message };
    }
  }

  private templateComponents(params?: Record<string, string>) {
    if (!params || Object.keys(params).length === 0) return [];
    return [
      {
        type: 'body',
        parameters: Object.values(params).map((text) => ({ type: 'text', text })),
      },
    ];
  }
}
