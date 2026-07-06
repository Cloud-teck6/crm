import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Tenant {
  id: string;
  name: string;
  currency: string;
  timezone: string;
}

export function SettingsPage() {
  const { can, me, refresh } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Tenant>>({});
  const [msg, setMsg] = useState('');

  const tenantQ = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => (await api.get('/tenant')).data as Tenant,
  });

  useEffect(() => {
    if (tenantQ.data) setForm(tenantQ.data);
  }, [tenantQ.data]);

  const saveM = useMutation({
    mutationFn: () => api.patch('/tenant', { name: form.name, currency: form.currency, timezone: form.timezone }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant'] });
      setMsg('Workspace settings saved.');
    },
    onError: (e) => setMsg(apiErrorMessage(e)),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Workspace</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={form.name ?? ''}
              disabled={!can('settings:manage')}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Currency</label>
              <input
                className="input"
                value={form.currency ?? ''}
                disabled={!can('settings:manage')}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Timezone</label>
              <input
                className="input"
                value={form.timezone ?? ''}
                disabled={!can('settings:manage')}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              />
            </div>
          </div>
          {can('settings:manage') && (
            <button className="btn-primary" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
              {saveM.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
          {msg && <div className="text-sm text-slate-500">{msg}</div>}
        </div>
      </section>

      <TwoFactorSection enabled={!!me?.twoFactorEnabled} onChanged={refresh} />

      <NotificationPrefs />

      {can('settings:manage') && <ApiKeysSection />}
      {can('settings:manage') && <ComplianceSection />}
    </div>
  );
}

const SCOPES = ['lead:view', 'lead:create', 'lead:edit', 'contact:view', 'contact:create', 'deal:view', 'deal:create', 'report:view'];

function ApiKeysSection() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<string[]>(['lead:view', 'lead:create']);
  const [created, setCreated] = useState<string | null>(null);

  const keysQ = useQuery({ queryKey: ['api-keys'], queryFn: async () => (await api.get('/api-keys')).data as any[] });
  const createM = useMutation({
    mutationFn: () => api.post('/api-keys', { name, permissions: perms }),
    onSuccess: (r) => { setCreated(r.data.key); setName(''); qc.invalidateQueries({ queryKey: ['api-keys'] }); },
  });
  const revokeM = useMutation({ mutationFn: (id: string) => api.delete(`/api-keys/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }) });

  return (
    <section className="card p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">API keys (public REST API)</h2>
      {created && (
        <div className="mb-4 rounded-lg border-amber-300 bg-amber-50 p-3">
          <div className="text-sm font-medium text-amber-800">Copy this key now — it won't be shown again.</div>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-sm">{created}</code>
          <button className="btn-ghost mt-1 text-amber-700" onClick={() => setCreated(null)}>Dismiss</button>
        </div>
      )}
      <div className="space-y-2">
        {keysQ.data?.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
            <div><span className="font-medium">{k.name}</span> <code className="ml-2 text-xs text-slate-400">{k.prefix}</code></div>
            <button className="btn-ghost text-red-600" onClick={() => revokeM.mutate(k.id)}>Revoke</button>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <input className="input" placeholder="Key name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <label key={s} className={`cursor-pointer rounded-lg border px-2 py-1 text-xs ${perms.includes(s) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>
              <input type="checkbox" className="mr-1 align-middle" checked={perms.includes(s)} onChange={() => setPerms((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))} />
              {s}
            </label>
          ))}
        </div>
        <button className="btn-primary" disabled={!name || perms.length === 0 || createM.isPending} onClick={() => createM.mutate()}>Create key</button>
      </div>
    </section>
  );
}

function ComplianceSection() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState('');
  const exportM = useMutation({
    mutationFn: () => api.post('/compliance/export', { email }),
    onSuccess: (r) => setResult(`Export: ${r.data.contacts.length} contacts, ${r.data.leads.length} leads, ${r.data.messages.length} messages.`),
    onError: (e) => setResult(apiErrorMessage(e)),
  });
  const deleteM = useMutation({
    mutationFn: () => api.post('/compliance/delete', { email }),
    onSuccess: (r) => setResult(`Erased: ${JSON.stringify(r.data.erased)}`),
    onError: (e) => setResult(apiErrorMessage(e)),
  });

  return (
    <section className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Data privacy (DPDP / GDPR)</h2>
      <p className="mb-4 text-sm text-slate-500">Export or erase everything held about a person by email.</p>
      <div className="flex gap-2">
        <input className="input flex-1" type="email" placeholder="person@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-ghost" disabled={!email || exportM.isPending} onClick={() => exportM.mutate()}>Export</button>
        <button className="btn-danger" disabled={!email || deleteM.isPending} onClick={() => { if (confirm('Permanently erase this person\'s data?')) deleteM.mutate(); }}>Delete</button>
      </div>
      {result && <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{result}</div>}
    </section>
  );
}

const CHANNELS = ['IN_APP', 'EMAIL', 'SLACK'];
const TRIGGERS = ['deal.stage_changed', 'sla.breach', 'sla.escalation'];

function NotificationPrefs() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');
  const prefsQ = useQuery({ queryKey: ['notif-prefs'], queryFn: async () => (await api.get('/notifications/preferences')).data });

  const saveM = useMutation({
    mutationFn: (body: any) => api.put('/notifications/preferences', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-prefs'] }); setMsg('Notification preferences saved.'); },
    onError: (e) => setMsg(apiErrorMessage(e)),
  });

  const p = prefsQ.data;
  if (!p) return null;

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <section className="card p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Notifications</h2>
      <div className="space-y-4">
        <div>
          <label className="label">Channels</label>
          <div className="flex gap-4">
            {CHANNELS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={p.channels?.includes(c)} onChange={() => saveM.mutate({ channels: toggle(p.channels ?? [], c) })} />
                {c.replace('_', '-').toLowerCase()}
              </label>
            ))}
          </div>
        </div>
        {p.channels?.includes('SLACK') && (
          <div>
            <label className="label">Slack webhook URL</label>
            <input className="input" defaultValue={p.slackWebhookUrl ?? ''} onBlur={(e) => saveM.mutate({ slackWebhookUrl: e.target.value })} placeholder="https://hooks.slack.com/…" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Quiet hours start</label>
            <input className="input" type="number" min={0} max={23} defaultValue={p.quietHoursStart ?? ''} onBlur={(e) => saveM.mutate({ quietHoursStart: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
          <div>
            <label className="label">Quiet hours end</label>
            <input className="input" type="number" min={0} max={23} defaultValue={p.quietHoursEnd ?? ''} onBlur={(e) => saveM.mutate({ quietHoursEnd: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
        </div>
        <div>
          <label className="label">Mute</label>
          <div className="flex flex-wrap gap-3">
            {TRIGGERS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={p.mutedTriggers?.includes(t)} onChange={() => saveM.mutate({ mutedTriggers: toggle(p.mutedTriggers ?? [], t) })} />
                {t}
              </label>
            ))}
          </div>
        </div>
        {msg && <div className="text-sm text-slate-500">{msg}</div>}
      </div>
    </section>
  );
}

function TwoFactorSection({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function startSetup() {
    setError('');
    try {
      const res = await api.post('/auth/2fa/setup');
      setQr(res.data.qrDataUrl);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/2fa/enable', { code });
      setQr('');
      setCode('');
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/2fa/disable', { code });
      setCode('');
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <section className="card p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Two-factor authentication
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Status:{' '}
        <span className={enabled ? 'font-medium text-green-700' : 'font-medium text-slate-500'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </p>

      {!enabled && !qr && (
        <button className="btn-primary" onClick={startSetup}>
          Set up 2FA
        </button>
      )}

      {!enabled && qr && (
        <form onSubmit={confirm} className="space-y-3">
          <p className="text-sm text-slate-600">Scan with an authenticator app, then enter the 6-digit code.</p>
          <img src={qr} alt="2FA QR code" className="h-40 w-40 rounded-lg border border-slate-200" />
          <input className="input w-40" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-primary">Enable</button>
        </form>
      )}

      {enabled && (
        <form onSubmit={disable} className="space-y-3">
          <input
            className="input w-40"
            placeholder="Current code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn-danger">Disable 2FA</button>
        </form>
      )}

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    </section>
  );
}
