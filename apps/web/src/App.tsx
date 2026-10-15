import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthSessionResponse, HealthResponse, PublicUser } from '@medbourse/shared';
import { roleHasPermission } from '@medbourse/shared';
import PortalShell, { type PortalTab } from './components/PortalShell';
import PublicSite, { type HealthState } from './components/PublicSite';
import CasesView from './components/CasesView';
import CatalogView from './components/CatalogView';
import CustomersView from './components/CustomersView';
import AuditView from './components/AuditView';
import { apiUrl } from './api';
import styles from './App.module.css';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export default function App() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PortalTab>('cases');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${apiBase}/health`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as HealthResponse;
        if (!cancelled) {
          setHealth({ kind: 'ok', data });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          setHealth({ kind: 'error', message });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        const res = await fetch(apiUrl('/auth/me'), { credentials: 'include' });
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as AuthSessionResponse;
          setUser(body.user);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    try {
      await fetch(apiUrl('/auth/logout'), { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore */
    }
    setUser(null);
  }

  if (authLoading) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>{t('health.loading')}</p>
      </div>
    );
  }

  if (!user) {
    return <PublicSite health={health} onAuthenticated={setUser} />;
  }

  return (
    <PortalShell
      user={user}
      active={activeTab}
      onNavigate={setActiveTab}
      onLogout={() => void handleLogout()}
    >
      {activeTab === 'cases' && <CasesView currentUserId={user.id} />}
      {activeTab === 'customers' && (
        <CustomersView canReassign={roleHasPermission(user.role, 'assignment:manage:admin')} />
      )}
      {activeTab === 'catalog' && <CatalogView />}
      {activeTab === 'audit' && <AuditView />}
    </PortalShell>
  );
}
