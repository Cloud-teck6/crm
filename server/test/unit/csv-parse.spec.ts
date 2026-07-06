import { parseCsv, parseCsvObjects } from '../../src/common/util/csv-parse';

describe('CSV parser', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles quoted fields with commas, quotes and newlines', () => {
    const csv = 'name,note\n"Doe, John","says ""hi""\nline2"';
    expect(parseCsv(csv)).toEqual([
      ['name', 'note'],
      ['Doe, John', 'says "hi"\nline2'],
    ]);
  });

  it('maps rows to objects by header', () => {
    const { headers, rows } = parseCsvObjects('Email,Phone\na@b.com,123\n,456');
    expect(headers).toEqual(['Email', 'Phone']);
    expect(rows).toEqual([
      { Email: 'a@b.com', Phone: '123' },
      { Email: '', Phone: '456' },
    ]);
  });

  it('ignores a trailing newline', () => {
    expect(parseCsv('a\n1\n')).toEqual([['a'], ['1']]);
  });
});
