import { Decimal } from 'decimal.js';
import { AppError } from './errors/AppError.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const AMOUNT_INPUT = /^\d+(\.\d{1,4})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export function normalizeAmount(raw: string): string {
  if (!AMOUNT_INPUT.test(raw.trim())) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be a positive decimal string');
  }
  const value = new Decimal(raw);
  if (!value.isFinite() || value.lte(0)) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be a positive decimal string');
  }
  return value.toFixed(2);
}

export function normalizeCurrency(raw: string): string {
  const currency = raw.trim().toUpperCase();
  if (!CURRENCY.test(currency)) {
    throw new AppError(400, 'INVALID_CURRENCY', 'Currency must be a 3-letter ISO code');
  }
  return currency;
}
