import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Modal } from '../components/ui/Modal';
import { RecordFormModal, RecordField } from '../components/RecordForm';
import { fullName, LEAD_STATUS_STYLES } from '../lib/format';

interface Lead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  campaign: string | null;
  status: string;
}

const LEAD_FIELDS: RecordField[] = [
  { name: 'firstName', label: 'First name' },
  { name: 'lastName', label: 'Last name' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone' },
  { name: 'company', label: 'Company' },
  { name: 'source', label: 'Source', placeholder: 'manual' },
  { name: 'campaign', label: 'Campaign' },
  { name: 'status', label: 'Status', type: 'select', options: ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED'] },
];

export function LeadsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  // form === undefined: closed; { record: null }: create; { record: Lead }: edit
  const [form, setForm] = useState<{ record: Lead | null } | undefined>(undefined);
  const [converting, setConverting] = useState<Lead | null>(null);

  const leadsQ = useQuery({
    queryKey: ['leads', q],
    queryFn: async () => (await api.get('/leads', { params: { q: q || undefined, pageSize: 200 } })).data.items as Lead[],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Leads</h1>
        <div className="flex items-center gap-2">
          <input className="input w-56" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          {can('lead:create') && (
            <button className="btn-primary whitespace-nowrap" onClick={() => setForm({ record: null })}>
              Add lead
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Phone</th>
              <th className="th">Company</th>
              <th className="th">Source</th>
              <th className="th">Status</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leadsQ.isLoading && <tr><td className="td" colSpan={7}>Loading…</td></tr>}
            {leadsQ.data?.length === 0 && <tr><td className="td text-slate-400" colSpan={7}>No leads yet.</td></tr>}
            {leadsQ.data?.map((l) => (
              <tr key={l.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setForm({ record: l })}>
                <td className="td font-medium">{fullName(l)}</td>
                <td className="td">{l.email ?? '—'}</td>
                <td className="td">{l.phone ?? '—'}</td>
                <td className="td">{l.company ?? '—'}</td>
                <td className="td"><span className="badge bg-slate-100 text-slate-600">{l.source ?? '—'}</span></td>
                <td className="td"><span className={`badge ${LEAD_STATUS_STYLES[l.status] ?? 'bg-slate-100'}`}>{l.status}</span></td>
                <td className="td text-right">
                  {l.status !== 'CONVERTED' && can('lead:edit') && (
                    <button className="btn-ghost text-brand-600" onClick={(e) => { e.stopPropagation(); setConverting(l); }}>
                      Convert
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <RecordFormModal
          resource="leads"
          record={form.record}
          fields={LEAD_FIELDS}
          entityLabel="lead"
          canEdit={form.record ? can('lead:edit') : can('lead:create')}
          onClose={() => setForm(undefined)}
          onSaved={() => { setForm(undefined); qc.invalidateQueries({ queryKey: ['leads'] }); }}
        />
      )}

      {converting && (
        <ConvertModal
          lead={converting}
          onClose={() => setConverting(null)}
          onDone={() => { setConverting(null); qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['board'] }); }}
        />
      )}
    </div>
  );
}

function ConvertModal({ lead, onClose, onDone }: { lead: Lead; onClose: () => void; onDone: () => void }) {
  const [createAccount, setCreateAccount] = useState(!!lead.company);
  const [createDeal, setCreateDeal] = useState(true);
  const [dealTitle, setDealTitle] = useState(lead.company || fullName(lead));
  const [pipelineId, setPipelineId] = useState('');
  const [error, setError] = useState('');

  const pipelinesQ = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => (await api.get('/pipelines')).data as Array<{ id: string; name: string }>,
  });

  const convertM = useMutation({
    mutationFn: () =>
      api.post(`/leads/${lead.id}/convert`, {
        createAccount,
        createDeal,
        dealTitle: createDeal ? dealTitle : undefined,
        pipelineId: createDeal ? pipelineId || pipelinesQ.data?.[0]?.id : undefined,
      }),
    onSuccess: onDone,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  return (
    <Modal open onClose={onClose} title={`Convert ${fullName(lead)}`}>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} />
          Create account {lead.company ? `“${lead.company}”` : '(no company on lead)'}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={createDeal} onChange={(e) => setCreateDeal(e.target.checked)} />
          Create a deal
        </label>
        {createDeal && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div><label className="label">Deal title</label><input className="input" value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} /></div>
            <div>
              <label className="label">Pipeline</label>
              <select className="input" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                {pipelinesQ.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {pipelinesQ.data?.length === 0 && <p className="mt-1 text-xs text-amber-600">No pipeline — create one on the Deals page first.</p>}
            </div>
          </div>
        )}
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full" disabled={convertM.isPending} onClick={() => convertM.mutate()}>
          {convertM.isPending ? 'Converting…' : 'Convert lead'}
        </button>
      </div>
    </Modal>
  );
}
