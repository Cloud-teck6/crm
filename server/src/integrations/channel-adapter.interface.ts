import { MessageChannel } from '@prisma/client';

/**
 * Contract every outbound communication provider (SES/SendGrid email,
 * WhatsApp Cloud API/Twilio, MSG91/Twilio SMS) implements. Phase 4 supplies
 * concrete adapters selected via env (EMAIL_PROVIDER, WHATSAPP_PROVIDER, ...).
 */
export interface OutboundMessage {
  to: string;
  from?: string;
  subject?: string;
  body?: string;
  templateId?: string;
  templateParams?: Record<string, string>;
  attachments?: Array<{ filename: string; url?: string; contentBase64?: string }>;
}

export interface SendResult {
  providerMessageId?: string;
  status: 'queued' | 'sent' | 'failed';
  error?: string;
}

export interface ChannelAdapter {
  readonly channel: MessageChannel;
  send(message: OutboundMessage): Promise<SendResult>;
  /** Parse a provider delivery/status callback into a normalized update. */
  parseStatusCallback?(payload: unknown): { providerMessageId: string; status: string };
}

/** Telephony adapter (Twilio Voice / Exotel / Knowlarity / Plivo). */
export interface VoiceAdapter {
  click2call(params: { from: string; to: string; record?: boolean }): Promise<{ providerCallId: string }>;
  parseCallCallback?(payload: unknown): {
    providerCallId: string;
    duration?: number;
    recordingUrl?: string;
    disposition?: string;
  };
}
