import { AppError } from '../errors/AppError.js';
import { normalizeCurrency } from '../money.js';
import {
  PaymentAccount,
  paymentAccountSpecificity,
  type PaymentAccountDocument,
} from '../models/PaymentAccount.js';
import type { QuotationDocument } from '../models/Quotation.js';

const IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
const SWIFT = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export function normalizeIban(raw: string): string {
  const iban = raw.replace(/[\s-]+/g, '').toUpperCase();
  if (!IBAN.test(iban)) {
    throw new AppError(400, 'INVALID_IBAN', 'IBAN must be a valid alphanumeric account identifier');
  }
  return iban;
}

export function normalizeSwiftBic(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  const swift = raw.replace(/\s+/g, '').toUpperCase();
  if (!SWIFT.test(swift)) {
    throw new AppError(400, 'INVALID_SWIFT', 'SWIFT/BIC must be 8 or 11 characters');
  }
  return swift;
}

export function paymentAccountMatches(
  account: { customerCountryCode: string | null; currency: string; isActive: boolean },
  countryCode: string,
  currency: string,
): boolean {
  if (!account.isActive) {
    return false;
  }
  if (account.currency !== currency) {
    return false;
  }
  if (account.customerCountryCode && account.customerCountryCode !== countryCode) {
    return false;
  }
  return true;
}

export async function resolvePaymentAccountForQuotation(
  quotation: QuotationDocument,
): Promise<PaymentAccountDocument> {
  const currency = normalizeCurrency(quotation.currency);
  const countryCode = quotation.snapshot.customerCountryCode;
  const accounts = await PaymentAccount.find({ isActive: true, currency }).exec();
  const matches = accounts.filter((account) => paymentAccountMatches(account, countryCode, currency));
  if (matches.length === 0) {
    throw new AppError(404, 'NO_PAYMENT_ACCOUNT', 'No payment account matches this quotation');
  }
  let bestScore = -1;
  const winners: PaymentAccountDocument[] = [];
  for (const account of matches) {
    const score = paymentAccountSpecificity(account);
    if (score > bestScore) {
      bestScore = score;
      winners.length = 0;
      winners.push(account);
    } else if (score === bestScore) {
      winners.push(account);
    }
  }
  if (winners.length !== 1) {
    throw new AppError(
      409,
      'AMBIGUOUS_PAYMENT_ACCOUNT',
      'Multiple payment accounts match with the same specificity',
    );
  }
  return winners[0]!;
}
