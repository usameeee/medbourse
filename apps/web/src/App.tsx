import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { PublicUser } from '@medbourse/shared';
import { roleHasPermission } from '@medbourse/shared';
import PortalShell, { type PortalTab } from './components/PortalShell';
import PublicLayout from './components/PublicLayout';
import PublicSite from './components/PublicSite';
import CategoryPage from './components/CategoryPage';
import ServicesPage from './components/ServicesPage';
import ContactPage from './components/ContactPage';
import FaqPage from './components/FaqPage';
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import BrandMark from './components/BrandMark';
import CasesView from './components/CasesView';
import CatalogView from './components/CatalogView';
import CountryAssignmentsView from './components/CountryAssignmentsView';
import CustomersView from './components/CustomersView';
import InviteClaimPage from './components/InviteClaimPage';
import DocumentLibraryView from './components/DocumentLibraryView';
import PaymentsView from './components/PaymentsView';
import ShowcaseAdminView from './components/ShowcaseAdminView';
import SiteContentView from './components/SiteContentView';
import AuditView from './components/AuditView';
import ProfileView from './components/ProfileView';
import UsersAdminView from './components/UsersAdminView';
import { apiUrl, getCurrentUser, refreshSession, setSessionExpiredHandler } from './api';
import styles from './App.module.css';

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PortalTab>('cases');
  // A case a notification asked us to open; cleared once the cases view has consumed it.
  const [focusCaseId, setFocusCaseId] = useState<string | null>(null);

  const openCase = useCallback((caseId: string) => {
    setActiveTab('cases');
    setFocusCaseId(caseId);
  }, []);
  const clearFocusCase = useCallback(() => setFocusCaseId(null), []);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        const body = await getCurrentUser();
        if (cancelled) return;
        setUser(body.user);
      } catch {
        /* not signed in */
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // A request that cannot recover its session drops the stale user so the sign-in dialog shows.
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    if (!user) return;
    // The access cookie lives only 15 minutes, so the first call after an idle spell used to
    // start unauthenticated, 401, and only then refresh and retry — which showed an error on
    // the wire for a save that in fact succeeded. Rotate the token ahead of expiry, and again
    // when a throttled tab wakes up, so authenticated actions always start with a live token.
    const rotate = () => {
      void refreshSession();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') rotate();
    };
    const timer = window.setInterval(rotate, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

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
      <div className={styles.splash}>
        <BrandMark size={56} />
      </div>
    );
  }

  const signedIn = Boolean(user);
  const publicLayout = (node: ReactNode) => (
    <PublicLayout signedIn={signedIn} onAuthenticated={setUser}>
      {node}
    </PublicLayout>
  );

  return (
    <Routes>
      <Route path="/services" element={publicLayout(<ServicesPage />)} />
      <Route path="/contact" element={publicLayout(<ContactPage signedIn={signedIn} />)} />
      <Route path="/faq" element={publicLayout(<FaqPage />)} />
      <Route path="/privacy" element={publicLayout(<PrivacyPage />)} />
      <Route path="/terms" element={publicLayout(<TermsPage />)} />
      <Route
        path="/category/:category"
        element={publicLayout(<CategoryPage signedIn={signedIn} />)}
      />
      <Route
        path="/invite/:token"
        element={publicLayout(<InviteClaimPage onAuthenticated={setUser} />)}
      />
      <Route
        path="/"
        element={
          user ? (
            <PortalShell
              user={user}
              active={activeTab}
              onNavigate={setActiveTab}
              onOpenCase={openCase}
              onLogout={() => void handleLogout()}
            >
              {activeTab === 'cases' && (
                <CasesView
                  currentUserId={user.id}
                  canApply={roleHasPermission(user.role, 'case:create:self')}
                  defaultCountryCode={user.countryCode ?? undefined}
                  focusCaseId={focusCaseId}
                  onFocusHandled={clearFocusCase}
                />
              )}
              {activeTab === 'customers' && (
                <CustomersView
                  user={user}
                  // Reassigning a customer is a Super Admin action; admins can only read.
                  canReassign={roleHasPermission(user.role, 'assignment:manage:super_admin')}
                  canViewActivity={roleHasPermission(user.role, 'audit:read:super_admin')}
                  // Office flow: an admin may open a login account and a case on the customer's behalf.
                  canApplyForCustomer={roleHasPermission(user.role, 'case:create:admin')}
                  onOpenCase={openCase}
                />
              )}
              {activeTab === 'catalog' && <CatalogView />}
              {activeTab === 'documents' && <DocumentLibraryView />}
              {activeTab === 'showcase' && <ShowcaseAdminView />}
              {activeTab === 'site' && <SiteContentView />}
              {activeTab === 'audit' && <AuditView />}
              {activeTab === 'users' && <UsersAdminView currentUserId={user.id} />}
              {activeTab === 'assignments' && <CountryAssignmentsView />}
              {activeTab === 'payments' && <PaymentsView user={user} />}
              {activeTab === 'profile' && (
                <ProfileView user={user} onUserUpdated={setUser} />
              )}
            </PortalShell>
          ) : (
            publicLayout(<PublicSite />)
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
