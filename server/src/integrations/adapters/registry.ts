import { IntegrationProvider } from '@prisma/client';
import { LeadSourceAdapter } from '../lead-source-adapter.interface';
import { GenericInboundAdapter } from './generic.adapter';
import { WebsiteFormAdapter } from './website.adapter';
import { MetaLeadAdsAdapter } from './meta.adapter';
import { GoogleAdsAdapter } from './google.adapter';

const ADAPTERS: Partial<Record<IntegrationProvider, LeadSourceAdapter>> = {
  [IntegrationProvider.GENERIC_INBOUND]: new GenericInboundAdapter(),
  [IntegrationProvider.WEBSITE_FORM]: new WebsiteFormAdapter(),
  [IntegrationProvider.META_LEAD_ADS]: new MetaLeadAdsAdapter(),
  [IntegrationProvider.GOOGLE_ADS]: new GoogleAdsAdapter(),
};

export function getLeadSourceAdapter(provider: IntegrationProvider): LeadSourceAdapter | undefined {
  return ADAPTERS[provider];
}

// Providers that authenticate via a per-connection API key (vs. signature).
export const API_KEY_PROVIDERS = new Set<IntegrationProvider>([
  IntegrationProvider.GENERIC_INBOUND,
  IntegrationProvider.WEBSITE_FORM,
]);
