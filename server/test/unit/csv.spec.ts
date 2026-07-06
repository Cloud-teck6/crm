import { toCsv } from '../../src/common/util/csv';

describe('CSV serializer', () => {
  it('serializes rows with a header', () => {
    const csv = toCsv([{ source: 'meta', count: 3 }, { source: 'web', count: 1 }]);
    expect(csv).toBe('source,count\nmeta,3\nweb,1\n');
  });

  it('escapes commas, quotes and newlines', () => {
    const csv = toCsv([{ a: 'hello, world', b: 'quote"d', c: 'line\nbreak' }]);
    expect(csv).toBe('a,b,c\n"hello, world","quote""d","line\nbreak"\n');
  });

  it('honours an explicit column order', () => {
    expect(toCsv([{ a: 1, b: 2 }], ['b', 'a'])).toBe('b,a\n2,1\n');
  });
});
