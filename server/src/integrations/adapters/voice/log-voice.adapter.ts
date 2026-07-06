import * as crypto from 'node:crypto';
import { Logger } from '@nestjs/common';
import { VoiceAdapter } from '../../channel-adapter.interface';

/**
 * Default sandbox telephony adapter. Real adapters (Twilio Voice / Exotel /
 * Knowlarity / Plivo) implement the same interface and are selected via env.
 */
export class LogVoiceAdapter implements VoiceAdapter {
  private readonly logger = new Logger('LogVoiceAdapter');

  async click2call(params: { from: string; to: string; record?: boolean }): Promise<{ providerCallId: string }> {
    this.logger.log(`click-to-call ${params.from} → ${params.to}${params.record ? ' (recording)' : ''}`);
    return { providerCallId: `log_call_${crypto.randomBytes(6).toString('hex')}` };
  }

  parseCallCallback(payload: any) {
    return {
      providerCallId: payload?.providerCallId ?? payload?.CallSid ?? payload?.id,
      duration: payload?.duration != null ? Number(payload.duration) : undefined,
      recordingUrl: payload?.recordingUrl ?? payload?.RecordingUrl,
      disposition: payload?.disposition ?? payload?.CallStatus,
    };
  }
}

export function voiceAdapter(): VoiceAdapter {
  // Env-gated real adapters slot in here (EXOTEL_*/TWILIO_* etc.).
  return new LogVoiceAdapter();
}
