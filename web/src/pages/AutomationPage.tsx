import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Modal } from '../components/ui/Modal';

const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with', 'in', 'exists', 'not_exists'];
const TRIGGERS = ['lead.created', 'lead.updated', 'deal.stage_changed', 'message.inbound'];
const ACTIONS = ['assign_owner', 'send_message', 'create_task', 'update_field', 'add_tag', 'webhook'];

interface Rule { field: string; op: string; value?: string }
interface Action { type: string; config: Record<string, any> }

export function AutomationPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showWf, setShowWf] = useState(false);
  const [showScore, setShowScore] = useState(false);

  const wfQ = useQuery({ queryKey: ['workflows'], queryFn: async () => (await api.get('/workflows')).data as any[] });
  const scoreQ = useQuery({ queryKey: ['scoring-rules'], queryFn: async () => (await api.get('/scoring-rules')).data as any[] });

  const toggleWf = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/workflows/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Workflows</h1>
            <p className="text-sm text-slate-500">No-code automation: trigger → conditions → actions.</p>
          </div>
          {can('workflow:manage') && <button className="btn-primary" onClick={() => setShowWf(true)}>New workflow</button>}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {wfQ.data?.length === 0 && <div className="card p-5 text-slate-400">No workflows yet.</div>}
          {wfQ.data?.map((w) => (
            <div key={w.id} className="card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{w.name}</h3>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" checked={w.isActive} disabled={!can('workflow:manage')} onChange={(e) => toggleWf.mutate({ id: w.id, isActive: e.target.checked })} />
                  {w.isActive ? 'Active' : 'Off'}
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="badge bg-brand-50 text-brand-700">on {w.trigger?.type}</span>
                <span className="badge bg-slate-100 text-slate-600">{(w.conditions?.rules?.length ?? 0)} conditions</span>
                <span className="badge bg-slate-100 text-slate-600">{(w.actions?.length ?? 0)} actions</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Lead scoring</h2>
            <p className="text-sm text-slate-500">Add points when a lead matches a rule; the score drives prioritization.</p>
          </div>
          {can('workflow:manage') && <button className="btn-primary" onClick={() => setShowScore(true)}>New rule</button>}
        </div>
        <div className="card divide-y divide-slate-100">
          {scoreQ.data?.length === 0 && <div className="td text-slate-400">No scoring rules yet.</div>}
          {scoreQ.data?.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-medium">{r.name}</span>
              <div className="flex items-center gap-3 text-slate-500">
                <span className="text-xs">{r.condition?.rules?.length ?? 0} conditions</span>
                <span className="badge bg-green-100 text-green-700">+{r.points}</span>
                <span className={`badge ${r.isActive ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{r.isActive ? 'on' : 'off'}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {showWf && <WorkflowModal onClose={() => setShowWf(false)} onDone={() => { setShowWf(false); qc.invalidateQueries({ queryKey: ['workflows'] }); }} />}
      {showScore && <ScoringModal onClose={() => setShowScore(false)} onDone={() => { setShowScore(false); qc.invalidateQueries({ queryKey: ['scoring-rules'] }); }} />}
    </div>
  );
}

function RuleRows({ rules, setRules }: { rules: Rule[]; setRules: (r: Rule[]) => void }) {
  return (
    <div className="space-y-2">
      {rules.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input className="input flex-1" placeholder="field (e.g. budget)" value={r.field} onChange={(e) => setRules(rules.map((x, j) => j === i ? { ...x, field: e.target.value } : x))} />
          <select className="input w-32" value={r.op} onChange={(e) => setRules(rules.map((x, j) => j === i ? { ...x, op: e.target.value } : x))}>
            {OPS.map((o) => <option key={o}>{o}</option>)}
          </select>
          <input className="input w-32" placeholder="value" value={r.value ?? ''} onChange={(e) => setRules(rules.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
          <button type="button" className="btn-ghost px-2 text-red-500" onClick={() => setRules(rules.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn-ghost text-brand-600" onClick={() => setRules([...rules, { field: '', op: 'eq', value: '' }])}>+ condition</button>
    </div>
  );
}

function WorkflowModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('lead.created');
  const [match, setMatch] = useState<'AND' | 'OR'>('AND');
  const [rules, setRules] = useState<Rule[]>([{ field: '', op: 'eq', value: '' }]);
  const [actions, setActions] = useState<Action[]>([{ type: 'assign_owner', config: {} }]);
  const [error, setError] = useState('');

  const rolesQ = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get('/roles')).data as any[] });
  const tplQ = useQuery({ queryKey: ['templates-all'], queryFn: async () => (await api.get('/templates')).data as any[] });

  const createM = useMutation({
    mutationFn: () => api.post('/workflows', {
      name,
      trigger: { type: trigger },
      conditions: { match, rules: rules.filter((r) => r.field) },
      actions,
      isActive: true,
    }),
    onSuccess: onDone,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  function setAction(i: number, patch: Partial<Action>) { setActions(actions.map((a, j) => j === i ? { ...a, ...patch } : a)); }
  function setCfg(i: number, key: string, value: any) { setActions(actions.map((a, j) => j === i ? { ...a, config: { ...a.config, [key]: value } } : a)); }

  return (
    <Modal open onClose={onClose} title="New workflow" width="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label">Trigger</label><select className="input" value={trigger} onChange={(e) => setTrigger(e.target.value)}>{TRIGGERS.map((t) => <option key={t}>{t}</option>)}</select></div>
        </div>

        <div>
          <div className="mb-1 flex items-center gap-2"><span className="label mb-0">Conditions</span>
            <select className="input w-20 py-1" value={match} onChange={(e) => setMatch(e.target.value as any)}><option>AND</option><option>OR</option></select>
          </div>
          <RuleRows rules={rules} setRules={setRules} />
        </div>

        <div>
          <span className="label">Actions</span>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex gap-2">
                  <select className="input flex-1" value={a.type} onChange={(e) => setAction(i, { type: e.target.value, config: {} })}>{ACTIONS.map((t) => <option key={t}>{t}</option>)}</select>
                  <button type="button" className="btn-ghost px-2 text-red-500" onClick={() => setActions(actions.filter((_, j) => j !== i))}>✕</button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {a.type === 'assign_owner' && (
                    <select className="input col-span-2" value={a.config.roleId ?? ''} onChange={(e) => setCfg(i, 'roleId', e.target.value)}>
                      <option value="">Role (least-loaded)…</option>
                      {rolesQ.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  )}
                  {a.type === 'send_message' && (<>
                    <select className="input" value={a.config.channel ?? 'WHATSAPP'} onChange={(e) => setCfg(i, 'channel', e.target.value)}>{['EMAIL', 'WHATSAPP', 'SMS'].map((c) => <option key={c}>{c}</option>)}</select>
                    <select className="input" value={a.config.templateId ?? ''} onChange={(e) => setCfg(i, 'templateId', e.target.value)}>
                      <option value="">Template…</option>
                      {tplQ.data?.filter((t) => t.channel === (a.config.channel ?? 'WHATSAPP')).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </>)}
                  {a.type === 'create_task' && (<>
                    <input className="input" placeholder="Task subject" value={a.config.subject ?? ''} onChange={(e) => setCfg(i, 'subject', e.target.value)} />
                    <input className="input" type="number" placeholder="Due in days" value={a.config.dueInDays ?? ''} onChange={(e) => setCfg(i, 'dueInDays', Number(e.target.value))} />
                  </>)}
                  {a.type === 'add_tag' && <input className="input col-span-2" placeholder="Tag" value={a.config.tag ?? ''} onChange={(e) => setCfg(i, 'tag', e.target.value)} />}
                  {a.type === 'update_field' && (<>
                    <input className="input" placeholder="field" value={a.config.field ?? ''} onChange={(e) => setCfg(i, 'field', e.target.value)} />
                    <input className="input" placeholder="value" value={a.config.value ?? ''} onChange={(e) => setCfg(i, 'value', e.target.value)} />
                  </>)}
                  {a.type === 'webhook' && <input className="input col-span-2" placeholder="https://…" value={a.config.url ?? ''} onChange={(e) => setCfg(i, 'url', e.target.value)} />}
                </div>
              </div>
            ))}
            <button type="button" className="btn-ghost text-brand-600" onClick={() => setActions([...actions, { type: 'create_task', config: {} }])}>+ action</button>
          </div>
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full" disabled={!name || createM.isPending} onClick={() => createM.mutate()}>{createM.isPending ? 'Saving…' : 'Create & activate workflow'}</button>
      </div>
    </Modal>
  );
}

function ScoringModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [points, setPoints] = useState(10);
  const [rules, setRules] = useState<Rule[]>([{ field: '', op: 'gte', value: '' }]);
  const [error, setError] = useState('');
  const createM = useMutation({
    mutationFn: () => api.post('/scoring-rules', { name, points, condition: { match: 'AND', rules: rules.filter((r) => r.field) } }),
    onSuccess: onDone,
    onError: (e) => setError(apiErrorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title="New scoring rule">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label">Points</label><input className="input" type="number" value={points} onChange={(e) => setPoints(Number(e.target.value))} /></div>
        </div>
        <div><span className="label">When the lead matches (AND)</span><RuleRows rules={rules} setRules={setRules} /></div>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full" disabled={!name || createM.isPending} onClick={() => createM.mutate()}>{createM.isPending ? 'Saving…' : 'Create rule'}</button>
      </div>
    </Modal>
  );
}
