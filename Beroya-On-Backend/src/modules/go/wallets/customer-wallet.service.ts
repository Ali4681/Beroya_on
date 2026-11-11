import { Injectable } from '@nestjs/common';
import {
  GoPaymentMethod,
  GoRole,
  GoWalletTransactionType,
  GoWalletVoucherStatus,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { normalizeE164 } from '../auth/phone';
import { decimalToNumber } from '../pricing/fare.calculator';
import { maskPhone } from '../stores/store-money';
import { calendarMonthRange } from './wallet-month';
import { settleRideWallet } from './wallet-math';
import { assertValidVoucherCode, normalizeVoucherCode } from './wallet-voucher';

type Db = Prisma.TransactionClient | PrismaService;

export const CUSTOMER_WALLET_CURRENCY = 'SYP';

const MONTH_ADDED_TYPES: GoWalletTransactionType[] = [
  GoWalletTransactionType.TOP_UP,
  GoWalletTransactionType.RIDE_REFUND,
  GoWalletTransactionType.TRANSFER_IN,
];

const MONTH_CONSUMED_TYPES: GoWalletTransactionType[] = [
  GoWalletTransactionType.RIDE_PAYMENT,
  GoWalletTransactionType.TRANSFER_OUT,
];

@Injectable()
export class CustomerWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: LockService,
    private readonly audit: AuditService,
    private readonly branchScope: BranchScopeService,
    private readonly realtime: RealtimeService,
  ) {}

  listForStaff(actor: AuthUser, page = 1, limit = 20, requestedBranch?: string) {
    const branchId = this.branchScope.resolveFilter(actor, requestedBranch);
    return this.prisma.goCustomerWallet.findMany({
      where: branchId ? { customer: { rides: { some: { branch_id: branchId } } } } : {},
      include: {
        customer: {
          select: {
            id: true,
            user: { select: { full_name: true, phone: true } },
          },
        },
      },
      orderBy: { updated_at: 'desc' },
      ...pageSkip(page, limit),
    });
  }

  async ledger(actor: AuthUser, customerId: string, page = 1, limit = 20) {
    await this.assertCustomer(actor, customerId);
    const [wallet, transactions] = await Promise.all([
      this.prisma.goCustomerWallet.findUnique({ where: { customer_id: customerId } }),
      this.prisma.goCustomerWalletTransaction.findMany({
        where: { customer_id: customerId },
        orderBy: { created_at: 'desc' },
        ...pageSkip(page, limit),
      }),
    ]);
    const customer = await this.prisma.goCustomerProfile.findUnique({
      where: { id: customerId },
      select: { id: true, user: { select: { full_name: true, phone: true } } },
    });
    return { customer, wallet, transactions };
  }

  async topUp(actor: AuthUser, customerId: string, amount: number, reason?: string) {
    if (amount <= 0) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'amount must be positive');
    }
    await this.assertCustomer(actor, customerId);
    return this.locks.withLock(`customer-wallet:${customerId}`, async () => {
      const wallet = await this.ensureWallet(customerId);
      const balanceBefore = new Prisma.Decimal(wallet.balance);
      const amountDec = new Prisma.Decimal(amount);
      const balanceAfter = balanceBefore.plus(amountDec);
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.goCustomerWallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        });
        return tx.goCustomerWalletTransaction.create({
          data: {
            wallet_id: wallet.id,
            customer_id: customerId,
            type: GoWalletTransactionType.TOP_UP,
            amount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            reason: reason?.trim() || 'top-up',
            created_by_id: actor.id,
          },
        });
      });
      await this.audit.log({
        actor,
        action: AuditAction.CUSTOMER_WALLET_TOP_UP,
        entity_type: 'GoCustomerWalletTransaction',
        entity_id: updated.id,
        metadata: { customer_id: customerId, amount },
      });
      await this.emitWalletUpdated(customerId);
      return updated;
    });
  }

  async withdraw(actor: AuthUser, customerId: string, amount: number, reason?: string) {
    if (amount <= 0) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'amount must be positive');
    }
    await this.assertCustomer(actor, customerId);
    return this.locks.withLock(`customer-wallet:${customerId}`, async () => {
      const wallet = await this.ensureWallet(customerId);
      const balanceBefore = new Prisma.Decimal(wallet.balance);
      const amountDec = new Prisma.Decimal(amount);
      if (amountDec.gt(balanceBefore)) {
        throw new GoException(GoErrorCode.CONFLICT, 'Withdrawal exceeds available balance');
      }
      const balanceAfter = balanceBefore.minus(amountDec);
      const note = reason?.trim() ? `withdrawal; ${reason.trim()}` : 'withdrawal';
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.goCustomerWallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        });
        return tx.goCustomerWalletTransaction.create({
          data: {
            wallet_id: wallet.id,
            customer_id: customerId,
            type: GoWalletTransactionType.ADJUSTMENT,
            amount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            reason: note,
            created_by_id: actor.id,
          },
        });
      });
      await this.audit.log({
        actor,
        action: AuditAction.CUSTOMER_WALLET_WITHDRAWAL,
        entity_type: 'GoCustomerWalletTransaction',
        entity_id: updated.id,
        metadata: { customer_id: customerId, amount },
      });
      await this.emitWalletUpdated(customerId);
      return updated;
    });
  }

  async getCustomerView(userId: string) {
    const profile = await this.prisma.goCustomerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
    });
    const wallet = await this.ensureWallet(profile.id);
    const month = await this.monthStats(profile.id);
    return {
      balance: decimalToNumber(wallet.balance),
      currency: CUSTOMER_WALLET_CURRENCY,
      month,
    };
  }

  /** Calendar-month activity for Figma «النشاط الشهري» (Asia/Damascus). */
  async monthStats(customerId: string, at: Date = new Date()) {
    const range = calendarMonthRange(at);
    const rows = await this.prisma.goCustomerWalletTransaction.groupBy({
      by: ['type'],
      where: {
        customer_id: customerId,
        created_at: { gte: range.from, lt: range.to },
        type: { in: [...MONTH_ADDED_TYPES, ...MONTH_CONSUMED_TYPES] },
      },
      _sum: { amount: true },
    });
    let added = new Prisma.Decimal(0);
    let consumed = new Prisma.Decimal(0);
    for (const row of rows) {
      const sum = new Prisma.Decimal(row._sum.amount ?? 0);
      if (MONTH_ADDED_TYPES.includes(row.type)) added = added.plus(sum);
      if (MONTH_CONSUMED_TYPES.includes(row.type)) consumed = consumed.plus(sum);
    }
    return {
      year: range.year,
      month: range.month,
      added: decimalToNumber(added),
      consumed: decimalToNumber(consumed),
    };
  }

  /**
   * Redeem a recharge voucher (Figma «شحن الرصيد»).
   * Credits TOP_UP with reason including the code; marks voucher REDEEMED atomically.
   */
  async redeemVoucher(userId: string, rawCode: string) {
    const code = assertValidVoucherCode(rawCode);
    const profile = await this.prisma.goCustomerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
    });
    return this.locks.withLock(`customer-wallet:${profile.id}`, async () => {
      const voucher = await this.prisma.goWalletVoucher.findUnique({ where: { code } });
      if (!voucher || voucher.status === GoWalletVoucherStatus.DISABLED) {
        throw new GoException(GoErrorCode.WALLET_CODE_INVALID, 'Recharge code is invalid');
      }
      if (voucher.status === GoWalletVoucherStatus.REDEEMED) {
        throw new GoException(GoErrorCode.WALLET_CODE_ALREADY_USED, 'Recharge code already used');
      }
      if (
        voucher.status === GoWalletVoucherStatus.EXPIRED ||
        (voucher.expires_at && voucher.expires_at.getTime() <= Date.now())
      ) {
        if (voucher.status === GoWalletVoucherStatus.UNUSED && voucher.expires_at) {
          await this.prisma.goWalletVoucher.update({
            where: { id: voucher.id },
            data: { status: GoWalletVoucherStatus.EXPIRED },
          });
        }
        throw new GoException(GoErrorCode.WALLET_CODE_EXPIRED, 'Recharge code expired');
      }
      if (voucher.status !== GoWalletVoucherStatus.UNUSED) {
        throw new GoException(GoErrorCode.WALLET_CODE_INVALID, 'Recharge code is invalid');
      }
      if (voucher.currency !== CUSTOMER_WALLET_CURRENCY) {
        throw new GoException(GoErrorCode.CURRENCY_MISMATCH, 'Currency does not match');
      }

      const wallet = await this.ensureWallet(profile.id);
      const balanceBefore = new Prisma.Decimal(wallet.balance);
      const amountDec = new Prisma.Decimal(voucher.amount);
      const balanceAfter = balanceBefore.plus(amountDec);

      const result = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.goWalletVoucher.updateMany({
          where: { id: voucher.id, status: GoWalletVoucherStatus.UNUSED },
          data: {
            status: GoWalletVoucherStatus.REDEEMED,
            redeemed_by_customer_id: profile.id,
            redeemed_at: new Date(),
          },
        });
        if (claimed.count !== 1) {
          throw new GoException(GoErrorCode.WALLET_CODE_ALREADY_USED, 'Recharge code already used');
        }
        await tx.goCustomerWallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        });
        const txRow = await tx.goCustomerWalletTransaction.create({
          data: {
            wallet_id: wallet.id,
            customer_id: profile.id,
            type: GoWalletTransactionType.TOP_UP,
            amount: amountDec,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            reason: `voucher_redeem:${code}`,
          },
        });
        await tx.goWalletVoucher.update({
          where: { id: voucher.id },
          data: { redeemed_transaction_id: txRow.id },
        });
        return txRow;
      });

      await this.audit.log({
        actor: { id: userId, role: GoRole.CUSTOMER },
        action: AuditAction.CUSTOMER_WALLET_VOUCHER_REDEEM,
        entity_type: 'GoWalletVoucher',
        entity_id: voucher.id,
        metadata: { code, amount: decimalToNumber(amountDec), transaction_id: result.id },
      });

      await this.emitWalletUpdated(profile.id, userId);

      return {
        balance: decimalToNumber(balanceAfter),
        currency: CUSTOMER_WALLET_CURRENCY,
        credited: decimalToNumber(amountDec),
        transaction_id: result.id,
        code,
      };
    });
  }

  /** Peer transfer A→B (Figma «تحويل رصيد لصديق»). */
  async transferToFriend(userId: string, recipientPhoneRaw: string, amount: number) {
    if (!(amount > 0) || !Number.isFinite(amount)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'amount', messages: ['amount must be a number > 0'] }],
      });
    }
    const phoneNorm = normalizeE164(recipientPhoneRaw);
    if (typeof phoneNorm !== 'string' || !phoneNorm.startsWith('+')) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'recipient_phone', messages: ['recipient_phone must be a valid phone'] }],
      });
    }

    const sender = await this.prisma.goCustomerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
      include: { user: { select: { id: true, phone: true } } },
    });

    const recipientUser = await this.prisma.user.findFirst({
      where: {
        phone: phoneNorm,
        role: GoRole.CUSTOMER,
        deleted_at: null,
        is_active: true,
        customerProfile: { isNot: null },
      },
      select: {
        id: true,
        phone: true,
        full_name: true,
        customerProfile: { select: { id: true } },
      },
    });
    if (!recipientUser?.customerProfile) {
      throw new GoException(GoErrorCode.RECIPIENT_NOT_FOUND, 'No customer found for this phone');
    }
    if (recipientUser.customerProfile.id === sender.id || recipientUser.id === userId) {
      throw new GoException(GoErrorCode.TRANSFER_TO_SELF, 'Cannot transfer to yourself');
    }

    const senderId = sender.id;
    const recipientId = recipientUser.customerProfile.id;
    const amountDec = new Prisma.Decimal(amount);
    const [lockA, lockB] = [senderId, recipientId].sort();

    return this.locks.withLock(`customer-wallet:${lockA}`, () =>
      this.locks.withLock(`customer-wallet:${lockB}`, async () => {
        const senderWallet = await this.ensureWallet(senderId);
        const recipientWallet = await this.ensureWallet(recipientId);
        const senderBefore = new Prisma.Decimal(senderWallet.balance);
        if (amountDec.gt(senderBefore)) {
          throw new GoException(GoErrorCode.WALLET_INSUFFICIENT_BALANCE, 'Wallet balance does not cover the transfer', {
            required: decimalToNumber(amountDec),
            balance: decimalToNumber(senderBefore),
            currency: CUSTOMER_WALLET_CURRENCY,
          });
        }
        const senderAfter = senderBefore.minus(amountDec);
        const recipientBefore = new Prisma.Decimal(recipientWallet.balance);
        const recipientAfter = recipientBefore.plus(amountDec);

        const outTx = await this.prisma.$transaction(async (tx) => {
          await tx.goCustomerWallet.update({
            where: { id: senderWallet.id },
            data: { balance: senderAfter },
          });
          await tx.goCustomerWallet.update({
            where: { id: recipientWallet.id },
            data: { balance: recipientAfter },
          });
          const debit = await tx.goCustomerWalletTransaction.create({
            data: {
              wallet_id: senderWallet.id,
              customer_id: senderId,
              type: GoWalletTransactionType.TRANSFER_OUT,
              amount: amountDec,
              balance_before: senderBefore,
              balance_after: senderAfter,
              reason: `transfer_out;to:${recipientId}`,
            },
          });
          const credit = await tx.goCustomerWalletTransaction.create({
            data: {
              wallet_id: recipientWallet.id,
              customer_id: recipientId,
              type: GoWalletTransactionType.TRANSFER_IN,
              amount: amountDec,
              balance_before: recipientBefore,
              balance_after: recipientAfter,
              reason: `transfer_in;from:${senderId}`,
              related_transaction_id: debit.id,
            },
          });
          await tx.goCustomerWalletTransaction.update({
            where: { id: debit.id },
            data: { related_transaction_id: credit.id },
          });
          return debit;
        });

        await this.audit.log({
          actor: { id: userId, role: GoRole.CUSTOMER },
          action: AuditAction.CUSTOMER_WALLET_TRANSFER,
          entity_type: 'GoCustomerWalletTransaction',
          entity_id: outTx.id,
          metadata: {
            amount: decimalToNumber(amountDec),
            recipient_customer_id: recipientId,
            transaction_id: outTx.id,
          },
        });

        await this.emitWalletUpdated(senderId, userId);
        await this.emitWalletUpdated(recipientId, recipientUser.id);

        return {
          balance: decimalToNumber(senderAfter),
          currency: CUSTOMER_WALLET_CURRENCY,
          transferred: decimalToNumber(amountDec),
          recipient: {
            phone_masked: maskPhone(recipientUser.phone),
            full_name: recipientUser.full_name?.trim() || null,
          },
          transaction_id: outTx.id,
        };
      }),
    );
  }

  /** Staff: create a reusable one-shot recharge code. */
  async createVoucher(
    actor: AuthUser,
    input: { code?: string; amount: number; expires_at?: string | null; note?: string | null },
  ) {
    if (!(input.amount > 0) || !Number.isFinite(input.amount)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'amount', messages: ['amount must be a number > 0'] }],
      });
    }
    const code = input.code?.trim()
      ? assertValidVoucherCode(input.code)
      : this.generateVoucherCode();
    let expires_at: Date | null = null;
    if (input.expires_at) {
      expires_at = new Date(input.expires_at);
      if (Number.isNaN(expires_at.getTime())) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'expires_at', messages: ['expires_at must be a valid ISO datetime'] }],
        });
      }
    }
    try {
      const created = await this.prisma.goWalletVoucher.create({
        data: {
          code,
          amount: new Prisma.Decimal(input.amount),
          currency: CUSTOMER_WALLET_CURRENCY,
          status: GoWalletVoucherStatus.UNUSED,
          expires_at,
          note: input.note?.trim() || null,
          created_by_id: actor.id,
        },
      });
      await this.audit.log({
        actor,
        action: AuditAction.WALLET_VOUCHER_CREATED,
        entity_type: 'GoWalletVoucher',
        entity_id: created.id,
        metadata: { code, amount: input.amount },
      });
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'code', messages: ['code already exists'] }],
        });
      }
      throw err;
    }
  }

  listVouchers(page = 1, limit = 20, status?: GoWalletVoucherStatus) {
    return this.prisma.goWalletVoucher.findMany({
      where: status ? { status } : {},
      orderBy: { created_at: 'desc' },
      ...pageSkip(page, limit),
    });
  }

  async disableVoucher(actor: AuthUser, voucherId: string) {
    const existing = await this.prisma.goWalletVoucher.findUnique({ where: { id: voucherId } });
    if (!existing) throw new GoException(GoErrorCode.NOT_FOUND, 'Voucher not found');
    if (existing.status === GoWalletVoucherStatus.REDEEMED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Cannot disable a redeemed voucher');
    }
    const updated = await this.prisma.goWalletVoucher.update({
      where: { id: voucherId },
      data: { status: GoWalletVoucherStatus.DISABLED },
    });
    await this.audit.log({
      actor,
      action: AuditAction.WALLET_VOUCHER_DISABLED,
      entity_type: 'GoWalletVoucher',
      entity_id: voucherId,
    });
    return updated;
  }

  private generateVoucherCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const chunk = () =>
      Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    return normalizeVoucherCode(`${chunk()}-${chunk()}-${chunk()}`);
  }

  /** Takes the expected fare from the wallet when a WALLET ride is created. */
  async holdForRide(input: { customerId: string; rideId: string; amount: Prisma.Decimal }) {
    return this.locks.withLock(`customer-wallet:${input.customerId}`, async () => {
      const wallet = await this.ensureWallet(input.customerId);
      const balance = new Prisma.Decimal(wallet.balance);
      const amount = Prisma.Decimal.max(input.amount, 0);
      if (amount.gt(balance)) {
        throw new GoException(GoErrorCode.WALLET_INSUFFICIENT_BALANCE, 'Wallet balance does not cover the fare', {
          required: decimalToNumber(amount),
          balance: decimalToNumber(balance),
          currency: CUSTOMER_WALLET_CURRENCY,
        });
      }
      await this.prisma.$transaction(async (tx) => {
        await this.applyRideMovement(tx, wallet.id, input.customerId, input.rideId, balance, amount, 'ride_hold');
        await tx.goRide.update({ where: { id: input.rideId }, data: { wallet_paid_amount: amount } });
      });
      await this.emitWalletUpdated(input.customerId);
      return amount;
    });
  }

  /**
   * Moves the wallet charge of a WALLET ride to `target` (refund the excess or charge the difference).
   * Returns the amount the wallet now covers, or null for non-wallet rides.
   */
  async settleRide(rideId: string, target: Prisma.Decimal, reason = 'ride_settle') {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      select: { customer_id: true, payment_method: true },
    });
    if (!ride || ride.payment_method !== GoPaymentMethod.WALLET) return null;
    return this.locks.withLock(`customer-wallet:${ride.customer_id}`, async () => {
      const fresh = await this.prisma.goRide.findUniqueOrThrow({
        where: { id: rideId },
        select: { wallet_paid_amount: true },
      });
      const wallet = await this.ensureWallet(ride.customer_id);
      const balance = new Prisma.Decimal(wallet.balance);
      const result = settleRideWallet(fresh.wallet_paid_amount, target, balance);
      if (result.change.isZero()) return result.paidAfter;
      await this.prisma.$transaction(async (tx) => {
        await this.applyRideMovement(tx, wallet.id, ride.customer_id, rideId, balance, result.change, reason);
        await tx.goRide.update({ where: { id: rideId }, data: { wallet_paid_amount: result.paidAfter } });
      });
      await this.emitWalletUpdated(ride.customer_id);
      return result.paidAfter;
    });
  }

  /** Returns the full wallet charge of a ride that ended without a fare (cancel, no-show, no driver). */
  refundRide(rideId: string, reason: string) {
    return this.settleRide(rideId, new Prisma.Decimal(0), reason);
  }

  /**
   * Credits the customer wallet with cash change returned by the driver after the ride.
   * Idempotent per ride when `reason` matches an existing RIDE_REFUND for that ride.
   */
  async creditChangeReturn(input: { customerId: string; rideId: string; amount: Prisma.Decimal; reason: string }) {
    const amount = Prisma.Decimal.max(input.amount, 0);
    if (amount.lte(0)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'change amount must be positive');
    }
    return this.locks.withLock(`customer-wallet:${input.customerId}`, async () => {
      const existing = await this.prisma.goCustomerWalletTransaction.findFirst({
        where: {
          ride_id: input.rideId,
          type: GoWalletTransactionType.RIDE_REFUND,
          reason: input.reason,
        },
      });
      if (existing) {
        return { already: true as const, amount: new Prisma.Decimal(existing.amount), transactionId: existing.id };
      }
      const wallet = await this.ensureWallet(input.customerId);
      const balance = new Prisma.Decimal(wallet.balance);
      // Negative change credits (RIDE_REFUND).
      const tx = await this.prisma.$transaction(async (db) =>
        this.applyRideMovement(db, wallet.id, input.customerId, input.rideId, balance, amount.negated(), input.reason),
      );
      await this.emitWalletUpdated(input.customerId);
      return { already: false as const, amount, transactionId: tx.id };
    });
  }

  async findChangeReturn(rideId: string, reason: string) {
    return this.prisma.goCustomerWalletTransaction.findFirst({
      where: { ride_id: rideId, type: GoWalletTransactionType.RIDE_REFUND, reason },
      select: { id: true, amount: true, created_at: true },
    });
  }

  /** Keeps the wallet charge with the live replacement ride. */
  async transferRideHold(fromRideId: string, toRideId: string, tx: Db = this.prisma) {
    const from = await tx.goRide.findUniqueOrThrow({
      where: { id: fromRideId },
      select: { wallet_paid_amount: true },
    });
    if (new Prisma.Decimal(from.wallet_paid_amount).isZero()) return;
    await tx.goRide.update({ where: { id: toRideId }, data: { wallet_paid_amount: from.wallet_paid_amount } });
    await tx.goRide.update({ where: { id: fromRideId }, data: { wallet_paid_amount: 0 } });
  }

  /** Positive `change` debits the wallet (RIDE_PAYMENT), negative credits it (RIDE_REFUND). */
  private async applyRideMovement(
    tx: Prisma.TransactionClient,
    walletId: string,
    customerId: string,
    rideId: string,
    balanceBefore: Prisma.Decimal,
    change: Prisma.Decimal,
    reason: string,
  ) {
    const balanceAfter = balanceBefore.minus(change);
    await tx.goCustomerWallet.update({ where: { id: walletId }, data: { balance: balanceAfter } });
    return tx.goCustomerWalletTransaction.create({
      data: {
        wallet_id: walletId,
        customer_id: customerId,
        ride_id: rideId,
        type: change.isNegative() ? GoWalletTransactionType.RIDE_REFUND : GoWalletTransactionType.RIDE_PAYMENT,
        amount: change.abs(),
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason,
      },
    });
  }

  private async ensureWallet(customerId: string, db: Db = this.prisma) {
    return db.goCustomerWallet.upsert({
      where: { customer_id: customerId },
      create: { customer_id: customerId, balance: 0 },
      update: {},
    });
  }

  /**
   * Socket + FCM: same shape as GET /customer/wallet.
   * Pass `userId` when already known to skip the profile lookup.
   */
  async emitWalletUpdated(customerId: string, userId?: string) {
    const uid =
      userId ??
      (
        await this.prisma.goCustomerProfile.findUnique({
          where: { id: customerId },
          select: { user_id: true },
        })
      )?.user_id;
    if (!uid) return;
    const wallet = await this.ensureWallet(customerId);
    const month = await this.monthStats(customerId);
    this.realtime.emitToCustomer(uid, 'wallet.updated', {
      balance: decimalToNumber(wallet.balance),
      currency: CUSTOMER_WALLET_CURRENCY,
      month,
    });
  }

  private async assertCustomer(actor: AuthUser, customerId: string) {
    const customer = await this.prisma.goCustomerProfile.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw new GoException(GoErrorCode.NOT_FOUND, 'Customer not found');
    const scope = this.branchScope.scopeOf(actor);
    if (scope === null) return customer;
    const inBranch = await this.prisma.goRide.findFirst({
      where: { customer_id: customerId, branch_id: scope },
      select: { id: true },
    });
    if (!inBranch) {
      throw new GoException(GoErrorCode.BRANCH_SCOPE_DENIED, 'Customer has no rides in your branch');
    }
    return customer;
  }
}
