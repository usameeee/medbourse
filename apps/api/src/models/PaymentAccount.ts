import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PaymentMethod, PublicPaymentAccount } from '@medbourse/shared';

export interface PaymentAccountFields {
  customerCountryCode: string | null;
  currency: string;
  method: PaymentMethod;
  label: string;
  beneficiaryName: string;
  bankName: string;
  iban: string;
  swiftBic: string | null;
  referenceHint: string | null;
  notes: string | null;
  isActive: boolean;
}

export type PaymentAccountDocument = HydratedDocument<PaymentAccountFields>;

const paymentAccountSchema = new mongoose.Schema<PaymentAccountFields>(
  {
    customerCountryCode: { type: String, default: null, uppercase: true, minlength: 2, maxlength: 2 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    method: { type: String, required: true, default: 'bank_transfer' },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    beneficiaryName: { type: String, required: true, trim: true, maxlength: 160 },
    bankName: { type: String, required: true, trim: true, maxlength: 160 },
    iban: { type: String, required: true, uppercase: true, maxlength: 34 },
    swiftBic: { type: String, default: null, uppercase: true, maxlength: 11 },
    referenceHint: { type: String, default: null, trim: true, maxlength: 200 },
    notes: { type: String, default: null, trim: true, maxlength: 800 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export function paymentAccountSpecificity(account: PaymentAccountFields): number {
  return account.customerCountryCode ? 1 : 0;
}

export function toPublicPaymentAccount(doc: PaymentAccountDocument): PublicPaymentAccount {
  return {
    id: doc._id.toString(),
    customerCountryCode: doc.customerCountryCode,
    bankName: doc.bankName,
    beneficiaryName: doc.beneficiaryName,
    currency: doc.currency,
    iban: doc.iban,
    isActive: doc.isActive,
    label: doc.label,
    method: doc.method,
    notes: doc.notes,
    referenceHint: doc.referenceHint,
    swiftBic: doc.swiftBic,
  };
}

export function ibanTail(iban: string): string {
  return iban.slice(-4);
}

export const PaymentAccount: Model<PaymentAccountFields> =
  mongoose.models.PaymentAccount ??
  mongoose.model<PaymentAccountFields>('PaymentAccount', paymentAccountSchema);
