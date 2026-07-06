import { extractVariables, renderTemplate } from '../../src/modules/messaging/render';

describe('template rendering', () => {
  it('extracts {{variables}} (deduped)', () => {
    expect(extractVariables('Hi {{firstName}}, your deal {{dealName}} — {{firstName}}!')).toEqual([
      'firstName',
      'dealName',
    ]);
    expect(extractVariables('no vars here')).toEqual([]);
  });

  it('renders provided variables and blanks unknown ones', () => {
    expect(renderTemplate('Hi {{firstName}} from {{company}}', { firstName: 'Asha', company: 'Acme' })).toBe(
      'Hi Asha from Acme',
    );
    expect(renderTemplate('Hi {{firstName}}{{missing}}', { firstName: 'Asha' })).toBe('Hi Asha');
    expect(renderTemplate('Spaces {{  firstName  }}', { firstName: 'X' })).toBe('Spaces X');
  });
});
