import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fullName } from '../lib/format';

interface Contact { id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null }
interface TimelineItem { kind: 'message' | 'call' | 'activity'; at: string; data: any }
interface Template { id: string; name: string; channel: string; status: string; body: string }

const CHANNELS = ['EMAIL', 'WHATSAPP', 'SMS'] as const;

export function ConversationsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);

  const contactsQ = useQuery({
    queryKey: ['conv-contacts', q],
    queryFn: async () => (await api.get('/contacts', { params: { q: q || undefined, pageSize: 100 } })).data.items as Contact[],
  });

  return (
    <div className="flex h-full gap-4">
      <aside className="flex w-72 flex-col">
        <input className="input mb-3" placeholder="Search contacts…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="card flex-1 divide-y divide-slate-100 overflow-auto">
          {contactsQ.data?.length === 0 && <div className="td text-slate-400">No contacts.</div>}
          {contactsQ.data?.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`flex w-full flex-col items-start px-4 py-3 text-left hover:bg-slate-50 ${selected?.id === c.id ? 'bg-brand-50' : ''}`}
            >
              <span className="text-sm font-medium">{fullName(c)}</span>
              <span className="text-xs text-slate-400">{c.email ?? c.phone ?? '—'}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <div className="grid flex-1 place-items-center text-slate-400">Select a contact to view the conversation</div>
        ) : (
          <Conversation contact={selected} canSend={can('message:create')} canCall={can('call:create')}
            onChange={() => qc.invalidateQueries({ queryKey: ['timeline', selected.id] })} />
        )}
      </section>
    </div>
  );
}

function Conversation({ contact, canSend, canCall, onChange }: { contact: Contact; canSend: boolean; canCall: boolean; onChange: () => void }) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('EMAIL');
  const [templateId, setTemplateId] = useState('');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [error, setError] = useState('');

  const timelineQ = useQuery({
    queryKey: ['timeline', contact.id],
    queryFn: async () => (await api.get(`/timeline/contact/${contact.id}`)).data.items as TimelineItem[],
  });
  const templatesQ = useQuery({
    queryKey: ['templates', channel],
    queryFn: async () => (await api.get('/templates', { params: { channel } })).data as Template[],
  });

  const channelTemplates = useMemo(
    () => (templatesQ.data ?? []).filter((t) => t.channel === channel && (channel !== 'WHATSAPP' || t.status === 'APPROVED')),
    [templatesQ.data, channel],
  );

  const sendM = useMutation({
    mutationFn: () =>
      api.post('/messages', {
        channel,
        contactId: contact.id,
        subject: channel === 'EMAIL' && !templateId ? subject : undefined,
        body: templateId ? undefined : body,
        templateId: templateId || undefined,
      }),
    onSuccess: () => { setBody(''); setSubject(''); setTemplateId(''); setError(''); qc.invalidateQueries({ queryKey: ['timeline', contact.id] }); onChange(); },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const callM = useMutation({
    mutationFn: () => api.post('/calls/click-to-call', { contactId: contact.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['timeline', contact.id] }); },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  function onSend(e: FormEvent) {
    e.preventDefault();
    sendM.mutate();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{fullName(contact)}</h1>
          <p className="text-xs text-slate-400">{contact.email} · {contact.phone}</p>
        </div>
        {canCall && (
          <button className="btn-ghost" disabled={callM.isPending} onClick={() => callM.mutate()}>📞 Call</button>
        )}
      </div>

      <div className="card flex-1 space-y-3 overflow-auto p-4">
        {timelineQ.isLoading && <div className="text-slate-400">Loading…</div>}
        {timelineQ.data?.length === 0 && <div className="text-center text-sm text-slate-400">No activity yet. Start the conversation below.</div>}
        {timelineQ.data?.map((item, i) => <TimelineRow key={i} item={item} />)}
      </div>

      {canSend && (
        <form onSubmit={onSend} className="card mt-3 space-y-2 p-3">
          <div className="flex items-center gap-2">
            <select className="input w-32" value={channel} onChange={(e) => { setChannel(e.target.value as any); setTemplateId(''); }}>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="input flex-1" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Free text{channel === 'WHATSAPP' ? ' (within 24h window)' : ''}</option>
              {channelTemplates.map((t) => <option key={t.id} value={t.id}>Template: {t.name}</option>)}
            </select>
          </div>
          {channel === 'EMAIL' && !templateId && (
            <input className="input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          )}
          {!templateId && (
            <textarea className="input" rows={3} placeholder="Type a message…" value={body} onChange={(e) => setBody(e.target.value)} />
          )}
          {templateId && <div className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">Sending template — merge fields fill from the contact.</div>}
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="flex justify-end">
            <button className="btn-primary" disabled={sendM.isPending || (!templateId && !body)}>
              {sendM.isPending ? 'Sending…' : `Send ${channel.toLowerCase()}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const at = new Date(item.at).toLocaleString();
  if (item.kind === 'call') {
    return (
      <div className="text-center text-xs text-slate-500">
        📞 {item.data.direction.toLowerCase()} call · {item.data.disposition ?? '—'}
        {item.data.duration ? ` · ${item.data.duration}s` : ''}
        {item.data.recordingUrl ? <> · <a className="text-brand-600 underline" href={item.data.recordingUrl} target="_blank" rel="noreferrer">recording</a></> : ''}
        <span className="ml-1 text-slate-300">{at}</span>
      </div>
    );
  }
  if (item.kind === 'activity') {
    return <div className="text-center text-xs text-slate-400">✎ {item.data.type}: {item.data.subject ?? ''} · {at}</div>;
  }
  const outbound = item.data.direction === 'OUTBOUND';
  return (
    <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${outbound ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
        <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-70">{item.data.channel}{item.data.subject ? ` · ${item.data.subject}` : ''}</div>
        <div className="whitespace-pre-wrap">{item.data.body}</div>
        <div className={`mt-0.5 text-[10px] ${outbound ? 'text-white/70' : 'text-slate-400'}`}>{item.data.status?.toLowerCase()} · {at}</div>
      </div>
    </div>
  );
}
