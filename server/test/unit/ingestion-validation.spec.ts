import { isPlaceholderEmail, isInvalidPhone, validateLead } from '../../src/modules/ingestion/validation';

describe('ingestion validation gate', () => {
  it('flags placeholder / malformed emails', () => {
    expect(isPlaceholderEmail('test@example.com')).toBe(true);
    expect(isPlaceholderEmail('noreply@foo.com')).toBe(true);
    expect(isPlaceholderEmail('john@mailinator.com')).toBe(true);
    expect(isPlaceholderEmail('not-an-email')).toBe(true);
    expect(isPlaceholderEmail('priya@northwind.co')).toBe(false);
  });

  it('flags invalid / sequential / repeated phone numbers', () => {
    expect(isInvalidPhone('1234567890')).toBe(true);
    expect(isInvalidPhone('0000000000')).toBe(true);
    expect(isInvalidPhone('9999999999')).toBe(true);
    expect(isInvalidPhone('123')).toBe(true);
    expect(isInvalidPhone('+91 98100 11223')).toBe(false);
  });

  it('requires at least one usable channel', () => {
    expect(validateLead({}).valid).toBe(false);
    expect(validateLead({ email: 'test@example.com', phone: '0000000000' }).valid).toBe(false);
    expect(validateLead({ email: 'real@company.com' }).valid).toBe(true);
    expect(validateLead({ phone: '9810011223' }).valid).toBe(true);
    // junk email but a valid phone → still usable
    expect(validateLead({ email: 'test@example.com', phone: '9810011223' }).valid).toBe(true);
  });
});
