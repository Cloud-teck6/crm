import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';
import { ContactsPage } from './pages/ContactsPage';
import { AccountsPage } from './pages/AccountsPage';
import { DealsPage } from './pages/DealsPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { AutomationPage } from './pages/AutomationPage';
import { ImportPage } from './pages/ImportPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { UsersPage } from './pages/UsersPage';
import { RolesPage } from './pages/RolesPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/deals" element={<DealsPage />} />
        <Route path="/conversations" element={<ConversationsPage />} />
        <Route path="/automation" element={<AutomationPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
