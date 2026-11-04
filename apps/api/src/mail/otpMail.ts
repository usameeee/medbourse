import { CODE_TTL_MINUTES } from '../services/verificationCodes.js';
import { renderBrandedEmail } from './emailLayout.js';
import { sendMail } from './mailer.js';

/** Emails the six-digit code that finishes a new account registration. */
export async function sendSignupCode(to: string, code: string): Promise<void> {
  await sendMail({
    to,
    subject: 'MEDBOURSE: verify your email address',
    text: [
      `Your MEDBOURSE verification code is ${code}.`,
      `It expires in ${CODE_TTL_MINUTES} minutes.`,
      'If you did not request this, you can ignore this message.',
    ].join('\n'),
    html: renderBrandedEmail({
      preheader: `Your MEDBOURSE verification code is ${code} — it expires in ${CODE_TTL_MINUTES} minutes.`,
      eyebrow: 'Account verification',
      heading: 'Confirm your email address',
      intro: 'Use the code below to finish creating your MEDBOURSE account.',
      code,
      codeLabel: 'Verification code',
      codeNote: `Expires in ${CODE_TTL_MINUTES} minutes.`,
      outro: 'If you did not request this, you can safely ignore this message.',
    }),
  });
}

/** Emails the six-digit code that authorises a password reset. */
export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  await sendMail({
    to,
    subject: 'MEDBOURSE: password reset code',
    text: [
      `Your MEDBOURSE password reset code is ${code}.`,
      `It expires in ${CODE_TTL_MINUTES} minutes.`,
      'If you did not request this, you can ignore this message.',
    ].join('\n'),
    html: renderBrandedEmail({
      preheader: `Your MEDBOURSE password reset code is ${code} — it expires in ${CODE_TTL_MINUTES} minutes.`,
      eyebrow: 'Password reset',
      heading: 'Reset your password',
      intro: 'Enter this code to choose a new password. All other signed-in devices are signed out once it is used.',
      code,
      codeLabel: 'Reset code',
      codeNote: `Expires in ${CODE_TTL_MINUTES} minutes.`,
      outro: 'If you did not request this, ignore this message — your password will not change.',
    }),
  });
}
