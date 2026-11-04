import { randomInt } from 'node:crypto';
import { AppError } from '../errors/AppError.js';
import {
  VerificationCode,
  type SignupPayload,
  type VerificationCodeRecord,
  type VerificationPurpose,
} from '../models/VerificationCode.js';

export const CODE_TTL_MINUTES = 10;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

/** Six digits, zero padded, drawn from a cryptographic source. */
function generateCode(): string {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(6, '0');
}

/** Issues (and replaces) the single active code for an email and purpose. Returns the code to email. */
export async function issueCode(params: {
  email: string;
  purpose: VerificationPurpose;
  payload?: SignupPayload | null;
}): Promise<string> {
  const code = generateCode();
  await VerificationCode.findOneAndUpdate(
    { email: params.email, purpose: params.purpose },
    {
      $set: {
        code,
        payload: params.payload ?? null,
        attempts: 0,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
        consumedAt: null,
      },
    },
    { upsert: true },
  ).exec();
  return code;
}

/**
 * Validates a code and consumes it. Wrong codes burn one of a small number of
 * attempts so a six-digit space cannot be brute-forced.
 */
export async function consumeCode(params: {
  email: string;
  purpose: VerificationPurpose;
  code: string;
}): Promise<VerificationCodeRecord> {
  const record = await VerificationCode.findOne({
    email: params.email,
    purpose: params.purpose,
  }).exec();

  if (!record || record.consumedAt) {
    throw new AppError(400, 'CODE_NOT_FOUND', 'No active code for this email');
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    await record.deleteOne();
    throw new AppError(400, 'CODE_EXPIRED', 'The code has expired, request a new one');
  }
  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    await record.deleteOne();
    throw new AppError(429, 'CODE_TOO_MANY_ATTEMPTS', 'Too many attempts, request a new code');
  }
  if (record.code !== params.code) {
    record.attempts += 1;
    await record.save();
    throw new AppError(400, 'CODE_INVALID', 'The code is incorrect');
  }

  record.consumedAt = new Date();
  await record.save();
  return record;
}
