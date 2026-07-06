import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  dataScope: string;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}
interface PermissionDef {
  key: string;
  resource: string;
  action: string;
  description: string;
}
interface Catalog {
  permissions: PermissionDef[];
  resourceLabels: Record<string, string>;
}

export function RolesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [dataScope, setDataScope] = useState('OWN');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rolesQ = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/roles')).data as RoleRow[],
  });
  const catalogQ = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: async () => (await api.get('/roles/permission-catalog')).data as Catalog,
  });

  const grouped = useMemo(() => {
    const map: Record<string, PermissionDef[]> = {};
    catalogQ.data?.permissions.forEach((p) => {
      (map[p.resource] ??= []).push(p);
    });
    return map;
  }, [catalogQ.data]);

  const createM = useMutation({
    mutationFn: () =>
      api.post('/roles', { name, dataScope, permissions: Array.from(selected) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      setCreating(false);
      setName('');
      setSelected(new Set());
      setError('');
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Roles &amp; Permissions</h1>
        {can('role:create') && (
          <button className="btn-primary" onClick={() => setCreating((c) => !c)}>
            {creating ? 'Close' : 'New role'}
          </button>
        )}
      </div>

      {creating && can('role:create') && (
        <div className="card space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Role name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Data scope</label>
              <select className="input" value={dataScope} onChange={(e) => setDataScope(e.target.value)}>
                <option value="OWN">Own records only</option>
                <option value="TEAM">Team</option>
                <option value="TERRITORY">Territory</option>
                <option value="TENANT">Entire workspace</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {Object.entries(grouped).map(([resource, perms]) => (
              <div key={resource}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {catalogQ.data?.resourceLabels[resource] ?? resource}
                </div>
                <div className="flex flex-wrap gap-2">
                  {perms.map((p) => (
                    <label
                      key={p.key}
                      className={`cursor-pointer rounded-lg border px-2 py-1 text-xs ${
                        selected.has(p.key)
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mr-1 align-middle"
                        checked={selected.has(p.key)}
                        onChange={() => toggle(p.key)}
                      />
                      {p.action}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button className="btn-primary" disabled={!name || createM.isPending} onClick={() => createM.mutate()}>
            {createM.isPending ? 'Creating…' : 'Create role'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rolesQ.data?.map((r) => (
          <div key={r.id} className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{r.name}</h3>
              {r.isSystem && <span className="badge bg-slate-100 text-slate-500">System</span>}
            </div>
            <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="badge bg-brand-50 text-brand-700">{r.dataScope}</span>
              <span className="badge bg-slate-100 text-slate-600">
                {r.permissions.includes('*') ? 'All' : r.permissions.length} permissions
              </span>
              <span className="badge bg-slate-100 text-slate-600">{r.userCount} users</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
