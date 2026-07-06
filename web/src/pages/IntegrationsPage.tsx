import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Modal } from '../components/ui/Modal';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;

interface Connection {
  id: string;
  provider: string;
  name: string;
  isActive: boolean;
  status: string;
  hasApiKey: boolean;
  config: Record<string, any>;
  lastError: string | null;
  inboundPaths: Record<string, string>;
}

const PROVIDERS = [
  { value: 'GENERIC_INBOUND', label: 'Generic Inbound API' },
  { value: 'WEBSITE_FORM', label: 'Website / Landing Form' },
  { value: 'META_LEAD_ADS', label: 'Meta Lead Ads' },
  { value: 'GOOGLE_ADS', label: 'Google Ads Lead Form' },
];
const PROVIDER_LABEL: Record<string, string> = Object.fromEntries(PROVIDERS.map((p) => [p.value, p.label]));

export function IntegrationsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [eventsFor, setEventsFor] = useState<Connection | null>(null);

  const connsQ = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await api.get('/integrations')).data as Connection[],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Integrations</h1>
          <p className="text-sm text-slate-500">Connect lead sources. Every inbound lead is validated, deduped and routed to an owner.</p>
        </div>
        {can('integration:manage') && <button className="btn-primary" onClick={() => setCreating(true)}>Add connection</button>}
      </div>

      {apiKey && (
        <div className="card border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-medium text-amber-800">Save this API key now — it won't be shown again.</div>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-sm">{apiKey}</code>
          <button className="btn-ghost mt-2 text-amber-700" onClick={() => setApiKey(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {connsQ.isLoading && <div className="text-slate-400">Loading…</div>}
        {connsQ.data?.length === 0 && <div className="card p-6 text-slate-400">No connections yet.</div>}
        {connsQ.data?.map((c) => (
          <div key={c.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{c.name}</h3>
                <span className="badge bg-brand-50 text-brand-700">{PROVIDER_LABEL[c.provider] ?? c.provider}</span>
              </div>
              <span className={`badge ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {c.isActive ? c.status : 'disabled'}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              {Object.entries(c.inboundPaths).map(([label, path]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 uppercase text-slate-400">{label}</span>
                  <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{API_BASE}{path}</code>
                </div>
              ))}
            </div>
            {c.lastError && <div className="mt-2 text-xs text-red-600">Last error: {c.lastError}</div>}
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost text-brand-600" onClick={() => setEventsFor(c)}>Webhook events</button>
              {can('integration:manage') && c.hasApiKey && <RegenerateButton id={c.id} onKey={setApiKey} />}
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onDone={(key) => { setCreating(false); setApiKey(key ?? null); qc.invalidateQueries({ queryKey: ['integrations'] }); }}
        />
      )}
      {eventsFor && <EventsModal connection={eventsFor} onClose={() => setEventsFor(null)} />}
    </div>
  );
}

function RegenerateButton({ id, onKey }: { id: string; onKey: (k: string) => void }) {
  const m = useMutation({
    mutationFn: () => api.post(`/integrations/${id}/regenerate-key`),
    onSuccess: (r) => onKey(r.data.apiKey),
  });
  return <button className="btn-ghost" disabled={m.isPending} onClick={() => m.mutate()}>Regenerate key</button>;
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: (apiKey?: string) => void }) {
  const [provider, setProvider] = useState('GENERIC_INBOUND');
  const [error, setError] = useState('');
  const createM = useMutation({
    mutationFn: (body: any) => api.post('/integrations', body),
    onSuccess: (r) => onDone(r.data.apiKey),
    onError: (e) => setError(apiErrorMessage(e)),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const config: Record<string, string> = {};
    for (const key of ['verifyToken', 'appSecret', 'pageAccessToken', 'googleKey', 'honeypotField']) {
      const v = f.get(key);
      if (v) config[key] = String(v);
    }
    createM.mutate({ provider, name: f.get('name'), config });
  }

  return (
    <Modal open onClose={onClose} title="New connection">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Source</label>
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div><label className="label">Name</label><input className="input" name="name" required placeholder="e.g. Facebook — Acme Page" /></div>

        {provider === 'META_LEAD_ADS' && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div><label className="label">Verify token</label><input className="input" name="verifyToken" placeholder="any string you set in Meta" /></div>
            <div><label className="label">App secret</label><input className="input" name="appSecret" type="password" /></div>
            <div><label className="label">Page access token</label><input className="input" name="pageAccessToken" type="password" /></div>
          </div>
        )}
        {provider === 'GOOGLE_ADS' && (
          <div><label className="label">Webhook key</label><input className="input" name="googleKey" placeholder="key configured in Google Ads" /></div>
        )}
        {provider === 'WEBSITE_FORM' && (
          <div><label className="label">Honeypot field</label><input className="input" name="honeypotField" placeholder="_gotcha (default)" /></div>
        )}

        {(provider === 'GENERIC_INBOUND' || provider === 'WEBSITE_FORM') && (
          <p className="text-xs text-slate-500">An API key will be generated and shown once after creation.</p>
        )}
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full" disabled={createM.isPending}>{createM.isPending ? 'Creating…' : 'Create connection'}</button>
      </form>
    </Modal>
  );
}

function EventsModal({ connection, onClose }: { connection: Connection; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['integration-events', connection.id],
    queryFn: async () => (await api.get(`/integrations/${connection.id}/events`)).data as {
      items: any[];
      stats: { today: number; week: number; month: number; total: number; deadLetter: number };
    },
  });
  const { can } = useAuth();
  const replayM = useMutation({
    mutationFn: (eventId: string) => api.post(`/integrations/events/${eventId}/replay`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration-events', connection.id] }),
  });

  const STATUS_STYLE: Record<string, string> = {
    PROCESSED: 'bg-green-100 text-green-700',
    FAILED: 'bg-amber-100 text-amber-700',
    DEAD_LETTER: 'bg-red-100 text-red-700',
    PROCESSING: 'bg-slate-100 text-slate-500',
  };

  return (
    <Modal open onClose={onClose} title={`Webhook events — ${connection.name}`} width="max-w-2xl">
      {q.data && (
        <div className="mb-4 grid grid-cols-5 gap-2 text-center">
          {[['Today', q.data.stats.today], ['7 days', q.data.stats.week], ['30 days', q.data.stats.month], ['Total', q.data.stats.total], ['Dead-letter', q.data.stats.deadLetter]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg bg-slate-50 p-2">
              <div className="text-lg font-semibold">{v as number}</div>
              <div className="text-xs text-slate-500">{l as string}</div>
            </div>
          ))}
        </div>
      )}
      <div className="max-h-80 space-y-2 overflow-auto">
        {q.data?.items.length === 0 && <div className="text-sm text-slate-400">No events yet.</div>}
        {q.data?.items.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
            <div>
              <span className={`badge ${STATUS_STYLE[e.processingStatus] ?? 'bg-slate-100'}`}>{e.processingStatus}</span>
              <span className="ml-2 text-slate-500">{new Date(e.createdAt).toLocaleString()}</span>
              {e.error && <div className="mt-0.5 text-xs text-red-600">{e.error}</div>}
            </div>
            {e.processingStatus === 'DEAD_LETTER' && can('integration:manage') && (
              <button className="btn-ghost text-brand-600" disabled={replayM.isPending} onClick={() => replayM.mutate(e.id)}>Replay</button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
