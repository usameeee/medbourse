import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicUser, UserRole } from '@medbourse/shared';
import LanguageSwitcher from './LanguageSwitcher';
import NotificationBell from './NotificationBell';
import styles from './PortalShell.module.css';

export type PortalTab = 'cases' | 'customers' | 'catalog' | 'audit';

const NAV_ITEMS = [
  { id: 'cases', labelKey: 'nav.cases', roles: ['customer', 'staff', 'admin', 'super_admin'] },
  { id: 'customers', labelKey: 'nav.customers', roles: ['staff', 'admin', 'super_admin'] },
  { id: 'catalog', labelKey: 'nav.catalog', roles: ['super_admin'] },
  { id: 'audit', labelKey: 'nav.audit', roles: ['super_admin'] },
] as const;

interface PortalShellProps {
  user: PublicUser;
  active: PortalTab;
  onNavigate: (tab: PortalTab) => void;
  onLogout: () => void;
  children: ReactNode;
}

export default function PortalShell({ user, active, onNavigate, onLogout, children }: PortalShellProps) {
  const { t } = useTranslation();
  const items = NAV_ITEMS.filter((item) =>
    (item.roles as readonly UserRole[]).includes(user.role),
  );

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandName}>MEDBOURSE</span>
          <span className={styles.brandSub}>{t('portal.workspace')}</span>
        </div>
        <div className={styles.headerActions}>
          <LanguageSwitcher />
          <NotificationBell />
          <div className={styles.userInfo}>
            <span className={styles.userEmail}>{user.email}</span>
            <span className={styles.userRole}>{user.role}</span>
          </div>
          <button type="button" className={styles.logoutButton} onClick={onLogout}>
            {t('auth.logout')}
          </button>
        </div>
      </header>

      <nav className={styles.nav} aria-label={t('portal.navAria')}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.navItem} ${active === item.id ? styles.navItemActive : ''}`}
            aria-current={active === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </nav>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
