import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { RecordFormModal, RecordField } from '../components/RecordForm';
import { fullName } from '../lib/format';

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  account: { id: string; name: string } | null;
}

const CONTACT_FIELDS: RecordField[] = [
  { name: 'firstName', label: 'First name' },
  { name: 'lastName', label: 'Last name' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone' },
];

export function ContactsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ record: Contact | null } | undefined>(undefined);

  const contactsQ = useQuery({
    queryKey: ['contacts', q],
    queryFn: async () => (await api.get('/contacts', { params: { q: q || undefined, pageSize: 200 } })).data.items as Contact[],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Contacts</h1>
        <div className="flex items-center gap-2">
          <input className="input w-56" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          {can('contact:create') && <button className="btn-primary whitespace-nowrap" onClick={() => setForm({ record: null })}>Add contact</button>}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><th className="th">Name</th><th className="th">Email</th><th className="th">Phone</th><th className="th">Account</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contactsQ.isLoading && <tr><td className="td" colSpan={4}>Loading…</td></tr>}
            {contactsQ.data?.length === 0 && <tr><td className="td text-slate-400" colSpan={4}>No contacts yet.</td></tr>}
            {contactsQ.data?.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setForm({ record: c })}>
                <td className="td font-medium">{fullName(c)}</td>
                <td className="td">{c.email ?? '—'}</td>
                <td className="td">{c.phone ?? '—'}</td>
                <td className="td">{c.account?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <RecordFormModal
          resource="contacts"
          record={form.record}
          fields={CONTACT_FIELDS}
          entityLabel="contact"
          canEdit={form.record ? can('contact:edit') : can('contact:create')}
          onClose={() => setForm(undefined)}
          onSaved={() => { setForm(undefined); qc.invalidateQueries({ queryKey: ['contacts'] }); }}
        />
      )}
    </div>
  );
}
