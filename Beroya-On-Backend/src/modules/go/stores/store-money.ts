import { Prisma } from '@/generated/prisma/client';
import { createHash, randomInt } from 'crypto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { E164, normalizeE164 } from '../auth/phone';

/** Positive decimal with at most 2 fraction digits, written as digits (no exponent, no sign). */
export const AMOUNT_PATTERN = /^\d{1,16}(\.\d{1,2})?$/;

/** Largest single store movement. Bounded so Decimal(18,2) can never overflow. */
export const MAX_STORE_AMOUNT = new Prisma.Decimal('1000000000000');

export function parseAmount(value: unknown, field = 'amount'): Prisma.Decimal {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!AMOUNT_PATTERN.test(text)) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, `${field} must be a positive number with at most 2 decimals`);
  }
  const amount = new Prisma.Decimal(text);
  if (amount.lte(0)) throw new GoException(GoErrorCode.VALIDATION_ERROR, `${field} must be greater than zero`);
  if (amount.gt(MAX_STORE_AMOUNT)) throw new GoException(GoErrorCode.VALIDATION_ERROR, `${field} is too large`);
  return amount;
}

export function parsePhone(value: unknown): string {
  const phone = normalizeE164(value);
  if (typeof phone !== 'string' || !E164.test(phone)) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'mobile_number must be a valid mobile number');
  }
  return phone;
}

/** +963912345678 → 0912***678 (Syrian local form when possible). Never returns the full number. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const local = phone.startsWith('+963') ? `0${phone.slice(4)}` : phone;
  if (local.length <= 6) return '*'.repeat(local.length);
  return `${local.slice(0, 4)}${'*'.repeat(Math.max(3, local.length - 7))}${local.slice(-3)}`;
}

// No 0/O/1/I/L: references are read aloud and typed from receipts.
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length: number) {
  let out = '';
  for (let i = 0; i < length; i++) out += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return out;
}

export type ReferencePrefix = 'PR' | 'SC' | 'SA' | 'RV';

/** PR = POS recharge, SC = store credit, SA = store adjustment, RV = recharge reversal. */
export function newReference(prefix: ReferencePrefix): string {
  return `${prefix}-${randomCode(10)}`;
}

export function newStoreCode(): string {
  return `ST-${randomCode(6)}`;
}

/** Binds an idempotency key to one business request; amount is normalised so "5000" and 5000.00 match. */
export function rechargeRequestHash(input: { mobile_number: string; amount: Prisma.Decimal; currency: string }) {
  return createHash('sha256')
    .update(JSON.stringify({ m: input.mobile_number, a: input.amount.toFixed(2), c: input.currency }))
    .digest('hex');
}