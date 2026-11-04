import {
  paymentMethodProfile,
  type PaymentIdentifierType,
  type PaymentMethod,
} from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { normalizeCurrency } from '../money.js';
import {
  PaymentAccount,
  paymentAccountSpecificity,
  type PaymentAccountDocument,
  type PaymentIdentifierFields,
} from '../models/PaymentAccount.js';
import type { QuotationDocument } from '../models/Quotation.js';

const IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
const SWIFT = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
const ACCOUNT_NUMBER = /^[0-9A-Za-z][0-9A-Za-z\s-]{3,33}$/;
const BANK_CODE = /^[0-9A-Za-z][0-9A-Za-z\s-]{1,19}$/;
const PHONE = /^\+?[0-9(][0-9\s()+-]*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HANDLE = /^[0-9A-Za-z][0-9A-Za-z._@+-]{2,63}$/;
const CRYPTO_ADDRESS = /^[0-9A-Za-z:_-]{20,120}$/;

function invalid(type: PaymentIdentifierType, field: string, expected: string): AppError {
  return new AppError(
    400,
    `INVALID_${type.toUpperCase()}`,
    `Invalid ${field}: ${expected}`,
    { field },
  );
}

/** IBANs are stored compact and upper case so two spellings never become two accounts. */
export function normalizeIban(raw: string): string {
  const iban = raw.replace(/[\s-]+/g, '').toUpperCase();
  if (!IBAN.test(iban)) {
    throw invalid('iban', 'iban', 'a valid alphanumeric account identifier');
  }
  return iban;
}

export function normalizeSwiftBic(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  return normalizeSwiftBicValue(raw);
}

function normalizeSwiftBicValue(raw: string): string {
  const swift = raw.replace(/\s+/g, '').toUpperCase();
  if (!SWIFT.test(swift)) {
    throw invalid('swift_bic', 'swiftBic', '8 or 11 characters');
  }
  return swift;
}

/** Phone-style: an international prefix, digits and separators only. */
export function normalizePhone(raw: string): string {
  const phone = raw.trim().replace(/\s+/g, ' ');
  if (!PHONE.test(phone) || phone.replace(/\D/g, '').length < 4) {
    throw invalid('phone', 'phone', 'a phone number in international format');
  }
  return phone;
}

/**
 * Normalizes one identifier value by the type its registry field declares. The type —
 * not the rail — owns the rule, so a new rail reusing `iban` or `phone` needs no code.
 */
export function normalizeIdentifierValue(input: {
  key: string;
  type: PaymentIdentifierType;
  value: string;
}): string {
  const { key, type } = input;
  const raw = input.value;
  switch (type) {
    case 'iban':
      return normalizeIban(raw);
    case 'swift_bic':
      return normalizeSwiftBicValue(raw);
    case 'phone':
      return normalizePhone(raw);
    case 'account_number': {
      const account = raw.trim().replace(/\s+/g, ' ');
      if (!ACCOUNT_NUMBER.test(account)) {
        throw invalid(type, key, 'a domestic account number');
      }
      return account;
    }
    case 'bank_code': {
      const code = raw.replace(/\s+/g, '').toUpperCase();
      if (!BANK_CODE.test(code)) {
        throw invalid(type, key, 'a bank, sort, routing or branch code');
      }
      return code;
    }
    case 'email': {
      const email = raw.trim();
      if (!EMAIL.test(email)) {
        throw invalid(type, key, 'an email address');
      }
      return email;
    }
    case 'handle': {
      const handle = raw.trim();
      if (!HANDLE.test(handle)) {
        throw invalid(type, key, 'an account handle such as name@bank');
      }
      return handle;
    }
    case 'url': {
      const url = raw.trim();
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw invalid(type, key, 'a payment link starting with https://');
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw invalid(type, key, 'a payment link starting with https://');
      }
      return parsed.toString();
    }
    case 'crypto_address': {
      // Case matters for base58 and bech32 addresses, so the value is kept verbatim.
      const address = raw.trim();
      if (!CRYPTO_ADDRESS.test(address)) {
        throw invalid(type, key, 'a wallet address');
      }
      return address;
    }
    case 'text': {
      const text = raw.trim().replace(/\s+/g, ' ');
      if (text.length < 2 || text.length > 120) {
        throw invalid(type, key, 'between 2 and 120 characters');
      }
      return text;
    }
  }
}

/**
 * Validates the identifiers a caller sent against the shared payment library: every
 * required field of the profile must be filled, nothing else is accepted, and each value
 * is normalized by its type. Returns the profile-ordered, normalized identifier set — so
 * an account can never be stored in a state it cannot actually be paid into.
 */
export function assertPaymentIdentifiers(input: {
  method: PaymentMethod;
  profile: string;
  identifiers: PaymentIdentifierFields[];
}): PaymentIdentifierFields[] {
  const profile = paymentMethodProfile(input.method, input.profile);
  if (!profile) {
    throw new AppError(
      400,
      'UNKNOWN_PAYMENT_PROFILE',
      `Payment method ${input.method} has no profile ${input.profile}`,
      { method: input.method, profile: input.profile },
    );
  }
  const provided = new Map<string, string>();
  for (const identifier of input.identifiers) {
    const key = identifier.key.trim();
    if (key && !provided.has(key)) {
      provided.set(key, identifier.value);
    }
  }
  const known = new Set(profile.fields.map((field) => field.key));
  const unknown = [...provided.keys()].filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new AppError(
      400,
      'UNKNOWN_PAYMENT_IDENTIFIER',
      'The payment profile does not accept these identifiers',
      { fields: unknown, method: input.method, profile: profile.id },
    );
  }
  return profile.fields.flatMap((field) => {
    const raw = provided.get(field.key)?.trim();
    if (!raw) {
      if (field.required) {
        throw new AppError(
          400,
          'PAYMENT_IDENTIFIER_REQUIRED',
          `Payment method ${input.method} needs ${field.key}`,
          { field: field.key, method: input.method, profile: profile.id },
        );
      }
      return [];
    }
    return [
      { key: field.key, value: normalizeIdentifierValue({ key: field.key, type: field.type, value: raw }) },
    ];
  });
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

/**
 * Every account a country/currency pair can be paid into, best first: a country-specific
 * account beats the shared global one, then the lower `priority` wins, then the newest.
 * More than one is normal — a country can be served by a bank transfer and a mobile
 * wallet at once, and the customer picks the one that suits them.
 */
export async function resolvePaymentAccounts(input: {
  countryCode: string;
  currency: string;
}): Promise<PaymentAccountDocument[]> {
  const currency = normalizeCurrency(input.currency);
  const accounts = await PaymentAccount.find({ isActive: true, currency })
    .sort({ priority: 1, createdAt: -1 })
    .exec();
  return accounts
    .filter((account) => paymentAccountMatches(account, input.countryCode, currency))
    .sort((a, b) => paymentAccountSpecificity(b) - paymentAccountSpecificity(a));
}

/** The account to present first when the caller has not chosen one. */
export async function resolvePaymentAccount(input: {
  countryCode: string;
  currency: string;
}): Promise<PaymentAccountDocument> {
  const [best] = await resolvePaymentAccounts(input);
  if (!best) {
    throw new AppError(404, 'NO_PAYMENT_ACCOUNT', 'No payment account matches this currency');
  }
  return best;
}

export async function resolvePaymentAccountsForQuotation(
  quotation: QuotationDocument,
): Promise<PaymentAccountDocument[]> {
  return resolvePaymentAccounts({
    countryCode: quotation.snapshot.customerCountryCode,
    currency: quotation.currency,
  });
}
