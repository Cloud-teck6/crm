import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth';
import { NotificationBell } from '../NotificationBell';

interface NavItem {
  to: string;
  label: string;
  permission?: string;
  icon: string;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/leads', label: 'Leads', permission: 'lead:view', icon: '✦' },
  { to: '/contacts', label: 'Contacts', permission: 'contact:view', icon: '◵' },
  { to: '/accounts', label: 'Accounts', permission: 'account:view', icon: '▢' },
  { to: '/deals', label: 'Deals', permission: 'deal:view', icon: '◑' },
  { to: '/conversations', label: 'Conversations', permission: 'message:view', icon: '✉' },
  { to: '/automation', label: 'Automation', permission: 'workflow:view', icon: '⚡' },
  { to: '/integrations', label: 'Integrations', permission: 'integration:view', icon: '⚷' },
  { to: '/import', label: 'Import', permission: 'import:create', icon: '⤓' },
  { to: '/users', label: 'Users', permission: 'user:view', icon: '☷' },
  { to: '/roles', label: 'Roles & Permissions', permission: 'role:view', icon: '◷' },
  { to: '/audit', label: 'Audit Log', permission: 'audit:view', icon: '◰' },
  { to: '/settings', label: 'Settings', permission: 'settings:view', icon: '⚙' },
];

export function AppLayout() {
  const { me, logout, can } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const items = NAV.filter((n) => !n.permission || can(n.permission));

  return (
    <div className="flex h-full">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-2 px-5 text-lg font-bold text-brand-700">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">C</span>
          CRM
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 text-xs text-slate-400">
          Phases 1–8 shipped · production-hardened
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="text-sm text-slate-500">
            {me?.role.name} · scope <span className="font-medium">{me?.role.dataScope}</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="text-right">
              <div className="text-sm font-medium">{me?.fullName}</div>
              <div className="text-xs text-slate-400">{me?.email}</div>
            </div>
            <button className="btn-ghost" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
