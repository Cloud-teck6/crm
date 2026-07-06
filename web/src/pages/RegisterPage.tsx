import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiErrorMessage } from '../lib/api';

export function RegisterPage() {
  const { me, register } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register({ companyName, fullName, email, password });
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="mb-1 text-lg font-semibold">Create your workspace</h1>
        <p className="mb-6 text-sm text-slate-500">You'll be the Super Admin of this workspace.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Company / agency name</label>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Your name</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Work email</label>
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
            <p className="mt-1 text-xs text-slate-400">At least 8 characters, with a letter and a number.</p>
          </div>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Creating…' : 'Create workspace'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
