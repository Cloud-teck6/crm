// Minimal RFC-4180-ish CSV serializer for report/list exports.
function escape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return columns ? columns.join(',') + '\n' : '';
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}
