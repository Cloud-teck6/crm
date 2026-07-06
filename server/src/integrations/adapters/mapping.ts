// Shared helpers for normalizing third-party lead payloads into NormalizedLead.

/** First non-empty value among the given keys (case-insensitive key match). */
export function pick(obj: Record<string, any>, keys: string[]): string | undefined {
  if (!obj) return undefined;
  const lower: Record<string, any> = {};
  for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
}

export function splitName(full?: string): { firstName?: string; lastName?: string } {
  if (!full) return {};
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// Common field aliases across portals (Meta, Google, IndiaMART, generic forms).
export const EMAIL_KEYS = ['email', 'email_address', 'e-mail', 'work_email'];
export const PHONE_KEYS = ['phone', 'phone_number', 'mobile', 'mobile_number', 'contact_number', 'whatsapp_number'];
export const NAME_KEYS = ['full_name', 'name', 'fullname'];
export const FIRST_KEYS = ['first_name', 'firstname', 'given_name'];
export const LAST_KEYS = ['last_name', 'lastname', 'family_name', 'surname'];
export const COMPANY_KEYS = ['company', 'company_name', 'organization', 'organisation', 'business'];

/** Map a flat object of answers to the standard lead name/email/phone/company. */
export function mapStandardFields(answers: Record<string, any>) {
  const email = pick(answers, EMAIL_KEYS);
  const phone = pick(answers, PHONE_KEYS);
  const company = pick(answers, COMPANY_KEYS);
  let firstName = pick(answers, FIRST_KEYS);
  let lastName = pick(answers, LAST_KEYS);
  if (!firstName && !lastName) {
    const split = splitName(pick(answers, NAME_KEYS));
    firstName = split.firstName;
    lastName = split.lastName;
  }
  return { firstName, lastName, email, phone, company };
}
