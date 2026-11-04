import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SOCIAL_NETWORK_LABELS } from '@medbourse/shared';
import type { PublicUser } from '@medbourse/shared';
import { FOOTER_LINKS } from '../publicFooter';
import { SiteContentProvider, useSiteContent } from '../siteContent';
import AuthDialog from './AuthDialog';
import BrandMark from './BrandMark';
import LanguageSwitcher from './LanguageSwitcher';
import SocialIcon from './SocialIcon';
import ThemeToggle from './ThemeToggle';
import styles from './PublicLayout.module.css';

interface PublicAuthValue {
  openAuth: () => void;
}

const PublicAuthContext = createContext<PublicAuthValue>({ openAuth: () => {} });

/** Pages rendered inside `<PublicLayout>` open the one shared sign-in dialog through this. */
export function usePublicAuth(): PublicAuthValue {
  return useContext(PublicAuthContext);
}

/** Built-in header navigation: the three service lines. */
const DEFAULT_NAV = [
  { id: 'education', to: '/category/education', label: 'publicSite.nav.universities' },
  { id: 'medical', to: '/category/medical', label: 'publicSite.nav.hospitals' },
  { id: 'tourism', to: '/category/tourism', label: 'publicSite.nav.tourism' },
] as const;

interface NavEntry {
  id: string;
  href: string;
  label: string;
}

interface SocialEntry {
  id: string;
  href: string;
  network: string;
  label: string;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

interface PublicLayoutProps {
  signedIn: boolean;
  onAuthenticated: (user: PublicUser) => void;
  children: ReactNode;
}

/**
 * Header, footer, and the shared sign-in dialog for every public page. Navigation uses the
 * built-in defaults; the social row comes from the Super-Admin-owned site content when set.
 */
export default function PublicLayout(props: PublicLayoutProps) {
  return (
    <SiteContentProvider>
      <PublicLayoutInner {...props} />
    </SiteContentProvider>
  );
}

function PublicLayoutInner({ signedIn, onAuthenticated, children }: PublicLayoutProps) {
  const { t } = useTranslation();
  const siteContent = useSiteContent();
  const [authOpen, setAuthOpen] = useState(false);
  const auth = useMemo<PublicAuthValue>(() => ({ openAuth: () => setAuthOpen(true) }), []);

  const nav: NavEntry[] = DEFAULT_NAV.map((item) => ({
    id: item.id,
    href: item.to,
    label: t(item.label),
  }));

  const footerLinks: NavEntry[] = FOOTER_LINKS.map((item) => ({
    id: item.id,
    href: item.to,
    label: t(item.labelKey),
  }));

  const social: SocialEntry[] = siteContent.social.map((item) => ({
    id: item.id,
    href: item.url,
    network: item.network,
    label: SOCIAL_NETWORK_LABELS[item.network],
  }));

  return (
    <PublicAuthContext.Provider value={auth}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link className={styles.brand} to="/">
              <BrandMark size={28} label={t('brand.name')} />
              <span className={styles.brandTagline}>{t('brand.tagline')}</span>
            </Link>

            <nav className={styles.nav} aria-label={t('publicSite.navAria')}>
              {nav.map((item) =>
                isExternal(item.href) ? (
                  <a
                    key={item.id}
                    className={styles.navLink}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.label}
                  </a>
                ) : (
                  <NavLink
                    key={item.id}
                    to={item.href}
                    className={({ isActive }) =>
                      isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
                    }
                  >
                    {item.label}
                  </NavLink>
                ),
              )}
            </nav>

            <div className={styles.headerActions}>
              <LanguageSwitcher />
              <ThemeToggle />
              {signedIn ? (
                <Link className={styles.signIn} to="/">
                  {t('portal.workspace')}
                </Link>
              ) : (
                <button type="button" className={styles.signIn} onClick={auth.openAuth}>
                  {t('auth.login')}
                </button>
              )}
            </div>
          </div>
        </header>

        <main className={styles.main}>{children}</main>

        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <BrandMark size={26} variant="mono" label={t('brand.name')} />
              <p className={styles.footerTagline}>{t('brand.tagline')}</p>
            </div>

            <nav className={styles.footerNav} aria-label={t('footer.navAria')}>
              {footerLinks.map((item) =>
                isExternal(item.href) ? (
                  <a
                    key={item.id}
                    className={styles.footerLink}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link key={item.id} className={styles.footerLink} to={item.href}>
                    {item.label}
                  </Link>
                ),
              )}
            </nav>

            {social.length > 0 && (
              <div className={styles.footerSocial}>
                <p className={styles.footerSocialLabel}>{t('footer.social.label')}</p>
                <ul className={styles.socialList}>
                  {social.map((item) => (
                    <li key={item.id}>
                      <a
                        className={styles.socialLink}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={item.label}
                      >
                        <SocialIcon name={item.network} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </footer>

        <AuthDialog
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={onAuthenticated}
        />
      </div>
    </PublicAuthContext.Provider>
  );
}
