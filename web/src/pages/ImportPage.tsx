import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../lib/api';

const OBJECTS = ['Lead', 'Contact', 'Account'];

interface Preview {
  headers: string[];
  sample: Record<string, string>[];
  totalRows: number;
  targetFields: string[];
  suggestedMapping: Record<string, string>;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;

export function ImportPage() {
  const [objectType, setObjectType] = useState('Lead');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [strategy, setStrategy] = useState('skip');
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const previewM = useMutation({
    mutationFn: () => api.post('/imports/preview', { objectType, csv }),
    onSuccess: (r) => { setPreview(r.data); setMapping(r.data.suggestedMapping); setError(''); },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const startM = useMutation({
    mutationFn: () => api.post('/imports', { objectType, csv, mapping, dedupeStrategy: strategy }),
    onSuccess: (r) => setJobId(r.data.id),
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const jobQ = useQuery({
    queryKey: ['import-job', jobId],
    queryFn: async () => (await api.get(`/imports/${jobId}`)).data,
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && ['COMPLETED', 'FAILED'].includes(q.state.data.status) ? false : 500),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setCsv(await f.text());
  }

  function reset() { setPreview(null); setJobId(null); setCsv(''); setMapping({}); setError(''); }

  const job = jobQ.data;
  const pct = job && job.total ? Math.round((job.processed / job.total) * 100) : 0;

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-xl font-semibold">Import</h1>

      {!jobId && (
        <>
          <div className="card space-y-4 p-5">
            <div className="flex gap-3">
              <div className="w-40">
                <label className="label">Object</label>
                <select className="input" value={objectType} onChange={(e) => { setObjectType(e.target.value); setPreview(null); }}>
                  {OBJECTS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="label">Upload CSV</label>
                <input className="input" type="file" accept=".csv,text/csv" onChange={onFile} />
              </div>
            </div>
            <div>
              <label className="label">…or paste CSV</label>
              <textarea className="input font-mono text-xs" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="First Name,Email,Phone&#10;Asha,asha@x.com,9810000001" />
            </div>
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button className="btn-primary" disabled={!csv || previewM.isPending} onClick={() => previewM.mutate()}>
              {previewM.isPending ? 'Reading…' : 'Preview & map columns'}
            </button>
          </div>

          {preview && (
            <div className="card space-y-4 p-5">
              <div className="text-sm text-slate-500">{preview.totalRows} rows · map each column to a field</div>
              <div className="space-y-2">
                {preview.headers.map((h) => (
                  <div key={h} className="flex items-center gap-3">
                    <div className="w-40 truncate text-sm font-medium">{h}</div>
                    <span className="text-slate-300">→</span>
                    <select className="input flex-1" value={mapping[h] ?? ''} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                      <option value="">Ignore</option>
                      {preview.targetFields.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div className="w-32 truncate text-xs text-slate-400">{preview.sample[0]?.[h]}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <label className="label">On duplicate (email/phone)</label>
                  <select className="input w-48" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                    <option value="skip">Skip</option>
                    <option value="update">Update existing</option>
                    <option value="create">Always create</option>
                  </select>
                </div>
              </div>
              <button className="btn-primary" disabled={startM.isPending} onClick={() => startM.mutate()}>
                {startM.isPending ? 'Starting…' : `Import ${preview.totalRows} rows`}
              </button>
            </div>
          )}
        </>
      )}

      {job && (
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Importing {job.objectType}s…</h2>
            <span className={`badge ${job.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-brand-50 text-brand-700'}`}>{job.status}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[['Processed', job.processed], ['Created', job.created], ['Updated', job.updated], ['Skipped', job.skipped], ['Failed', job.failed]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg bg-slate-50 p-2">
                <div className="text-lg font-semibold">{v as number}</div>
                <div className="text-xs text-slate-500">{l as string}</div>
              </div>
            ))}
          </div>
          {job.status === 'COMPLETED' && (
            <div className="flex gap-3">
              {job.failed > 0 && <a className="btn-ghost text-brand-600" href={`${API_BASE}/api/imports/${job.id}/errors.csv`} target="_blank" rel="noreferrer">Download error report</a>}
              <button className="btn-primary" onClick={reset}>Import another file</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
