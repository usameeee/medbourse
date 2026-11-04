/**
 * Default links for the public footer and header.
 *
 * A Super Admin owns the social accounts through the site-content API; they are deliberately
 * not hard-coded, so the footer only ever shows the accounts an admin has actually registered.
 */

export interface FooterLink {
  id: string;
  /** In-app route. Targets without a page yet fall through to the home page. */
  to: string;
  /** i18n key, resolved at render time so every language stays in sync. */
  labelKey: string;
}

export const FOOTER_LINKS = [
  { id: 'services', to: '/services', labelKey: 'publicSite.nav.services' },
  { id: 'faq', to: '/faq', labelKey: 'footer.faq' },
  { id: 'contact', to: '/contact', labelKey: 'publicSite.nav.contact' },
  { id: 'privacy', to: '/privacy', labelKey: 'footer.privacy' },
  { id: 'terms', to: '/terms', labelKey: 'footer.terms' },
] as const satisfies readonly FooterLink[];
