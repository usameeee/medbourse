/** The networks with a bespoke glyph. Anything else falls back to the generic link icon. */
export type SocialIconName =
  | 'instagram'
  | 'x'
  | 'linkedin'
  | 'youtube'
  | 'facebook'
  | 'whatsapp'
  | 'telegram'
  | 'tiktok'
  | 'discord'
  | 'github'
  | 'pinterest'
  | 'snapchat'
  | 'reddit'
  | 'threads'
  | 'vimeo'
  | 'email'
  | 'website'
  | 'generic';

const ALIASES: Record<string, SocialIconName> = {
  instagram: 'instagram',
  insta: 'instagram',
  ig: 'instagram',
  x: 'x',
  twitter: 'x',
  linkedin: 'linkedin',
  youtube: 'youtube',
  yt: 'youtube',
  facebook: 'facebook',
  fb: 'facebook',
  whatsapp: 'whatsapp',
  wa: 'whatsapp',
  telegram: 'telegram',
  tg: 'telegram',
  tiktok: 'tiktok',
  tt: 'tiktok',
  discord: 'discord',
  github: 'github',
  pinterest: 'pinterest',
  snapchat: 'snapchat',
  reddit: 'reddit',
  threads: 'threads',
  vimeo: 'vimeo',
  email: 'email',
  mail: 'email',
  website: 'website',
  site: 'website',
  web: 'website',
};

/** Maps a free-form account name to a known glyph, defaulting to the generic link. */
export function resolveSocialIcon(name: string): SocialIconName {
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALIASES[key] ?? 'generic';
}

