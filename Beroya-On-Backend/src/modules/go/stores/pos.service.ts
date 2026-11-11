import { Injectable } from '@nestjs/common';
import { GoLedgerDirection, GoRole, GoStoreLedgerType, GoStoreStatus, Prisma } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { WalletService } from '../wallets/wallet.service';
import { DriverLookupDto, PosRechargeDto, PosTransactionsQueryDto } from './dto/stores.dto';
import { applyStoreMovement, isUniqueViolation, lockStore, money, todayRange } from './store-ledger';
import { maskPhone, newReference, parseAmount, parsePhone, rechargeRequestHash } from './store-money';
import { StoresService } from './stores.service';

const LOOKUP_LIMIT_PER_MINUTE = 20;

const RECEIPT_INCLUDE = {
  store: { select: { code: true, name: true, address: true, mobile_number: true, currency: true } },
  driver: { select: { user: { select: { full_name: true, phone: true } } } },
  performed_by: { select: { full_name: true } },
  reversal: { select: { reference: true, created_at: true } },
} satisfies Prisma.GoStoreLedgerEntryInclude;

type ReceiptRow = Prisma.GoStoreLedgerEntryGetPayload<{ include: typeof RECEIPT_INCLUDE }>;

/** What the store sees: no driver wallet balance, no due, masked phone, explicit zero fee/commission. */
export function receiptView(e: ReceiptRow) {
  return {
    reference: e.reference,
    status: e.reversal ? 'REVERSED' : 'COMPLETED',
    reversed_at: e.reversal?.created_at ?? null,
    created_at: e.created_at,
    amount: money(e.amount),
    currency: e.currency,
    fees: '0.00',
    commission: '0.00',
    driver_wallet_credit: money(e.amount),
    store_debit: money(e.amount),
    driver: { full_name: e.driver?.user.full_name ?? null, mobile_masked: maskPhone(e.driver?.user.phone) },
    store: { code: e.store.code, name: e.store.name, address: e.store.address, mobile_number: e.store.mobile_number },
    operator: { full_name: e.performed_by.full_name },
    store_balance_before: money(e.balance_before),
    store_balance_after: money(e.balance_after),
  };
}

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: LockService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly wallets: WalletService,
    private readonly stores: StoresService,
  ) {}

  /** The store comes from the operator's own account row — never from the request. */
  private async operatorStore(user: AuthUser) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        role: true,
        full_name: true,
        is_active: true,
        store: { include: { branch: { select: { id: true, code: true, name_ar: true, name_en: true } } } },
      },
    });
    if (!account || account.role !== GoRole.STORE_OPERATOR || !account.store) {
      throw new GoException(GoErrorCode.STORE_ACCOUNT_NOT_LINKED, 'Account is not linked to a store');
    }
    if (!account.is_active) throw new GoException(GoErrorCode.ACCOUNT_DISABLED, 'Account is disabled');
    return { operator: account, store: account.store };
  }

  private findDriverByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone_role: { phone, role: GoRole.DRIVER } },
      select: {
        id: true,
        full_name: true,
        phone: true,
        is_active: true,
        deleted_at: true,
        driverProfile: { select: { id: true, is_suspended: true, branch_id: true } },
      },
    });
  }

  private blockReasons(driver: NonNullable<Awaited<ReturnType<PosService['findDriverByPhone']>>>) {
    const reasons: string[] = [];
    if (!driver.driverProfile) reasons.push('NO_DRIVER_PROFILE');
    if (!driver.is_active) reasons.push('ACCOUNT_DISABLED');
    if (driver.deleted_at) reasons.push('ACCOUNT_DELETED');
    if (driver.driverProfile?.is_suspended) reasons.push('DRIVER_SUSPENDED');
    return reasons;
  }

  async me(user: AuthUser) {
    const { operator, store } = await this.operatorStore(user);
    const today = todayRange();
    const base = { store_id: store.id, type: GoStoreLedgerType.DRIVER_RECHARGE_DEBIT, created_at: { gte: today.from } };
    const [all, mine, config] = await Promise.all([
      this.prisma.goStoreLedgerEntry.aggregate({ where: base, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.goStoreLedgerEntry.aggregate({
        where: { ...base, performed_by_id: operator.id },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.wallets.getConfig(),
    ]);
    const balance = new Prisma.Decimal(store.balance);
    return {
      operator: { id: operator.id, full_name: operator.full_name },
      store: {
        id: store.id,
        code: store.code,
        name: store.name,
        address: store.address,
        branch: store.branch,
        status: store.status,
        balance: money(balance),
        currency: store.currency,
        low_balance_threshold: money(store.low_balance_threshold),
        is_low_balance: balance.lte(store.low_balance_threshold),
        max_recharge_amount: money(store.max_recharge_amount),
      },
      today: {
        recharges: all._count._all,
        amount: money(all._sum.amount ?? 0),
        my_recharges: mine._count._all,
        my_amount: money(mine._sum.amount ?? 0),
      },
      fees: '0.00',
      commission: '0.00',
      minimum_first_recharge: money(config.minimum_initial_topup),
    };
  }

  async lookup(user: AuthUser, dto: DriverLookupDto) {
    const { store } = await this.operatorStore(user);
    const attempts = await this.redis.incr(`pos:lookup:${user.id}`, 60);
    if (attempts > LOOKUP_LIMIT_PER_MINUTE) {
      throw new GoException(GoErrorCode.RATE_LIMITED, 'Too many lookups, wait a minute');
    }
    const phone = parsePhone(dto.mobile_number);
    const driver = await this.findDriverByPhone(phone);
    if (!driver) throw new GoException(GoErrorCode.NOT_FOUND, 'No driver with this mobile number');
    const reasons = this.blockReasons(driver);
    const [prior, config] = await Promise.all([
      driver.driverProfile ? this.wallets.priorCreditCount(driver.driverProfile.id) : Promise.resolve(0),
      this.wallets.getConfig(),
    ]);
    return {
      driver: { full_name: driver.full_name, mobile_masked: maskPhone(driver.phone) },
      rechargeable: reasons.length === 0 && store.status === GoStoreStatus.ACTIVE,
      reasons: store.status === GoStoreStatus.ACTIVE ? reasons : [...reasons, 'STORE_SUSPENDED'],
      first_recharge: prior === 0,
      minimum_amount: prior === 0 ? money(config.minimum_initial_topup) : null,
      max_amount: money(store.max_recharge_amount),
      store_balance: money(store.balance),
      currency: store.currency,
      fees: '0.00',
      commission: '0.00',
    };
  }

  private async loadReceipt(storeId: string, where: Prisma.GoStoreLedgerEntryWhereUniqueInput) {
    const row = await this.prisma.goStoreLedgerEntry.findUnique({ where, include: RECEIPT_INCLUDE });
    if (!row || row.store_id !== storeId || row.type !== GoStoreLedgerType.DRIVER_RECHARGE_DEBIT) return null;
    return row;
  }

  /**
   * Atomic recharge: store row lock → checks → driver wallet credit (POS_RECHARGE) → store debit + ledger row → audit,
   * all in one DB transaction under the driver's wallet lock. Success is returned only after commit.
   */
  async recharge(user: AuthUser, dto: PosRechargeDto, idempotencyKey: string | undefined) {
    if (!idempotencyKey) throw new GoException(GoErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    const { operator, store } = await this.operatorStore(user);
    const currency = dto.currency.trim().toUpperCase();
    if (currency !== store.currency) {
      throw new GoException(GoErrorCode.CURRENCY_MISMATCH, 'Currency does not match the store currency', {
        expected: store.currency,
      });
    }
    const amount = parseAmount(dto.amount);
    const phone = parsePhone(dto.mobile_number);
    const hash = rechargeRequestHash({ mobile_number: phone, amount, currency });

    const replay = await this.replayOrReject(store.id, idempotencyKey, hash);
    if (replay) return { ...receiptView(replay), replayed: true };

    if (store.status !== GoStoreStatus.ACTIVE) {
      throw new GoException(GoErrorCode.STORE_SUSPENDED, 'Store is suspended');
    }
    const driver = await this.findDriverByPhone(phone);
    if (!driver) throw new GoException(GoErrorCode.NOT_FOUND, 'No driver with this mobile number');
    const reasons = this.blockReasons(driver);
    if (reasons.length || !driver.driverProfile) {
      throw new GoException(GoErrorCode.DRIVER_NOT_RECHARGEABLE, 'Driver cannot be recharged', { reasons });
    }
    const driverId = driver.driverProfile.id;
    const config = await this.wallets.getConfig();
    const reference = newReference('PR');

    let entryId: string;
    try {
      entryId = await this.locks.withLock(
        `wallet:${driverId}`,
        () =>
          this.prisma.$transaction(async (tx) => {
            const locked = await lockStore(tx, store.id);
            const dup = await tx.goStoreLedgerEntry.findUnique({
              where: { store_id_idempotency_key: { store_id: store.id, idempotency_key: idempotencyKey } },
              select: { id: true, request_hash: true },
            });
            if (dup) {
              if (dup.request_hash !== hash) {
                throw new GoException(GoErrorCode.IDEMPOTENCY_KEY_REUSED, 'Idempotency-Key was used with a different request');
              }
              return dup.id;
            }
            if (locked.status !== GoStoreStatus.ACTIVE) {
              throw new GoException(GoErrorCode.STORE_SUSPENDED, 'Store is suspended');
            }
            if (locked.max_recharge_amount && amount.gt(locked.max_recharge_amount)) {
              throw new GoException(GoErrorCode.RECHARGE_LIMIT_EXCEEDED, 'Amount exceeds the per-recharge limit', {
                limit: money(locked.max_recharge_amount),
              });
            }
            if (amount.gt(locked.balance)) {
              throw new GoException(GoErrorCode.STORE_BALANCE_INSUFFICIENT, 'Insufficient store balance', {
                available: money(locked.balance),
                requested: amount.toFixed(2),
              });
            }
            const prior = await this.wallets.priorCreditCount(driverId, tx);
            if (prior === 0 && amount.lt(config.minimum_initial_topup)) {
              throw new GoException(GoErrorCode.RECHARGE_BELOW_MINIMUM, 'First top-up is below the minimum', {
                minimum: money(config.minimum_initial_topup),
              });
            }

            const credit = await this.wallets.creditPosRecharge(tx, {
              driverId,
              amount,
              reason: `pos-recharge; store=${locked.code}; ref=${reference}`,
              createdById: operator.id,
            });
            const entry = await applyStoreMovement(tx, locked, {
              type: GoStoreLedgerType.DRIVER_RECHARGE_DEBIT,
              direction: GoLedgerDirection.DEBIT,
              amount,
              reference,
              performedById: operator.id,
              driverId,
              walletTransactionId: credit.row.id,
              idempotencyKey,
              requestHash: hash,
            });
            await this.audit.log(
              {
                actor: user,
                action: AuditAction.STORE_DRIVER_RECHARGED,
                entity_type: 'GoStore',
                entity_id: locked.id,
                branch_id: locked.branch_id,
                metadata: {
                  reference,
                  amount: amount.toFixed(2),
                  currency: locked.currency,
                  driver_id: driverId,
                  wallet_transaction_id: credit.row.id,
                  store_balance_before: money(entry.balance_before),
                  store_balance_after: money(entry.balance_after),
                },
              },
              tx,
            );
            return entry.id;
          }),
        { waitMs: 5000, ttlMs: 20_000 },
      );
    } catch (err) {
      // A parallel request with the same key committed first: answer with its receipt.
      if (isUniqueViolation(err, 'idempotency_key')) {
        const again = await this.replayOrReject(store.id, idempotencyKey, hash);
        if (again) return { ...receiptView(again), replayed: true };
      }
      throw err;
    }

    const receipt = await this.loadReceipt(store.id, { id: entryId });
    if (!receipt) throw new GoException(GoErrorCode.INTERNAL_ERROR, 'Recharge committed but receipt not found');
    const replayed = receipt.reference !== reference;
    if (!replayed) {
      await this.stores.notifyDriver(driverId, driver.id, 'wallet.pos_recharge', {
        reference,
        amount: Number(amount),
        currency: store.currency,
        store_name: store.name,
      });
    }
    return { ...receiptView(receipt), replayed };
  }

  private async replayOrReject(storeId: string, key: string, hash: string) {
    const prior = await this.prisma.goStoreLedgerEntry.findUnique({
      where: { store_id_idempotency_key: { store_id: storeId, idempotency_key: key } },
      include: RECEIPT_INCLUDE,
    });
    if (!prior) return null;
    if (prior.request_hash !== hash || prior.type !== GoStoreLedgerType.DRIVER_RECHARGE_DEBIT) {
      throw new GoException(GoErrorCode.IDEMPOTENCY_KEY_REUSED, 'Idempotency-Key was used with a different request');
    }
    return prior;
  }

  async transactions(user: AuthUser, q: PosTransactionsQueryDto) {
    const { store } = await this.operatorStore(user);
    const where: Prisma.GoStoreLedgerEntryWhereInput = {
      store_id: store.id,
      type: GoStoreLedgerType.DRIVER_RECHARGE_DEBIT,
    };
    if (q.from || q.to) {
      where.created_at = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };
    }
    if (q.reference) where.reference = { contains: q.reference.trim().toUpperCase() };
    if (q.amount) where.amount = parseAmount(q.amount);
    if (q.mobile_number) where.driver = { user: { phone: parsePhone(q.mobile_number) } };
    if (q.status === 'COMPLETED') where.reversal = { is: null };
    if (q.status === 'REVERSED') where.reversal = { isNot: null };
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const [rows, total, sum] = await Promise.all([
      this.prisma.goStoreLedgerEntry.findMany({
        where,
        include: RECEIPT_INCLUDE,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...pageSkip(page, limit),
      }),
      this.prisma.goStoreLedgerEntry.count({ where }),
      this.prisma.goStoreLedgerEntry.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      data: rows.map(receiptView),
      total,
      total_amount: money(sum._sum.amount ?? 0),
      page,
      limit,
    };
  }

  async receipt(user: AuthUser, reference: string) {
    const { store } = await this.operatorStore(user);
    const row = await this.loadReceipt(store.id, { reference: reference.trim().toUpperCase() });
    if (!row) throw new GoException(GoErrorCode.NOT_FOUND, 'Transaction not found');
    return receiptView(row);
  }
}
