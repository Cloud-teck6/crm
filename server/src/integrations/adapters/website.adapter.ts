import { IntegrationProvider } from '@prisma/client';
import { InboundContext, NormalizedLead } from '../lead-source-adapter.interface';
import { GenericInboundAdapter } from './generic.adapter';

/**
 * Website / landing-page form adapter. Adds a honeypot spam check on top of
 * the generic mapping. (reCAPTCHA verification is a config-gated stub — wire a
 * real verify call when recaptchaSecret is set in production.)
 */
export class WebsiteFormAdapter extends GenericInboundAdapter {
  readonly provider = IntegrationProvider.WEBSITE_FORM;
  protected readonly defaultSource = 'website';

  verifyWebhook(ctx: InboundContext): boolean {
    const config = (ctx.connection?.config ?? {}) as any;
    const honeypotField = config.honeypotField ?? '_gotcha';
    const body = this.parseBody(ctx);
    // A filled honeypot means a bot — reject.
    if (body && body[honeypotField]) return false;
    return true;
  }

  normalizeToLead(payload: unknown, ctx: InboundContext): NormalizedLead | NormalizedLead[] {
    const body = payload ?? this.parseBody(ctx);
    return super.normalizeToLead(body);
  }

  private parseBody(ctx: InboundContext): any {
    if (ctx?.rawBody) {
      try {
        return JSON.parse(ctx.rawBody.toString());
      } catch {
        return null;
      }
    }
    return null;
  }
}
