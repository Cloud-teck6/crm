import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api } from './api';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  status: string;
  twoFactorEnabled: boolean;
  role: { id: string; name: string; dataScope: string };
  team: { id: string; name: string } | null;
  territory: { id: string; name: string } | null;
  permissions: string[];
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string, opts?: { tenantSlug?: string; twoFactorCode?: string }) => Promise<void>;
  register: (payload: { companyName: string; fullName: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const res = await api.get<Me>('/auth/me');
      setMe(res.data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function login(
    email: string,
    password: string,
    opts?: { tenantSlug?: string; twoFactorCode?: string },
  ) {
    const res = await api.post<Me>('/auth/login', { email, password, ...opts });
    setMe(res.data);
  }

  async function register(payload: { companyName: string; fullName: string; email: string; password: string }) {
    await api.post('/auth/register', payload);
    await refresh();
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      setMe(null);
    }
  }

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading,
      refresh,
      login,
      register,
      logout,
      can: (permission: string) =>
        !!me && (me.permissions.includes('*') || me.permissions.includes(permission)),
    }),
    [me, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
