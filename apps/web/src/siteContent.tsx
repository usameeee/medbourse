import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AppLocale,
  LocalizedText,
  PageContentKey,
  PublicSiteContent,
  SocialNetwork,
} from '@medbourse/shared';
import { getSiteContent } from './api';

type LoadState = 'loading' | 'ready' | 'error';

export interface ResolvedSocial {
  id: string;
  url: string;
  network: SocialNetwork;
}

export interface ResolvedSection {
  id: string;
  title: string;
  body: string;
}

export interface ResolvedPage {
  eyebrow: string;
  title: string;
  lead: string;
  updated: string;
  sections: ResolvedSection[];
}

interface SiteContentValue {
  state: LoadState;
  /** Active social accounts, in display order. */
  social: ResolvedSocial[];
  /** Resolved copy for a page, or `null` when none is configured. */
  page: (key: PageContentKey) => ResolvedPage | null;
}

const EMPTY: SiteContentValue = {
  state: 'loading',
  social: [],
  page: () => null,
};

const SiteContentContext = createContext<SiteContentValue>(EMPTY);

function pick(text: LocalizedText, locale: AppLocale): string {
  return (text[locale] || text.en || '').trim();
}

/**
 * Loads the Super-Admin-owned public site config once, and exposes the pieces the header,
 * footer, and pages read. Empty collections fall back to the built-in defaults at the call site.
 */
export function SiteContentProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [state, setState] = useState<LoadState>('loading');
  const [content, setContent] = useState<PublicSiteContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSiteContent()
      .then((res) => {
        if (!cancelled) {
          setContent(res);
          setState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const locale = (i18n.language.split('-')[0] || 'en') as AppLocale;

  const value = useMemo<SiteContentValue>(() => {
    if (!content) {
      return { ...EMPTY, state };
    }

    const social = content.social
      .filter((account) => account.isActive && account.url.trim().length > 0)
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((account) => ({
        id: account.id,
        url: account.url,
        network: account.network,
      }));

    const page = (key: PageContentKey): ResolvedPage | null => {
      const found = content.pages.find((candidate) => candidate.key === key);
      if (!found || !found.isActive) {
        return null;
      }
      const sections = found.sections
        .map((section) => ({
          id: section.id,
          title: pick(section.title, locale),
          body: pick(section.body, locale),
        }))
        .filter((section) => section.title || section.body);
      const eyebrow = pick(found.eyebrow, locale);
      const title = pick(found.title, locale);
      const lead = pick(found.lead, locale);
      if (!eyebrow && !title && !lead && sections.length === 0) {
        return null;
      }
      return { eyebrow, title, lead, updated: found.updated, sections };
    };

    return { state, social, page };
  }, [content, state, locale]);

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent(): SiteContentValue {
  return useContext(SiteContentContext);
}

/** Resolved copy for one public page, or `null` to fall back to the built-in content. */
export function usePageContent(key: PageContentKey): ResolvedPage | null {
  return useSiteContent().page(key);
}
