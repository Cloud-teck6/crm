// Validation gate applied to every inbound lead BEFORE a record is created.

const PLACEHOLDER_EMAIL = /^(test|fake|noreply|no-reply|none|na|n\/a|example|asdf|abc|xxx)@|@(example|test|tempmail|mailinator)\./i;

export function isPlaceholderEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return true; // not a valid shape
  return PLACEHOLDER_EMAIL.test(e);
}

export function isInvalidPhone(phone?: string | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return true;
  if (/^(\d)\1+$/.test(digits)) return true; // all same digit (0000000000)
  if (/^0?1234567890$/.test(digits) || /^1234567890\d*$/.test(digits)) return true; // sequential
  if (/^0+$/.test(digits)) return true;
  return false;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/** A lead must have at least one usable contact channel that isn't junk. */
export function validateLead(input: { email?: string | null; phone?: string | null }): ValidationResult {
  const emailOk = input.email && !isPlaceholderEmail(input.email);
  const phoneOk = input.phone && !isInvalidPhone(input.phone);
  if (!input.email && !input.phone) return { valid: false, reason: 'no email or phone' };
  if (input.email && !emailOk && (!input.phone || !phoneOk)) {
    return { valid: false, reason: 'placeholder email and no valid phone' };
  }
  if (input.phone && !phoneOk && (!input.email || !emailOk)) {
    return { valid: false, reason: 'invalid phone and no valid email' };
  }
  return { valid: true };
}
