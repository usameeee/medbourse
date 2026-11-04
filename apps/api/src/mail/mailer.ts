import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { recordOutboundMail } from './devMail.js';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text alternative; always sent so text-only clients stay readable. */
  text: string;
  /** Branded HTML body; clients that render HTML prefer it over `text`. */
  html?: string;
}

/** Gmail app passwords are shown in groups of four; the spaces are not part of the secret. */
function smtpPassword(): string {
  return config.smtp.pass.replace(/\s+/g, '');
}

/** True when real SMTP credentials are configured outside the test runner. */
export function smtpConfigured(): boolean {
  if (process.env.VITEST === 'true') {
    return false;
  }
  return Boolean(config.smtp.host && config.smtp.user && smtpPassword());
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: smtpPassword() },
  });
  return transport;
}

/**
 * Sends a transactional email through SMTP. When credentials are absent (or under
 * the test runner) the send is skipped and only the intent is recorded, so local
 * development and CI never need a live mailbox. Bodies are never logged.
 *
 * Delivery failures are swallowed after logging: a signup or password reset must
 * not fail because the mail provider is briefly unavailable.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  if (!smtpConfigured()) {
    recordOutboundMail(message.subject, message.to);
    return;
  }
  try {
    await getTransport().sendMail({
      from: config.smtp.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    console.error(`[medbourse-api] mail delivery failed (${message.subject}) to=${message.to} (${name})`);
  }
}
