import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import {
  PAYMENT_METHODS,
  paymentMethodProfile,
  type PaymentIdentifierType,
  type PaymentMethod,
  type PublicPaymentAccount,
  type PublicPaymentIdentifier,
} from '@medbourse/shared';

/** One identifier value of a receiving account, e.g. its `iban` or its `phone`. */
export interface PaymentIdentifierFields {
  key: string;
  value: string;
}

/**
 * A receiving account is a rail (method), the profile of that rail, and the identifier
 * values the money is sent to — a bank transfer carries an IBAN, a mobile wallet a phone
 * number, a crypto rail an address and a network. The shared payment library decides
 * which keys are allowed and which are required for the chosen profile.
 */
export interface PaymentAccountFields {
  customerCountryCode: string | null;
  currency: string;
  method: PaymentMethod;
  profile: string;
  label: string;
  beneficiaryName: string;
  providerName: string;
  identifiers: PaymentIdentifierFields[];
  referenceHint: string | null;
  notes: string | null;
  /** Lower sorts first when several rails serve the same country and currency. */
  priority: number;
  isActive: boolean;
}

export type PaymentAccountDocument = HydratedDocument<PaymentAccountFields>;

const paymentIdentifierSchema = new mongoose.Schema<PaymentIdentifierFields>(
  {
    key: { type: String, required: true, trim: true, maxlength: 40 },
    value: { type: String, required: true, trim: true, maxlength: 160 },
  },
  { _id: false },
);

const paymentAccountSchema = new mongoose.Schema<PaymentAccountFields>(
  {
    customerCountryCode: { type: String, default: null, uppercase: true, minlength: 2, maxlength: 2 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    method: { type: String, required: true, enum: PAYMENT_METHODS, default: 'bank_transfer' },
    profile: { type: String, required: true, trim: true, maxlength: 40, default: 'iban' },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    beneficiaryName: { type: String, required: true, trim: true, maxlength: 160 },
    providerName: { type: String, default: '', trim: true, maxlength: 160 },
    identifiers: { type: [paymentIdentifierSchema], default: [] },
    referenceHint: { type: String, default: null, trim: true, maxlength: 200 },
    notes: { type: String, default: null, trim: true, maxlength: 800 },
    priority: { type: Number, default: 0, min: 0, max: 999 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** A country-specific account beats the shared global one; then the lower priority wins. */
export function paymentAccountSpecificity(account: PaymentAccountFields): number {
  return account.customerCountryCode ? 1 : 0;
}

function typeOfIdentifier(
  method: string,
  profile: string,
  key: string,
): PaymentIdentifierType {
  const field = paymentMethodProfile(method, profile)?.fields.find((entry) => entry.key === key);
  return field?.type ?? 'text';
}

function toPublicIdentifier(
  method: string,
  profile: string,
  identifier: PaymentIdentifierFields,
): PublicPaymentIdentifier {
  return {
    key: identifier.key,
    type: typeOfIdentifier(method, profile, identifier.key),
    value: identifier.value,
  };
}

export function toPublicPaymentAccount(doc: PaymentAccountDocument): PublicPaymentAccount {
  return {
    id: doc._id.toString(),
    customerCountryCode: doc.customerCountryCode,
    currency: doc.currency,
    method: doc.method,
    profile: doc.profile,
    label: doc.label,
    beneficiaryName: doc.beneficiaryName,
    providerName: doc.providerName,
    identifiers: (doc.identifiers ?? []).map((identifier) =>
      toPublicIdentifier(doc.method, doc.profile, identifier),
    ),
    referenceHint: doc.referenceHint,
    notes: doc.notes,
    priority: doc.priority,
    isActive: doc.isActive,
  };
}

/**
 * The last four characters of the account's primary identifier — the first field its
 * profile asks for — so an audit entry can name an account without storing the full
 * IBAN, phone number or wallet address.
 */
export function accountTail(account: {
  method: string;
  profile: string;
  identifiers: PaymentIdentifierFields[];
}): string | null {
  const identifiers = account.identifiers ?? [];
  const primaryKey = paymentMethodProfile(account.method, account.profile)?.fields[0]?.key;
  const primary = primaryKey
    ? identifiers.find((entry) => entry.key === primaryKey)
    : undefined;
  const value = primary?.value ?? identifiers[0]?.value;
  return value ? value.slice(-4) : null;
}

export const PaymentAccount: Model<PaymentAccountFields> =
  mongoose.models.PaymentAccount ??
  mongoose.model<PaymentAccountFields>('PaymentAccount', paymentAccountSchema);
