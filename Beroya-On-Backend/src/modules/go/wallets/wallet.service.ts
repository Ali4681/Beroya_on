import { Injectable } from '@nestjs/common';
import {
  GoCommissionBase,
  GoDriverAvailability,
  GoOnlineSessionEnd,
  GoRideStatus,
  GoRole,
  GoWalletTransactionType,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { DriverSessionsService } from '../driver-sessions/driver-sessions.service';
import { decimalToNumber } from '../pricing/fare.calculator';
import {
  ledgerActivityItem,
  mergeActivityItems,
  tripEarningItem,
} from './driver-wallet-activity';
import { settleCommission } from './wallet-math';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: LockService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly branchScope: BranchScopeService,
    private readonly sessions: DriverSessionsService,
  ) {}

  listForStaff(actor: AuthUser, page = 1, limit = 20, requestedBranch?: string) {
    const branchId = this.branchScope.resolveFilter(actor, requestedBranch);
    return this.prisma.goDriverWallet.findMany({
      where: branchId ? { driver: { branch_id: branchId } } : {},
      include: {
        driver: {
          select: {
            id: true,
            user: { select: { full_name: true, phone: true } },
            branch: { select: { id: true, name_ar: true, code: true } },
          },
        },
      },
      orderBy: { updated_at: 'desc' },
      ...pageSkip(page, limit),
    });
  }

  async ledger(actor: AuthUser, driverId: string, page = 1, limit = 50) {
    const branchSelect = { id: true, code: true, name_ar: true, name_en: true } as const;
    const userSelect = {
      id: true,
      full_name: true,
      email: true,
      phone: true,
      role: true,
      branch: { select: branchSelect },
    } as const;
    const driver = await this.prisma.goDriverProfile.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        branch_id: true,
        branch: { select: branchSelect },
        user: { select: { full_name: true, phone: true } },
      },
    });
    if (!driver) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver not found');
    if (driver.branch_id) this.branchScope.assertAccess(actor, driver.branch_id);
    const [wallet, transactions, holds] = await Promise.all([
      this.prisma.goDriverWallet.findUnique({ where: { driver_id: driverId } }),
      this.prisma.goDriverWalletTransaction.findMany({
        where: { driver_id: driverId },
        orderBy: { created_at: 'desc' },
        include: {
          ride: {
            select: {
              id: true,
              public_number: true,
              gross_final_fare: true,
              customer_payable: true,
              discount_total: true,
              completed_at: true,
              branch: { select: branchSelect },
            },
          },
          created_by: { select: userSelect },
          store_ledger_entry: {
            select: {
              id: true,
              reference: true,
              store: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  branch: { select: branchSelect },
                },
              },
              performed_by: {
                select: {
                  id: true,
                  full_name: true,
                  email: true,
                  phone: true,
                  role: true,
                },
              },
            },
          },
        },
        ...pageSkip(page, limit),
      }),
      this.prisma.goWalletCommissionHold.findMany({
        where: { driver_id: driverId },
        orderBy: { created_at: 'desc' },
        take: 20,
        include: { ride: { select: { id: true, public_number: true } } },
      }),
    ]);
    return {
      driver,
      wallet,
      transactions: transactions.map((row) => this.deskLedgerRow(row, driver.branch)),
      holds,
    };
  }

  /** Desk-facing extras: who topped up, which branch/store, fare vs commission vs driver net. */
  private deskLedgerRow(
    row: {
      id: string;
      type: GoWalletTransactionType;
      amount: Prisma.Decimal;
      balance_before: Prisma.Decimal;
      balance_after: Prisma.Decimal;
      reason: string | null;
      ride_id: string | null;
      created_at: Date;
      created_by: {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        role: GoRole;
        branch: { id: string; code: string; name_ar: string; name_en: string | null } | null;
      } | null;
      ride: {
        id: string;
        public_number: string;
        gross_final_fare: Prisma.Decimal | null;
        customer_payable: Prisma.Decimal | null;
        discount_total: Prisma.Decimal | null;
        completed_at: Date | null;
        branch: { id: string; code: string; name_ar: string; name_en: string | null } | null;
      } | null;
      store_ledger_entry: {
        id: string;
        reference: string;
        store: {
          id: string;
          code: string;
          name: string;
          branch: { id: string; code: string; name_ar: string; name_en: string | null };
        };
        performed_by: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          role: GoRole;
        };
      } | null;
    },
    driverBranch: { id: string; code: string; name_ar: string; name_en: string | null } | null,
  ) {
    const amount = decimalToNumber(row.amount);
    const fare = row.ride?.gross_final_fare != null ? decimalToNumber(row.ride.gross_final_fare) : null;
    const payable = row.ride?.customer_payable != null ? decimalToNumber(row.ride.customer_payable) : null;
    const discount = row.ride?.discount_total != null ? decimalToNumber(row.ride.discount_total) : null;
    const isCommission = row.type === GoWalletTransactionType.COMMISSION_DEDUCTION;
    const companyCommission = isCommission ? amount : null;
    const driverNet =
      isCommission && fare != null ? Math.round((fare - amount) * 100) / 100 : null;

    const store = row.store_ledger_entry?.store ?? null;
    const actorUser = row.store_ledger_entry?.performed_by ?? row.created_by;
    const branch =
      store?.branch ?? row.created_by?.branch ?? row.ride?.branch ?? driverBranch ?? null;

    return {
      id: row.id,
      type: row.type,
      amount,
      balance_before: decimalToNumber(row.balance_before),
      balance_after: decimalToNumber(row.balance_after),
      reason: row.reason,
      ride_id: row.ride_id,
      created_at: row.created_at,
      ride: row.ride
        ? {
            id: row.ride.id,
            public_number: row.ride.public_number,
            gross_final_fare: fare,
            customer_payable: payable,
            discount_total: discount,
            completed_at: row.ride.completed_at,
          }
        : null,
      actor: actorUser
        ? {
            id: actorUser.id,
            full_name: actorUser.full_name,
            email: actorUser.email,
            phone: actorUser.phone,
            role: actorUser.role,
          }
        : null,
      branch: branch
        ? {
            id: branch.id,
            code: branch.code,
            name_ar: branch.name_ar,
            name_en: branch.name_en,
          }
        : null,
      store: store
        ? {
            id: store.id,
            code: store.code,
            name: store.name,
          }
        : null,
      ride_fare: fare,
      company_commission: companyCommission,
      driver_net: driverNet,
      customer_payable: payable,
    };
  }

  async getConfig() {
    return this.prisma.goWalletConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async updateConfig(
    actor: AuthUser,
    body: {
      minimum_initial_topup?: number;
      commission_percentage?: number;
      commission_base?: GoCommissionBase;
      system_average_fare?: number;
      low_balance_amount_enabled?: boolean;
      low_balance_amount?: number | null;
      low_balance_rides_enabled?: boolean;
      low_balance_remaining_rides?: number | null;
      driver_cancel_penalty_amount?: number;
    },
  ) {
    if (actor.role !== GoRole.ADMIN && actor.role !== GoRole.SUPER_ADMIN) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED);
    }
    if (body.commission_percentage != null && (body.commission_percentage < 0 || body.commission_percentage > 100)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'commission_percentage must be 0–100');
    }
    const updated = await this.prisma.goWalletConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        minimum_initial_topup: body.minimum_initial_topup ?? 10000,
        commission_percentage: body.commission_percentage ?? 10,
        commission_base: body.commission_base ?? GoCommissionBase.GROSS_FINAL_FARE,
        system_average_fare: body.system_average_fare ?? 5000,
        low_balance_amount_enabled: body.low_balance_amount_enabled ?? true,
        low_balance_amount: body.low_balance_amount ?? 20000,
        low_balance_rides_enabled: body.low_balance_rides_enabled ?? true,
        low_balance_remaining_rides: body.low_balance_remaining_rides ?? 3,
      },
      update: {
        minimum_initial_topup: body.minimum_initial_topup,
        commission_percentage: body.commission_percentage,
        commission_base: body.commission_base,
        system_average_fare: body.system_average_fare,
        low_balance_amount_enabled: body.low_balance_amount_enabled,
        low_balance_amount: body.low_balance_amount === null ? null : body.low_balance_amount,
        low_balance_rides_enabled: body.low_balance_rides_enabled,
        low_balance_remaining_rides:
          body.low_balance_remaining_rides === null ? null : body.low_balance_remaining_rides,
        driver_cancel_penalty_amount: body.driver_cancel_penalty_amount,
      },
    });
    await this.audit.log({
      actor,
      action: AuditAction.COMMISSION_CHANGED,
      entity_type: 'GoWalletConfig',
      entity_id: 'default',
      metadata: body as Prisma.InputJsonValue,
    });
    return updated;
  }

  expectedCommission(fare: Prisma.Decimal | number | string, pct: Prisma.Decimal | number | string) {
    const f = new Prisma.Decimal(fare);
    const p = new Prisma.Decimal(pct);
    return f.mul(p).div(100).toDecimalPlaces(2);
  }

  async ensureWallet(driverId: string, db: Db = this.prisma) {
    return db.goDriverWallet.upsert({
      where: { driver_id: driverId },
      create: { driver_id: driverId, balance: 0 },
      update: {},
    });
  }

  async activeHoldsTotal(driverId: string, db: Db = this.prisma) {
    const holds = await db.goWalletCommissionHold.findMany({
      where: { driver_id: driverId, released_at: null },
    });
    return holds.reduce((sum, h) => sum.plus(h.reserved_amount), new Prisma.Decimal(0));
  }

  async availableBalance(driverId: string, db: Db = this.prisma) {
    const wallet = await this.ensureWallet(driverId, db);
    const holds = await this.activeHoldsTotal(driverId, db);
    return new Prisma.Decimal(wallet.balance).minus(holds);
  }

  async canCover(driverId: string, estimatedFare: number | Prisma.Decimal | string | null | undefined) {
    const config = await this.getConfig();
    const fare =
      estimatedFare != null && estimatedFare !== ''
        ? estimatedFare
        : config.system_average_fare;
    const needed = this.expectedCommission(fare, config.commission_percentage);
    const wallet = await this.ensureWallet(driverId);
    const available = await this.availableBalance(driverId);
    const due = new Prisma.Decimal(wallet.outstanding_due);
    const ok = due.lte(0) && available.gte(needed);
    return {
      ok,
      needed,
      available,
      balance: new Prisma.Decimal(wallet.balance),
      outstanding_due: due,
      commission_percentage: new Prisma.Decimal(config.commission_percentage),
    };
  }

  async reserveForRide(driverId: string, rideId: string, estimatedFare: Prisma.Decimal | number | string | null) {
    return this.locks.withLock(`wallet:${driverId}`, async () => {
      const check = await this.canCover(driverId, estimatedFare);
      if (!check.ok) {
        throw new GoException(GoErrorCode.DRIVER_WALLET_INSUFFICIENT, 'Insufficient wallet for expected commission', {
          needed: decimalToNumber(check.needed),
          available: decimalToNumber(check.available),
        });
      }
      const wallet = await this.ensureWallet(driverId);
      const existing = await this.prisma.goWalletCommissionHold.findUnique({ where: { ride_id: rideId } });
      if (existing && !existing.released_at) return existing;
      if (existing?.released_at) {
        return this.prisma.goWalletCommissionHold.update({
          where: { id: existing.id },
          data: { reserved_amount: check.needed, released_at: null, driver_id: driverId, wallet_id: wallet.id },
        });
      }
      return this.prisma.goWalletCommissionHold.create({
        data: {
          driver_id: driverId,
          wallet_id: wallet.id,
          ride_id: rideId,
          reserved_amount: check.needed,
        },
      });
    });
  }

  async releaseHold(rideId: string, db: Db = this.prisma) {
    await db.goWalletCommissionHold.updateMany({
      where: { ride_id: rideId, released_at: null },
      data: { released_at: new Date() },
    });
  }

  /**
   * Ticket §20.6 — release hold, deduct commission (no negative), record due for shortfall, maybe force offline.
   */
  async finalizeRideCommission(input: {
    driverId: string;
    rideId: string;
    grossFinalFare: Prisma.Decimal | number | string;
    customerPayable: Prisma.Decimal | number | string;
    /**
     * Customer fare discount. Company funds this amount into the driver wallet
     * (so cash-from-customer + wallet credit = gross), then commission uses gross.
     */
    discountTotal?: Prisma.Decimal | number | string | null;
    driverUserId: string;
  }) {
    return this.locks.withLock(`wallet:${input.driverId}`, async () => {
      const config = await this.getConfig();
      const discount = Prisma.Decimal.max(new Prisma.Decimal(input.discountTotal ?? 0), 0);
      const base =
        discount.gt(0) || config.commission_base !== GoCommissionBase.CUSTOMER_PAYABLE
          ? input.grossFinalFare
          : input.customerPayable;
      const commission = this.expectedCommission(base, config.commission_percentage);

      return this.prisma.$transaction(async (tx) => {
        await this.releaseHold(input.rideId, tx);
        let wallet = await this.ensureWallet(input.driverId, tx);

        let subsidyCredited = new Prisma.Decimal(0);
        if (discount.gt(0)) {
          const priorSubsidy = await tx.goDriverWalletTransaction.findFirst({
            where: {
              ride_id: input.rideId,
              driver_id: input.driverId,
              type: GoWalletTransactionType.DISCOUNT_SUBSIDY,
            },
            select: { id: true, amount: true },
          });
          if (!priorSubsidy) {
            const beforeSubsidy = new Prisma.Decimal(wallet.balance);
            const due = new Prisma.Decimal(wallet.outstanding_due);
            const dueSettled = due.gt(0) ? Prisma.Decimal.min(due, discount) : new Prisma.Decimal(0);
            const afterSubsidy = beforeSubsidy.plus(discount.minus(dueSettled));
            wallet = await tx.goDriverWallet.update({
              where: { id: wallet.id },
              data: { balance: afterSubsidy, outstanding_due: due.minus(dueSettled) },
            });
            await tx.goDriverWalletTransaction.create({
              data: {
                wallet_id: wallet.id,
                driver_id: input.driverId,
                type: GoWalletTransactionType.DISCOUNT_SUBSIDY,
                amount: discount,
                balance_before: beforeSubsidy,
                balance_after: afterSubsidy,
                ride_id: input.rideId,
                reason:
                  dueSettled.gt(0)
                    ? `company_discount_subsidy; settled_due=${dueSettled.toFixed(2)}`
                    : 'company_discount_subsidy',
              },
            });
            subsidyCredited = discount;
          } else {
            subsidyCredited = new Prisma.Decimal(priorSubsidy.amount);
          }
        }

        const balanceBefore = new Prisma.Decimal(wallet.balance);
        const { deduct, shortfall, balanceAfter } = settleCommission(balanceBefore, commission);
        const outstanding = new Prisma.Decimal(wallet.outstanding_due).plus(shortfall);

        await tx.goDriverWallet.update({
          where: { id: wallet.id },
          data: {
            balance: balanceAfter,
            // Ticket §20.9 — last_commission_deduction = amount actually deducted
            last_commission_amount: deduct.gt(0) ? deduct : commission,
            outstanding_due: outstanding,
          },
        });

        let txRow = null as Awaited<ReturnType<typeof tx.goDriverWalletTransaction.create>> | null;
        if (deduct.gt(0)) {
          txRow = await tx.goDriverWalletTransaction.create({
            data: {
              wallet_id: wallet.id,
              driver_id: input.driverId,
              type: GoWalletTransactionType.COMMISSION_DEDUCTION,
              amount: deduct,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
              ride_id: input.rideId,
              reason: shortfall.gt(0)
                ? `partial; due=${shortfall.toFixed(2)}; commission=${commission.toFixed(2)}`
                : 'commission',
            },
          });
        }

        return {
          commission,
          deducted: deduct,
          shortfall,
          outstanding,
          balanceAfter,
          txRow,
          discountSubsidy: subsidyCredited,
        };
      }).then(async (result) => {
        await this.emitWalletState(input.driverId, input.driverUserId);
        if (result.shortfall.gt(0) || result.outstanding.gt(0)) {
          await this.forceOfflineIfIdle(input.driverId, input.driverUserId, 'WALLET_DUE');
        } else {
          await this.maybeEmitLowBalance(input.driverId, input.driverUserId);
        }
        return result;
      });
    });
  }

  async topUp(actor: AuthUser, driverId: string, amount: number, reason?: string) {
    if (amount <= 0) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'amount must be positive');
    }
    const driver = await this.prisma.goDriverProfile.findUnique({
      where: { id: driverId },
      include: { user: true, branch: true },
    });
    if (!driver) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver not found');
    if (driver.branch_id) this.branchScope.assertAccess(actor, driver.branch_id);

    const config = await this.getConfig();
    return this.locks.withLock(`wallet:${driverId}`, async () => {
      const wallet = await this.ensureWallet(driverId);
      const priorCredits = await this.priorCreditCount(driverId);
      if (priorCredits === 0 && new Prisma.Decimal(amount).lt(config.minimum_initial_topup)) {
        throw new GoException(
          GoErrorCode.VALIDATION_ERROR,
          `Initial top-up must be >= ${decimalToNumber(config.minimum_initial_topup)}`,
        );
      }

      const balanceBefore = new Prisma.Decimal(wallet.balance);
      const amountDec = new Prisma.Decimal(amount);
      let due = new Prisma.Decimal(wallet.outstanding_due);
      // Ticket §20.6 — settle outstanding due from top-up first; only remainder credits balance.
      const dueSettled = due.gt(0) ? Prisma.Decimal.min(due, amountDec) : new Prisma.Decimal(0);
      due = due.minus(dueSettled);
      const creditToBalance = amountDec.minus(dueSettled);
      const balanceAfter = balanceBefore.plus(creditToBalance);

      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.goDriverWallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter, outstanding_due: due },
        });
        return tx.goDriverWalletTransaction.create({
          data: {
            wallet_id: wallet.id,
            driver_id: driverId,
            type: GoWalletTransactionType.TOP_UP,
            amount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            reason:
              reason ??
              (dueSettled.gt(0)
                ? `top-up; settled_due=${dueSettled.toFixed(2)}; credited=${creditToBalance.toFixed(2)}`
                : 'top-up'),
            created_by_id: actor.id,
          },
        });
      });

      await this.audit.log({
        actor,
        action: AuditAction.WALLET_TOP_UP,
        entity_type: 'GoDriverWalletTransaction',
        entity_id: updated.id,
        branch_id: driver.branch_id,
        metadata: { driver_id: driverId, amount, due_settled: decimalToNumber(dueSettled) },
      });
      await this.emitWalletState(driverId, driver.user_id);
      return updated;
    });
  }

  async withdraw(actor: AuthUser, driverId: string, amount: number, reason?: string) {
    if (amount <= 0) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'amount must be positive');
    }
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { id: driverId } });
    if (!driver) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver not found');
    if (driver.branch_id) this.branchScope.assertAccess(actor, driver.branch_id);

    return this.locks.withLock(`wallet:${driverId}`, async () => {
      const wallet = await this.ensureWallet(driverId);
      const available = await this.availableBalance(driverId);
      const amountDec = new Prisma.Decimal(amount);
      if (amountDec.gt(available)) {
        throw new GoException(GoErrorCode.CONFLICT, 'Withdrawal exceeds available balance');
      }
      const balanceBefore = new Prisma.Decimal(wallet.balance);
      const balanceAfter = balanceBefore.minus(amountDec);
      const note = reason?.trim() ? `withdrawal; ${reason.trim()}` : 'withdrawal';

      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.goDriverWallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        });
        return tx.goDriverWalletTransaction.create({
          data: {
            wallet_id: wallet.id,
            driver_id: driverId,
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
        action: AuditAction.WALLET_WITHDRAWAL,
        entity_type: 'GoDriverWalletTransaction',
        entity_id: updated.id,
        branch_id: driver.branch_id,
        metadata: { driver_id: driverId, amount },
      });
      await this.emitWalletState(driverId, driver.user_id);
      return updated;
    });
  }

  async reverse(actor: AuthUser, transactionId: string, reason: string) {
    if (!reason?.trim()) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'reason required');
    }
    const original = await this.prisma.goDriverWalletTransaction.findUnique({
      where: { id: transactionId },
      include: { driver: true },
    });
    if (!original) throw new GoException(GoErrorCode.NOT_FOUND, 'Transaction not found');
    if (original.driver.branch_id) this.branchScope.assertAccess(actor, original.driver.branch_id);
    if (original.type === GoWalletTransactionType.REVERSAL) {
      throw new GoException(GoErrorCode.CONFLICT, 'Cannot reverse a reversal');
    }
    if (original.type === GoWalletTransactionType.POS_RECHARGE) {
      // The store balance must be restored in the same transaction: use the store recharge reversal.
      throw new GoException(GoErrorCode.CONFLICT, 'POS recharges are reversed from the store ledger', {
        code_detail: 'USE_STORE_REVERSAL',
      });
    }
    const already = await this.prisma.goDriverWalletTransaction.findFirst({
      where: { reversed_transaction_id: transactionId },
    });
    if (already) throw new GoException(GoErrorCode.CONFLICT, 'Transaction already reversed');

    return this.locks.withLock(`wallet:${original.driver_id}`, async () => {
      const wallet = await this.ensureWallet(original.driver_id);
      const balanceBefore = new Prisma.Decimal(wallet.balance);
      // TOP_UP reverse → subtract; debit types reverse → add back
      const isDebitType =
        original.type === GoWalletTransactionType.COMMISSION_DEDUCTION ||
        original.type === GoWalletTransactionType.COMPENSATION_BEARER ||
        original.type === GoWalletTransactionType.DRIVER_CANCEL_PENALTY ||
        original.type === GoWalletTransactionType.REVERSAL;
      const delta = isDebitType
        ? new Prisma.Decimal(original.amount)
        : new Prisma.Decimal(original.amount).neg();
      const balanceAfter = balanceBefore.plus(delta);
      if (balanceAfter.lt(0)) {
        throw new GoException(GoErrorCode.CONFLICT, 'Reversal would make wallet negative');
      }

      // If reversing a partial commission, also clear the shortfall due recorded with it.
      let due = new Prisma.Decimal(wallet.outstanding_due);
      if (original.type === GoWalletTransactionType.COMMISSION_DEDUCTION && original.reason?.includes('due=')) {
        const m = /due=([0-9.]+)/.exec(original.reason);
        if (m) {
          due = Prisma.Decimal.max(0, due.minus(new Prisma.Decimal(m[1])));
        }
      }
      // Reversing a top-up that settled due: restore due from reason if present
      if (original.type === GoWalletTransactionType.TOP_UP && original.reason?.includes('settled_due=')) {
        const m = /settled_due=([0-9.]+)/.exec(original.reason);
        if (m) {
          due = due.plus(new Prisma.Decimal(m[1]));
        }
      }

      const rev = await this.prisma.$transaction(async (tx) => {
        await tx.goDriverWallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter, outstanding_due: due },
        });
        return tx.goDriverWalletTransaction.create({
          data: {
            wallet_id: wallet.id,
            driver_id: original.driver_id,
            type: GoWalletTransactionType.REVERSAL,
            amount: original.amount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            ride_id: original.ride_id,
            reversed_transaction_id: original.id,
            reason,
            created_by_id: actor.id,
          },
        });
      });

      await this.audit.log({
        actor,
        action: AuditAction.WALLET_REVERSAL,
        entity_type: 'GoDriverWalletTransaction',
        entity_id: rev.id,
        branch_id: original.driver.branch_id,
        metadata: { original_id: original.id, reason },
      });
      const user = await this.prisma.goDriverProfile.findUnique({ where: { id: original.driver_id } });
      if (user) await this.emitWalletState(original.driver_id, user.user_id);
      return rev;
    });
  }

  /**
   * Debit driver wallet for cancel penalty or compensation bearer share.
   * Does not go negative: shortfall increases outstanding_due (same as commission).
   */
  /**
   * Debits the driver's available balance for cash change credited to the customer wallet.
   * Requires full coverage (no outstanding_due shortfall) — otherwise give cash change instead.
   */
  async debitChangeReturn(input: {
    driverId: string;
    rideId: string;
    amount: Prisma.Decimal;
    reason: string;
    driverUserId: string;
  }) {
    const amount = Prisma.Decimal.max(input.amount, 0);
    if (amount.lte(0)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'change amount must be positive');
    }
    return this.locks.withLock(`wallet:${input.driverId}`, async () => {
      const existing = await this.prisma.goDriverWalletTransaction.findFirst({
        where: {
          ride_id: input.rideId,
          driver_id: input.driverId,
          type: GoWalletTransactionType.ADJUSTMENT,
          reason: input.reason,
        },
      });
      if (existing) {
        return { already: true as const, amount: new Prisma.Decimal(existing.amount), transactionId: existing.id };
      }

      const wallet = await this.ensureWallet(input.driverId);
      const available = await this.availableBalance(input.driverId);
      if (amount.gt(available)) {
        throw new GoException(GoErrorCode.DRIVER_WALLET_INSUFFICIENT, 'Driver wallet cannot cover the change', {
          required: decimalToNumber(amount),
          available: decimalToNumber(available),
        });
      }

      const balanceBefore = new Prisma.Decimal(wallet.balance);
      const balanceAfter = balanceBefore.minus(amount);
      const txRow = await this.prisma.$transaction(async (tx) => {
        await tx.goDriverWallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
        return tx.goDriverWalletTransaction.create({
          data: {
            wallet_id: wallet.id,
            driver_id: input.driverId,
            type: GoWalletTransactionType.ADJUSTMENT,
            amount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            ride_id: input.rideId,
            reason: input.reason,
          },
        });
      });
      await this.emitWalletState(input.driverId, input.driverUserId);
      await this.maybeEmitLowBalance(input.driverId, input.driverUserId);
      return { already: false as const, amount, transactionId: txRow.id };
    });
  }

  async debitPenaltyOrDue(input: {
    driverId: string;
    amount: number | string | Prisma.Decimal;
    type: typeof GoWalletTransactionType.DRIVER_CANCEL_PENALTY | typeof GoWalletTransactionType.COMPENSATION_BEARER;
    rideId?: string;
    reason: string;
    driverUserId?: string;
    createdById?: string;
  }) {
    const amountDec = new Prisma.Decimal(input.amount);
    if (amountDec.lte(0)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'penalty amount must be positive');
    }

    return this.locks.withLock(`wallet:${input.driverId}`, async () => {
      const result = await this.prisma.$transaction(async (tx) => {
        const wallet = await this.ensureWallet(input.driverId, tx);
        const balanceBefore = new Prisma.Decimal(wallet.balance);
        const { deduct, shortfall, balanceAfter } = settleCommission(balanceBefore, amountDec);
        const outstanding = new Prisma.Decimal(wallet.outstanding_due).plus(shortfall);

        await tx.goDriverWallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter, outstanding_due: outstanding },
        });

        let txRow = null as Awaited<ReturnType<typeof tx.goDriverWalletTransaction.create>> | null;
        if (deduct.gt(0)) {
          txRow = await tx.goDriverWalletTransaction.create({
            data: {
              wallet_id: wallet.id,
              driver_id: input.driverId,
              type: input.type,
              amount: deduct,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
              ride_id: input.rideId,
              reason: shortfall.gt(0)
                ? `${input.reason}; due=${shortfall.toFixed(2)}; requested=${amountDec.toFixed(2)}`
                : input.reason,
              created_by_id: input.createdById,
            },
          });
        } else if (shortfall.gt(0)) {
          txRow = await tx.goDriverWalletTransaction.create({
            data: {
              wallet_id: wallet.id,
              driver_id: input.driverId,
              type: input.type,
              amount: 0,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
              ride_id: input.rideId,
              reason: `${input.reason}; due=${shortfall.toFixed(2)}; requested=${amountDec.toFixed(2)}`,
              created_by_id: input.createdById,
            },
          });
        }

        return { deducted: deduct, shortfall, outstanding, balanceAfter, txRow };
      });

      let driverUserId = input.driverUserId;
      if (!driverUserId) {
        const driver = await this.prisma.goDriverProfile.findUnique({
          where: { id: input.driverId },
          select: { user_id: true },
        });
        driverUserId = driver?.user_id;
      }
      if (driverUserId) {
        await this.emitWalletState(input.driverId, driverUserId);
        if (result.shortfall.gt(0) || result.outstanding.gt(0)) {
          await this.forceOfflineIfIdle(input.driverId, driverUserId, 'WALLET_DUE');
        }
      }
      return result;
    });
  }

  async getDriverView(userId: string) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { user_id: userId } });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    const wallet = await this.ensureWallet(driver.id);
    const available = await this.availableBalance(driver.id);
    const estimated = await this.estimateRemainingRides(driver.id, available);
    const low = await this.isLowBalance(driver.id, available, estimated);
    return {
      balance: decimalToNumber(wallet.balance),
      available_balance: decimalToNumber(available),
      outstanding_due: decimalToNumber(wallet.outstanding_due),
      last_commission_deduction: wallet.last_commission_amount
        ? decimalToNumber(wallet.last_commission_amount)
        : null,
      low_balance: low,
      estimated_remaining_rides: estimated,
    };
  }

  /**
   * Driver app activity feed (Option A): synthetic TRIP_EARNING from COMPLETED rides
   * merged with real wallet ledger rows. Display-only for trip earnings — does not change balance.
   */
  async getDriverTransactions(userId: string, page = 1, limit = 20) {
    const driver = await this.prisma.goDriverProfile.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');

    const { skip, take } = pageSkip(page, limit);
    const need = skip + take;
    const rideWhere = {
      driver_id: driver.id,
      status: GoRideStatus.COMPLETED,
      completed_at: { not: null },
      gross_final_fare: { not: null },
    } satisfies Prisma.GoRideWhereInput;

    const [rides, txs, rideTotal, txTotal] = await Promise.all([
      this.prisma.goRide.findMany({
        where: rideWhere,
        orderBy: [{ completed_at: 'desc' }, { id: 'desc' }],
        take: need,
        select: {
          id: true,
          public_number: true,
          pickup_address: true,
          original_destination_address: true,
          gross_final_fare: true,
          completed_at: true,
        },
      }),
      this.prisma.goDriverWalletTransaction.findMany({
        where: { driver_id: driver.id },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: need,
        include: {
          ride: {
            select: {
              id: true,
              public_number: true,
              pickup_address: true,
              original_destination_address: true,
            },
          },
        },
      }),
      this.prisma.goRide.count({ where: rideWhere }),
      this.prisma.goDriverWalletTransaction.count({ where: { driver_id: driver.id } }),
    ]);

    const tripItems = rides.map(tripEarningItem).filter((row): row is NonNullable<typeof row> => row != null);
    const ledgerItems = txs.map(ledgerActivityItem);
    const items = mergeActivityItems(tripItems, ledgerItems).slice(skip, skip + take);
    const total = rideTotal + txTotal;
    const safePage = Math.max(1, Math.trunc(Number(page)) || 1);
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit)) || 20));
    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      has_more: skip + items.length < total,
    };
  }

  async estimateRemainingRides(driverId: string, available?: Prisma.Decimal) {
    const avail = available ?? (await this.availableBalance(driverId));
    const recent = await this.prisma.goDriverWalletTransaction.findMany({
      where: { driver_id: driverId, type: GoWalletTransactionType.COMMISSION_DEDUCTION },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    let avg: Prisma.Decimal;
    if (recent.length >= 3) {
      const sum = recent.reduce((s, t) => s.plus(t.amount), new Prisma.Decimal(0));
      avg = sum.div(recent.length);
    } else {
      const config = await this.getConfig();
      avg = this.expectedCommission(config.system_average_fare, config.commission_percentage);
    }
    if (avg.lte(0)) return 0;
    return Math.floor(Number(avail.div(avg).toFixed(0)));
  }

  private async isLowBalance(driverId: string, available: Prisma.Decimal, remainingRides: number) {
    const config = await this.getConfig();
    if (config.low_balance_amount_enabled && config.low_balance_amount != null) {
      if (available.lte(config.low_balance_amount)) return true;
    }
    if (config.low_balance_rides_enabled && config.low_balance_remaining_rides != null) {
      if (remainingRides <= config.low_balance_remaining_rides) return true;
    }
    void driverId;
    return false;
  }

  /**
   * Company-paid credit (incentives). Caller holds `wallet:${driverId}` and passes its transaction.
   * Like a top-up, it settles outstanding due first and credits the remainder.
   */
  async creditIncentive(
    tx: Prisma.TransactionClient,
    input: { driverId: string; amount: Prisma.Decimal; rideId?: string | null; reason: string },
  ) {
    const wallet = await this.ensureWallet(input.driverId, tx);
    const balanceBefore = new Prisma.Decimal(wallet.balance);
    const due = new Prisma.Decimal(wallet.outstanding_due);
    const dueSettled = due.gt(0) ? Prisma.Decimal.min(due, input.amount) : new Prisma.Decimal(0);
    const balanceAfter = balanceBefore.plus(input.amount.minus(dueSettled));
    await tx.goDriverWallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter, outstanding_due: due.minus(dueSettled) },
    });
    return tx.goDriverWalletTransaction.create({
      data: {
        wallet_id: wallet.id,
        driver_id: input.driverId,
        type: GoWalletTransactionType.INCENTIVE_BONUS,
        amount: input.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        ride_id: input.rideId ?? null,
        reason: dueSettled.gt(0) ? `${input.reason}; settled_due=${dueSettled.toFixed(2)}` : input.reason,
      },
    });
  }

  /** Real money credits so far — decides whether the minimum initial top-up applies. */
  priorCreditCount(driverId: string, db: Db = this.prisma) {
    return db.goDriverWalletTransaction.count({
      where: {
        driver_id: driverId,
        OR: [
          { type: GoWalletTransactionType.TOP_UP },
          { type: GoWalletTransactionType.POS_RECHARGE },
          { type: GoWalletTransactionType.ADJUSTMENT, NOT: { reason: { startsWith: 'withdrawal' } } },
        ],
      },
    });
  }

  private async lockWalletRow(tx: Prisma.TransactionClient, driverId: string) {
    const wallet = await this.ensureWallet(driverId, tx);
    await tx.$queryRaw`SELECT id FROM go_driver_wallets WHERE id = ${wallet.id} FOR UPDATE`;
    return tx.goDriverWallet.findUniqueOrThrow({ where: { id: wallet.id } });
  }

  /**
   * Store cash recharge. Caller holds `wallet:${driverId}` and passes the transaction that also debits the store.
   * The full amount belongs to the driver: outstanding due is settled first (as for any top-up), the rest is balance.
   */
  async creditPosRecharge(
    tx: Prisma.TransactionClient,
    input: { driverId: string; amount: Prisma.Decimal; reason: string; createdById: string },
  ) {
    const wallet = await this.lockWalletRow(tx, input.driverId);
    const balanceBefore = new Prisma.Decimal(wallet.balance);
    const due = new Prisma.Decimal(wallet.outstanding_due);
    const dueSettled = due.gt(0) ? Prisma.Decimal.min(due, input.amount) : new Prisma.Decimal(0);
    const credited = input.amount.minus(dueSettled);
    const balanceAfter = balanceBefore.plus(credited);
    await tx.goDriverWallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter, outstanding_due: due.minus(dueSettled) },
    });
    const row = await tx.goDriverWalletTransaction.create({
      data: {
        wallet_id: wallet.id,
        driver_id: input.driverId,
        type: GoWalletTransactionType.POS_RECHARGE,
        amount: input.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason: dueSettled.gt(0) ? `${input.reason}; settled_due=${dueSettled.toFixed(2)}` : input.reason,
        created_by_id: input.createdById,
      },
    });
    return { row, dueSettled, credited, balanceAfter };
  }

  /**
   * Undo a POS recharge: take back what reached the balance and re-open the due it settled.
   * Refuses when the driver already spent it (or it is reserved for an active ride) — never goes negative.
   */
  async debitPosReversal(
    tx: Prisma.TransactionClient,
    input: { driverId: string; original: { id: string; amount: Prisma.Decimal; balance_before: Prisma.Decimal; balance_after: Prisma.Decimal; ride_id: string | null }; reason: string; createdById: string },
  ) {
    const wallet = await this.lockWalletRow(tx, input.driverId);
    const credited = new Prisma.Decimal(input.original.balance_after).minus(input.original.balance_before);
    const dueSettled = new Prisma.Decimal(input.original.amount).minus(credited);
    const holds = await this.activeHoldsTotal(input.driverId, tx);
    const balanceBefore = new Prisma.Decimal(wallet.balance);
    const available = balanceBefore.minus(holds);
    if (available.lt(credited)) {
      throw new GoException(GoErrorCode.WALLET_INSUFFICIENT_BALANCE, 'Driver wallet no longer holds the recharged amount', {
        code_detail: 'ALREADY_SPENT',
        available: decimalToNumber(available),
        required: decimalToNumber(credited),
      });
    }
    const balanceAfter = balanceBefore.minus(credited);
    await tx.goDriverWallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter, outstanding_due: new Prisma.Decimal(wallet.outstanding_due).plus(dueSettled) },
    });
    const row = await tx.goDriverWalletTransaction.create({
      data: {
        wallet_id: wallet.id,
        driver_id: input.driverId,
        type: GoWalletTransactionType.REVERSAL,
        amount: input.original.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        ride_id: input.original.ride_id,
        reversed_transaction_id: input.original.id,
        reason: dueSettled.gt(0) ? `${input.reason}; restored_due=${dueSettled.toFixed(2)}` : input.reason,
        created_by_id: input.createdById,
      },
    });
    return { row, credited, dueSettled, balanceAfter };
  }

  async emitWalletState(driverId: string, driverUserId: string) {
    const view = await this.getDriverView(driverUserId);
    this.realtime.emitToDriver(driverUserId, 'wallet.updated', view);
    if (view.low_balance) {
      this.realtime.emitToDriver(driverUserId, 'wallet.low_balance', view);
    }
  }

  private async maybeEmitLowBalance(driverId: string, driverUserId: string) {
    await this.emitWalletState(driverId, driverUserId);
  }

  /**
   * Ticket §20.6 — after shortfall, force OFFLINE until due settled.
   * WALLET_DUE clears current/next so promoteNextRide cannot keep them busy.
   */
  private async forceOfflineIfIdle(driverId: string, driverUserId: string, reason: string) {
    const state = await this.prisma.goDriverState.findUnique({ where: { driver_id: driverId } });
    if (reason !== 'WALLET_DUE' && state?.current_ride_id) return;
    await this.prisma.goDriverState.updateMany({
      where: { driver_id: driverId },
      data: {
        availability: GoDriverAvailability.OFFLINE,
        ...(reason === 'WALLET_DUE' ? { current_ride_id: null, next_ride_id: null } : {}),
      },
    });
    await this.sessions.close(driverId, GoOnlineSessionEnd.FORCED_OFFLINE);
    this.realtime.emitToDriver(driverUserId, 'driver.forced_offline', { reason });
  }
}
