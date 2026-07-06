import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Modal } from '../components/ui/Modal';
import { formatCurrency } from '../lib/format';

interface DealCard {
  id: string;
  title: string;
  value: string | number;
  currency: string;
  daysInStage: number;
  isRotting: boolean;
  contact: { firstName: string | null; lastName: string | null } | null;
  account: { name: string } | null;
}
interface Column {
  id: string;
  name: string;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  count: number;
  total: number;
  weighted: number;
  deals: DealCard[];
}
interface Board {
  pipeline: { id: string; name: string } | null;
  columns: Column[];
}
interface Pipeline { id: string; name: string }

export function DealsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [pipelineId, setPipelineId] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const pipelinesQ = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => (await api.get('/pipelines')).data as Pipeline[],
  });

  useEffect(() => {
    if (!pipelineId && pipelinesQ.data?.length) setPipelineId(pipelinesQ.data[0].id);
  }, [pipelinesQ.data, pipelineId]);

  const boardQ = useQuery({
    queryKey: ['board', pipelineId],
    queryFn: async () => (await api.get('/deals/board', { params: { pipelineId: pipelineId || undefined } })).data as Board,
    enabled: !!pipelinesQ.data,
  });

  const createPipelineM = useMutation({
    mutationFn: () => api.post('/pipelines', { name: 'Sales Pipeline', isDefault: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pipelines'] }); },
  });

  const moveM = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) => api.post(`/deals/${id}/move`, { stageId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board'] }),
  });

  function onDrop(colId: string) {
    setOverCol(null);
    if (dragId) moveM.mutate({ id: dragId, stageId: colId });
    setDragId(null);
  }

  if (pipelinesQ.data && pipelinesQ.data.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <div className="card max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">No pipeline yet</h2>
          <p className="mt-1 text-sm text-slate-500">Create a sales pipeline to start tracking deals on the board.</p>
          {can('pipeline:manage') ? (
            <button className="btn-primary mt-4" disabled={createPipelineM.isPending} onClick={() => createPipelineM.mutate()}>
              {createPipelineM.isPending ? 'Creating…' : 'Create default pipeline'}
            </button>
          ) : (
            <p className="mt-4 text-sm text-amber-600">Ask an admin to create a pipeline.</p>
          )}
        </div>
      </div>
    );
  }

  const columns = boardQ.data?.columns ?? [];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Deals</h1>
          {pipelinesQ.data && pipelinesQ.data.length > 1 && (
            <select className="input w-48" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
              {pipelinesQ.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        {can('deal:create') && <button className="btn-primary" onClick={() => setCreating(true)}>Add deal</button>}
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
            onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
            onDrop={() => onDrop(col.id)}
            className={`flex w-72 flex-shrink-0 flex-col rounded-xl border p-2 ${
              overCol === col.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-slate-100/60'
            }`}
          >
            <div className="mb-2 px-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{col.name}</span>
                <span className="badge bg-white text-slate-500">{col.count}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {formatCurrency(col.total)} · weighted {formatCurrency(col.weighted)}
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {col.deals.map((d) => (
                <div
                  key={d.id}
                  draggable={can('deal:edit')}
                  onDragStart={() => setDragId(d.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`card cursor-grab p-3 active:cursor-grabbing ${dragId === d.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{d.title}</span>
                    {d.isRotting && <span title="Rotting" className="text-amber-500">🔥</span>}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(d.value, d.currency)}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                    <span>{d.account?.name ?? (d.contact ? `${d.contact.firstName ?? ''} ${d.contact.lastName ?? ''}`.trim() : '—')}</span>
                    <span>{d.daysInStage}d</span>
                  </div>
                </div>
              ))}
              {col.deals.length === 0 && <div className="px-1 py-6 text-center text-xs text-slate-400">Drop deals here</div>}
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <CreateDealModal
          pipelineId={pipelineId}
          onClose={() => setCreating(false)}
          onDone={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['board'] }); }}
        />
      )}
    </div>
  );
}

function CreateDealModal({ pipelineId, onClose, onDone }: { pipelineId: string; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState('');
  const createM = useMutation({
    mutationFn: (body: any) => api.post('/deals', { ...body, pipelineId }),
    onSuccess: onDone,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    createM.mutate({
      title: f.get('title'),
      value: f.get('value') ? Number(f.get('value')) : undefined,
    });
  }

  return (
    <Modal open onClose={onClose} title="New deal">
      <form onSubmit={onSubmit} className="space-y-4">
        <div><label className="label">Title</label><input className="input" name="title" required /></div>
        <div><label className="label">Value (₹)</label><input className="input" name="value" type="number" min="0" /></div>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full" disabled={createM.isPending}>{createM.isPending ? 'Saving…' : 'Create deal'}</button>
      </form>
    </Modal>
  );
}
