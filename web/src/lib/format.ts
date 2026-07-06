export function formatCurrency(value: number | string | null | undefined, currency = 'INR'): string {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

export function fullName(r: { firstName?: string | null; lastName?: string | null }): string {
  return [r.firstName, r.lastName].filter(Boolean).join(' ') || '—';
}

export const LEAD_STATUS_STYLES: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  CONTACTED: 'bg-amber-100 text-amber-700',
  QUALIFIED: 'bg-violet-100 text-violet-700',
  UNQUALIFIED: 'bg-slate-100 text-slate-500',
  CONVERTED: 'bg-green-100 text-green-700',
};
