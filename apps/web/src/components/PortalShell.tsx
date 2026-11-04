import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicUser, UserRole } from '@medbourse/shared';
import { apiUrl } from '../api';
import LanguageSwitcher from './LanguageSwitcher';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import BrandMark from './BrandMark';
import styles from './PortalShell.module.css';

export type PortalTab =
  | 'cases'
  | 'customers'
  | 'users'
  | 'assignments'
  | 'payments'
  | 'catalog'
  | 'documents'
  | 'showcase'
  | 'site'
  | 'audit'
  | 'profile';

const NAV_ITEMS = [
  { id: 'cases', labelKey: 'nav.cases', roles: ['customer', 'admin', 'super_admin'] },
  { id: 'customers', labelKey: 'nav.customers', roles: ['admin', 'super_admin'] },
  { id: 'users', labelKey: 'nav.users', roles: ['super_admin'] },
  { id: 'assignments', labelKey: 'nav.assignments', roles: ['super_admin'] },
  { id: 'payments', labelKey: 'nav.payments', roles: ['admin', 'super_admin'] },
  { id: 'catalog', labelKey: 'nav.catalog', roles: ['super_admin'] },
  { id: 'documents', labelKey: 'nav.documents', roles: ['super_admin'] },
  { id: 'showcase', labelKey: 'nav.showcase', roles: ['super_admin'] },
  { id: 'site', labelKey: 'nav.site', roles: ['super_admin'] },
  { id: 'audit', labelKey: 'nav.audit', roles: ['super_admin'] },
  { id: 'profile', labelKey: 'nav.profile', roles: ['customer', 'admin', 'super_admin'] },
] as const;

interface PortalShellProps {
  user: PublicUser;
  active: PortalTab;
  onNavigate: (tab: PortalTab) => void;
  /** Opens a specific case from a notification click. */
  onOpenCase: (caseId: string) => void;
  onLogout: () => void;
  children: ReactNode;
}

export default function PortalShell({
  user,
  active,
  onNavigate,
  onOpenCase,
  onLogout,
  children,
}: PortalShellProps) {
  const { t } = useTranslation();
  const items = NAV_ITEMS.filter((item) =>
    (item.roles as readonly UserRole[]).includes(user.role),
  );
  const avatarUrl = user.avatarUrl
    ? user.avatarUrl.startsWith('http')
      ? user.avatarUrl
      : apiUrl(user.avatarUrl)
    : null;
  const initials = ([user.firstName, user.lastName].filter(Boolean).join(' ') || user.email)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <BrandMark size={24} variant="mono" label={t('brand.name')} />
          <span className={styles.brandSub}>{t('portal.workspace')}</span>
        </div>
        <div className={styles.headerActions}>
          <LanguageSwitcher tone="brand" />
          <ThemeToggle tone="brand" />
          <NotificationBell onOpenCase={onOpenCase} />
          <button
            type="button"
            className={styles.userInfo}
            onClick={() => onNavigate('profile')}
            aria-label={t('nav.profile')}
          >
            <span className={styles.userAvatar}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className={styles.userAvatarImage} />
              ) : (
                initials
              )}
            </span>
            <span className={styles.userText}>
              <span className={styles.userEmail}>{user.email}</span>
              <span className={styles.userRole}>{t(`roles.${user.role}`)}</span>
            </span>
          </button>
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
