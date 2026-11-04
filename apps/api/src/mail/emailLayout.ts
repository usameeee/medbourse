/**
 * Branded transactional email layout.
 *
 * Email clients are a hostile rendering target — no external stylesheet, no
 * reliable `<style>` block, no SVG — so the shell is table-based and every rule
 * is inline. The palette mirrors the app tokens (`apps/web/src/styles/tokens.css`,
 * see DESIGN_SYSTEM.md): the Türkiye-flag red masthead carries the wordmark, the
 * page sits on the warm off-white surface, and the content is a raised white card.
 */

/** Brand tokens mirrored from `apps/web/src/styles/tokens.css` — keep in sync. */
const BRAND = {
  primary: '#E30A17',
  primaryStrong: '#A8060F',
  secondary: '#0B4F4A',
  surfaceBase: '#F7F6F3',
  surfaceRaised: '#FFFFFF',
  textPrimary: '#1C1B19',
  textSecondary: '#5C5954',
  textMuted: '#8A8680',
  borderDefault: '#D8D5CE',
} as const;

/** The app's body stack, widened with the fonts Gmail/Outlook actually ship. */
const SANS = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface BrandedEmailOptions {
  /** Hidden line the inbox shows next to the subject. */
  preheader: string;
  /** Small uppercase label above the heading. */
  eyebrow: string;
  heading: string;
  intro: string;
  /** Renders the large one-time-code block when present. */
  code?: string;
  /** Label above the code block. */
  codeLabel?: string;
  /** Small note under the code block, e.g. the expiry window. */
  codeNote?: string;
  /** Closing paragraph. */
  outro?: string;
}

/**
 * Wraps body copy in the MEDBOURSE shell. Output is a self-contained document
 * safe to hand straight to nodemailer's `html` field.
 */
export function renderBrandedEmail(options: BrandedEmailOptions): string {
  const codeBlock = options.code
    ? `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
                  <tr>
                    <td align="center" style="background-color:${BRAND.surfaceBase};border:1px solid ${BRAND.borderDefault};border-radius:12px;padding:20px 16px;">
                      <div style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.textMuted};">${escapeHtml(options.codeLabel ?? 'One-time code')}</div>
                      <div style="margin-top:10px;font-family:${SANS};font-size:34px;line-height:40px;font-weight:700;letter-spacing:9px;color:${BRAND.primaryStrong};">${escapeHtml(options.code)}</div>
                      ${options.codeNote ? `<div style="margin-top:10px;font-family:${SANS};font-size:12px;color:${BRAND.textMuted};">${escapeHtml(options.codeNote)}</div>` : ''}
                    </td>
                  </tr>
                </table>`
    : '';

  const outro = options.outro
    ? `
                <p style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:20px;color:${BRAND.textMuted};">${escapeHtml(options.outro)}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(options.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${BRAND.surfaceBase};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BRAND.surfaceBase};font-size:1px;line-height:1px;">${escapeHtml(options.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.surfaceBase};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
            <tr>
              <td style="background-color:${BRAND.primary};background-image:linear-gradient(135deg,#ff8087 0%,${BRAND.primary} 28%,${BRAND.primaryStrong} 55%,#cf0a14 78%,#8f050d 100%);border-radius:16px 16px 0 0;padding:28px 32px;">
                <div style="font-family:${SANS};font-size:26px;line-height:30px;font-weight:700;letter-spacing:0.5px;color:#ffffff;">medbourse</div>
                <div style="margin-top:6px;font-family:${SANS};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.78);">Study &middot; Health &middot; Travel</div>
              </td>
            </tr>
            <tr>
              <td style="background-color:${BRAND.surfaceRaised};border:1px solid ${BRAND.borderDefault};border-top:0;border-radius:0 0 16px 16px;padding:32px;">
                <div style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.secondary};">${escapeHtml(options.eyebrow)}</div>
                <h1 style="margin:10px 0 16px;font-family:${SANS};font-size:22px;line-height:30px;font-weight:600;color:${BRAND.textPrimary};">${escapeHtml(options.heading)}</h1>
                <p style="margin:0;font-family:${SANS};font-size:15px;line-height:24px;color:${BRAND.textSecondary};">${escapeHtml(options.intro)}</p>${codeBlock}${outro}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 8px 0;">
                <div style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.primaryStrong};">medbourse</div>
                <div style="margin-top:8px;font-family:${SANS};font-size:12px;line-height:18px;color:${BRAND.textMuted};">This is an automated message &mdash; please do not reply.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}
