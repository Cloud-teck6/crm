import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  status: string;
  lastLoginAt: string | null;
  role: { id: string; name: string } | null;
}
interface RoleRow {
  id: string;
  name: string;
}

export function UsersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users?pageSize=200')).data.items as UserRow[],
  });
  const rolesQ = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/roles')).data as RoleRow[],
    enabled: can('role:view') || can('user:create'),
  });

  const createM = useMutation({
    mutationFn: (body: any) => api.post('/users', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      setError('');
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const statusM = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'deactivate' | 'reactivate' }) =>
      api.post(`/users/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    createM.mutate({
      email: f.get('email'),
      fullName: f.get('fullName'),
      roleId: f.get('roleId'),
      password: f.get('password'),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        {can('user:create') && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : 'Add user'}
          </button>
        )}
      </div>

      {showForm && can('user:create') && (
        <form onSubmit={onCreate} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="label">Full name</label>
            <input className="input" name="fullName" required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" name="email" type="email" required />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" name="roleId" required defaultValue="">
              <option value="" disabled>
                Select a role…
              </option>
              {rolesQ.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Temporary password</label>
            <input className="input" name="password" type="text" minLength={8} required />
          </div>
          {error && <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={createM.isPending}>
              {createM.isPending ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Role</th>
              <th className="th">Status</th>
              <th className="th">Last login</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usersQ.isLoading && (
              <tr>
                <td className="td" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {usersQ.data?.map((u) => (
              <tr key={u.id}>
                <td className="td font-medium">{u.fullName}</td>
                <td className="td">{u.email}</td>
                <td className="td">{u.role?.name ?? '—'}</td>
                <td className="td">
                  <span
                    className={`badge ${
                      u.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="td">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                <td className="td text-right">
                  {u.status === 'ACTIVE'
                    ? can('user:delete') && (
                        <button className="btn-ghost text-red-600" onClick={() => statusM.mutate({ id: u.id, action: 'deactivate' })}>
                          Deactivate
                        </button>
                      )
                    : can('user:edit') && (
                        <button className="btn-ghost" onClick={() => statusM.mutate({ id: u.id, action: 'reactivate' })}>
                          Reactivate
                        </button>
                      )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
