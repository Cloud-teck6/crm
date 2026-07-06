import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface AuditRow {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  actorId: string | null;
  ip: string | null;
  createdAt: string;
}

export function AuditLogPage() {
  const [resource, setResource] = useState('');

  const q = useQuery({
    queryKey: ['audit', resource],
    queryFn: async () =>
      (await api.get('/audit-logs', { params: { pageSize: 100, resource: resource || undefined } }))
        .data as { items: AuditRow[]; total: number },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <select className="input w-48" value={resource} onChange={(e) => setResource(e.target.value)}>
          <option value="">All resources</option>
          <option value="User">User</option>
          <option value="Role">Role</option>
          <option value="Tenant">Tenant</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">When</th>
              <th className="th">Action</th>
              <th className="th">Resource</th>
              <th className="th">Actor</th>
              <th className="th">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {q.isLoading && (
              <tr>
                <td className="td" colSpan={5}>
                  Loading…
                </td>
              </tr>
            )}
            {q.data?.items.map((row) => (
              <tr key={row.id}>
                <td className="td whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="td">
                  <span className="badge bg-brand-50 text-brand-700">{row.action}</span>
                </td>
                <td className="td">
                  {row.resource}
                  {row.resourceId ? <span className="text-slate-400"> · {row.resourceId.slice(0, 8)}</span> : null}
                </td>
                <td className="td">{row.actorId ? row.actorId.slice(0, 8) : 'system'}</td>
                <td className="td">{row.ip ?? '—'}</td>
              </tr>
            ))}
            {q.data && q.data.items.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={5}>
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
