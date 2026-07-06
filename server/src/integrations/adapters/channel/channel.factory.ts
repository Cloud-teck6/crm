import { MessageChannel } from '@prisma/client';
import { ChannelAdapter } from '../../channel-adapter.interface';
import { LogChannelAdapter } from './log-channel.adapter';
import { WhatsAppCloudApiAdapter } from './whatsapp-cloud.adapter';

/**
 * Selects the outbound adapter for a channel from env. Falls back to the
 * sandbox LogChannelAdapter when no real credentials are present — so the hub
 * works out of the box and swaps to a real vendor purely via env config.
 *
 * Real SES/SendGrid (email) and MSG91/Twilio (SMS) adapters slot in here the
 * same way once their credentials are set.
 */
export function channelAdapterFor(channel: MessageChannel, env: NodeJS.ProcessEnv = process.env): ChannelAdapter {
  if (
    channel === MessageChannel.WHATSAPP &&
    env.WHATSAPP_PROVIDER === 'cloud_api' &&
    env.WHATSAPP_ACCESS_TOKEN &&
    env.WHATSAPP_PHONE_NUMBER_ID
  ) {
    return new WhatsAppCloudApiAdapter({
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
    });
  }
  return new LogChannelAdapter(channel);
}
