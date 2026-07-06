import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { RecordFormModal, RecordField } from '../components/RecordForm';

interface Account {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
}

const ACCOUNT_FIELDS: RecordField[] = [
  { name: 'name', label: 'Name', required: true, full: true },
  { name: 'domain', label: 'Domain', placeholder: 'acme.com' },
  { name: 'industry', label: 'Industry' },
];

export function AccountsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ record: Account | null } | undefined>(undefined);

  const accountsQ = useQuery({
    queryKey: ['accounts', q],
    queryFn: async () => (await api.get('/accounts', { params: { q: q || undefined, pageSize: 200 } })).data.items as Account[],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <div className="flex items-center gap-2">
          <input className="input w-56" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          {can('account:create') && <button className="btn-primary whitespace-nowrap" onClick={() => setForm({ record: null })}>Add account</button>}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><th className="th">Name</th><th className="th">Domain</th><th className="th">Industry</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accountsQ.isLoading && <tr><td className="td" colSpan={3}>Loading…</td></tr>}
            {accountsQ.data?.length === 0 && <tr><td className="td text-slate-400" colSpan={3}>No accounts yet.</td></tr>}
            {accountsQ.data?.map((a) => (
              <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setForm({ record: a })}>
                <td className="td font-medium">{a.name}</td>
                <td className="td">{a.domain ?? '—'}</td>
                <td className="td">{a.industry ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <RecordFormModal
          resource="accounts"
          record={form.record}
          fields={ACCOUNT_FIELDS}
          entityLabel="account"
          canEdit={form.record ? can('account:edit') : can('account:create')}
          onClose={() => setForm(undefined)}
          onSaved={() => { setForm(undefined); qc.invalidateQueries({ queryKey: ['accounts'] }); }}
        />
      )}
    </div>
  );
}