/** Monoline glyphs for social links, so the site needs no icon dependency. */
export default function SocialIcon({ name }: { name: string }) {
  const shared = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
  };

  switch (resolveSocialIcon(name)) {
    case 'instagram':
      return (
        <svg {...shared}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'x':
      return (
        <svg {...shared}>
          <path d="M5 4l14 16M19 4L5 20" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg {...shared}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
          <path d="M8 10.4V16.5" />
          <path d="M8 7.6v.01" />
          <path d="M12 16.5V12.9a2.4 2.4 0 0 1 4.8 0v3.6" />
          <path d="M12 10.4v6.1" />
        </svg>
      );
    case 'youtube':
      return (
        <svg {...shared}>
          <rect x="3" y="6" width="18" height="12" rx="3.5" />
          <path d="M11 9.7l4.2 2.3L11 14.3z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'facebook':
      return (
        <svg {...shared}>
          <path d="M14.5 8.5H16V5.8h-2.2c-1.9 0-3.1 1.2-3.1 3.1v1.6H8.6v2.7h2.1V20h2.9v-6.8h2.2l.4-2.7h-2.6V9.4c0-.6.3-.9.9-.9z" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg {...shared}>
          <path d="M5 19l1.1-3.2A6.9 6.9 0 1 1 8.6 18z" />
          <path d="M9 9.6c.2 1 .7 1.8 1.5 2.6.7.7 1.5 1.2 2.4 1.4l.8-1.1 1.5.7c-.2 1-1.1 1.6-2.1 1.4-2-.4-3.9-2.2-4.6-4.2-.2-1 .4-1.9 1.4-2.1l.7 1.5z" />
        </svg>
      );
    case 'telegram':
      return (
        <svg {...shared}>
          <path d="M4.5 11.8L19 6.2l-4.4 11.6-3.4-4.1z" />
          <path d="M11.2 13.7l-1 3.4-.9-4.6" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg {...shared}>
          <path d="M14 4.5v9.3a3.2 3.2 0 1 1-2.7-3.2" />
          <path d="M14 6.6c.6 1.6 2 2.7 3.7 2.8" />
        </svg>
      );
    case 'discord':
      return (
        <svg {...shared}>
          <path d="M7 18s-2.6-.5-3.3-1.6c-.7-1.1-1.4-4.4-1.4-4.4C3.3 9 5.6 7.5 5.6 7.5L7.6 6l.7 1.3a10 10 0 0 1 3.7 0L12.7 6l2 1.5s2.3 1.5 3.3 4.5c0 0-.7 3.3-1.4 4.4C15.9 17.5 13 18 13 18l-.6-1a7 7 0 0 1-2.8 0z" />
          <circle cx="9.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'github':
      return (
        <svg {...shared}>
          <path d="M9 19c-3 1-3-1.5-4.2-2M15 20v-2.8c0-.8-.2-1.3-.6-1.7 2-.2 3.6-1 3.6-4.1a3.2 3.2 0 0 0-.9-2.2 3 3 0 0 0-.1-2.2s-.7-.2-2.3.9a7.8 7.8 0 0 0-4 0C9.2 6.3 8.5 6.5 8.5 6.5a3 3 0 0 0-.1 2.2 3.2 3.2 0 0 0-.9 2.2c0 3 1.6 3.9 3.6 4.1-.3.3-.5.8-.6 1.4V20" />
        </svg>
      );
    case 'pinterest':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12.4 8c-2 0-3.4 1.4-3.4 3 0 .8.4 1.6 1.1 1.9M12.6 9.5l-1.3 6.5" />
        </svg>
      );
    case 'snapchat':
      return (
        <svg {...shared}>
          <path d="M12 4.5c2 0 3.3 1.5 3.3 3.4 0 .6 0 1.3-.2 1.8.5.2 1-.2 1.3-.4.5-.3 1 .4.5.9-.6.6-1.4.8-1.5 1.2-.1.5 1.6 3 3.4 3.3.5.1.4.8-.2.9-.9.2-1.6.4-1.7.7-.1.3-.2.6-.6.5-.5-.1-1.1-.3-1.8 0-.6.3-1.3 1.2-2.5 1.2s-1.9-.9-2.5-1.2c-.7-.3-1.3-.1-1.8 0-.4.1-.5-.2-.6-.5-.1-.3-.8-.5-1.7-.7-.6-.1-.7-.8-.2-.9 1.8-.3 3.5-2.8 3.4-3.3-.1-.4-.9-.6-1.5-1.2-.5-.5 0-1.2.5-.9.3.2.8.6 1.3.4-.1-.5-.2-1.2-.2-1.8 0-1.9 1.3-3.4 3.3-3.4z" />
        </svg>
      );
    case 'reddit':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M8.5 12h.01M15.5 12h.01" />
          <path d="M8.5 15c1 1 2.2 1.4 3.5 1.4s2.5-.4 3.5-1.4" />
          <path d="M12 8.6l.9-3 2 .5" />
          <circle cx="15.3" cy="6.1" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'threads':
      return (
        <svg {...shared}>
          <path d="M12 4.5c4 0 6.5 2.6 6.5 7.5S16 20 12 20c-3.2 0-5.5-2.3-5.5-5s1.9-4.3 4.3-4.3c2 0 3.4 1.3 3.4 3.2 0 1.3-.8 2.1-1.9 2.1-.9 0-1.5-.6-1.5-1.4" />
        </svg>
      );
    case 'vimeo':
      return (
        <svg {...shared}>
          <path d="M4.5 9.5c1.5-2 3-2.7 3.7-2 .9.9.3 3.3.9 5.3.4 1.5 1.2 1.7 2 1 .9-.8 2.4-2.9 3-4.6.5-1.4 0-2-1-1.6-.8.3-1.3.7-1.9 1.4" />
        </svg>
      );
    case 'email':
      return (
        <svg {...shared}>
          <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
          <path d="M4 7l8 6 8-6" />
        </svg>
      );
    case 'website':
    case 'generic':
    default:
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.6 2.3 2.6 14.7 0 17M12 3.5c-2.6 2.3-2.6 14.7 0 17" />
        </svg>
      );
  }
}
