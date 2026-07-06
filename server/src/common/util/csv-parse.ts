/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas/newlines,
 * and escaped quotes (""). Returns an array of rows (each an array of cells).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  // trailing field/row (no final newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop a trailing empty row from a final newline
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Parse CSV into header + objects keyed by header. */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const matrix = parseCsv(text);
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = matrix[0].map((h) => h.trim());
  const rows = matrix.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (cells[i] ?? '').trim()));
    return obj;
  });
  return { headers, rows };
}
