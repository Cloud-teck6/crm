import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiErrorMessage } from '../lib/api';

export function LoginPage() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password, {
        tenantSlug: tenantSlug || undefined,
        twoFactorCode: twoFactorCode || undefined,
      });
      navigate('/');
    } catch (err: any) {
      if (err?.response?.data?.twoFactorRequired) {
        setNeeds2fa(true);
        setError('Enter your two-factor code to continue.');
      } else {
        setError(apiErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2 text-xl font-bold text-brand-700">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">C</span>
          CRM
        </div>
        <h1 className="mb-1 text-lg font-semibold">Sign in</h1>
        <p className="mb-6 text-sm text-slate-500">Welcome back. Sign in to your workspace.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Workspace slug (optional)</label>
            <input
              className="input"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="only if your email is in multiple workspaces"
            />
          </div>
          {needs2fa && (
            <div>
              <label className="label">Two-factor code</label>
              <input className="input" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} />
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          No workspace yet?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
