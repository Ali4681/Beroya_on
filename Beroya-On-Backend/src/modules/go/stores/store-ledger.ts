import { GoLedgerDirection, GoStore, GoStoreLedgerType, Prisma } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { dayKey, dayRange } from '../incentives/time.util';

export const STORE_TZ = 'Asia/Damascus';

export const money = (value: Prisma.Decimal | string | number | null | undefined) =>
  value == null ? null : new Prisma.Decimal(value).toFixed(2);

export function todayRange(now = new Date()) {
  return dayRange(dayKey(now, STORE_TZ), STORE_TZ);
}

/** Row-locks the store for the rest of the transaction; every balance change goes through here. */
export async function lockStore(tx: Prisma.TransactionClient, storeId: string): Promise<GoStore> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM go_stores WHERE id = ${storeId} FOR UPDATE`;
  if (rows.length === 0) throw new GoException(GoErrorCode.NOT_FOUND, 'Store not found');
  return tx.goStore.findUniqueOrThrow({ where: { id: storeId } });
}

export interface StoreMovement {
  type: GoStoreLedgerType;
  direction: GoLedgerDirection;
  amount: Prisma.Decimal;
  reference: string;
  performedById: string;
  driverId?: string;
  walletTransactionId?: string;
  reversedEntryId?: string;
  idempotencyKey?: string;
  requestHash?: string;
  externalReference?: string;
  note?: string;
}

/**
 * Moves the balance of a store locked with `lockStore` and appends the matching ledger row.
 * Never lets the balance go below zero (the DB CHECK is the second line of defence).
 */
export async function applyStoreMovement(tx: Prisma.TransactionClient, store: GoStore, m: StoreMovement) {
  if (m.amount.lte(0)) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'amount must be greater than zero');
  const before = new Prisma.Decimal(store.balance);
  const after = m.direction === GoLedgerDirection.CREDIT ? before.plus(m.amount) : before.minus(m.amount);
  if (after.lt(0)) {
    throw new GoException(GoErrorCode.STORE_BALANCE_INSUFFICIENT, 'Insufficient store balance', {
      available: before.toFixed(2),
      requested: m.amount.toFixed(2),
    });
  }
  await tx.goStore.update({ where: { id: store.id }, data: { balance: after } });
  return tx.goStoreLedgerEntry.create({
    data: {
      reference: m.reference,
      store_id: store.id,
      type: m.type,
      direction: m.direction,
      amount: m.amount,
      currency: store.currency,
      balance_before: before,
      balance_after: after,
      driver_id: m.driverId,
      wallet_transaction_id: m.walletTransactionId,
      reversed_entry_id: m.reversedEntryId,
      idempotency_key: m.idempotencyKey,
      request_hash: m.requestHash,
      external_reference: m.externalReference,
      note: m.note,
      performed_by_id: m.performedById,
      // Taken while the store row is locked, so per-store order matches the balance chain.
      created_at: new Date(),
    },
  });
}

export function isUniqueViolation(err: unknown, field?: string) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  if (!field) return true;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes(field) || text === '';
}
