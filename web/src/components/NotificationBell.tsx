import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Notif { id: string; title: string; body: string | null; readAt: string | null; createdAt: string; entityRef: string | null }

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const countQ = useQuery({
    queryKey: ['notif-count'],
    queryFn: async () => (await api.get('/notifications/unread-count')).data.unread as number,
    refetchInterval: 15000, // near-real-time bell
  });
  const listQ = useQuery({
    queryKey: ['notif-list'],
    queryFn: async () => (await api.get('/notifications')).data.items as Notif[],
    enabled: open,
  });

  const readM = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notif-list'] }); },
  });
  const readAllM = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notif-list'] }); },
  });

  const count = countQ.data ?? 0;

  return (
    <div className="relative">
      <button className="btn-ghost relative px-2" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <span className="text-lg">🔔</span>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              <button className="text-xs text-brand-600 hover:underline" onClick={() => readAllM.mutate()}>Mark all read</button>
            </div>
            <div className="max-h-96 overflow-auto">
              {listQ.data?.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-400">You're all caught up.</div>}
              {listQ.data?.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.readAt && readM.mutate(n.id)}
                  className={`block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${n.readAt ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body && <div className="truncate text-xs text-slate-500">{n.body}</div>}
                      <div className="mt-0.5 text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
