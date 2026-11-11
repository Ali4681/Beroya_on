import { Injectable } from '@nestjs/common';
import {
  GoCompensationBearer,
  GoCompensationType,
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
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { decimalToNumber } from '../pricing/fare.calculator';
import { FareSettlementService } from '../rides/fare-settlement.service';
import { WalletService } from '../wallets/wallet.service';

@Injectable()
export class CompensationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly fareSettlement: FareSettlementService,
    private readonly wallets: WalletService,
  ) {}

  async apply(
    actor: AuthUser,
    rideId: string,
    body: {
      type: GoCompensationType;
      percentage?: number;
      fixed_amount?: number;
      reason: string;
    },
  ) {
    if (actor.role !== GoRole.CUSTOMER_SERVICE_SUPERVISOR && actor.role !== GoRole.SUPER_ADMIN) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, 'Only CS Supervisor can apply compensation');
    }
    if (!body.reason?.trim()) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'reason required');
    }

    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      include: { customer: true },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    this.branchScope.assertAccess(actor, ride.branch_id);

    const base = new Prisma.Decimal(ride.gross_final_fare ?? ride.estimated_fare ?? 0);
    let applied: Prisma.Decimal;
    if (body.type === GoCompensationType.PERCENTAGE) {
      if (body.percentage == null || body.percentage < 0 || body.percentage > 100) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'percentage 0–100 required');
      }
      applied = base.mul(body.percentage).div(100).toDecimalPlaces(2);
    } else {
      if (body.fixed_amount == null || body.fixed_amount < 0) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'fixed_amount required');
      }
      applied = new Prisma.Decimal(body.fixed_amount);
    }

    const compensation = await this.prisma.$transaction(async (tx) => {
      return tx.goRideCompensation.create({
        data: {
          ride_id: rideId,
          type: body.type,
          percentage: body.percentage,
          fixed_amount: body.fixed_amount,
          applied_amount: applied,
          reason: body.reason,
          created_by_id: actor.id,
        },
      });
    });
    const settled = await this.fareSettlement.settle(rideId, base);

    await this.audit.log({
      actor,
      action: AuditAction.COMPENSATION_APPLIED,
      entity_type: 'GoRideCompensation',
      entity_id: compensation.id,
      branch_id: ride.branch_id,
      metadata: { ride_id: rideId, applied_amount: decimalToNumber(applied) },
    });
    this.realtime.emitToCustomer(ride.customer.user_id, 'ride.compensation_applied', {
      ride_id: rideId,
      applied_amount: decimalToNumber(applied),
    });
    this.realtime.emitToStaff(ride.branch_id, 'compensation.applied', {
      compensation_id: compensation.id,
      ride_id: rideId,
    });
    return { ...compensation, fare_stack_decision: settled.decision, customer_payable: decimalToNumber(settled.payable) };
  }

  async allocate(
    actor: AuthUser,
    compensationId: string,
    body: { bearer: GoCompensationBearer; beroya_share?: number; driver_share?: number },
  ) {
    if (actor.role !== GoRole.FINANCE && actor.role !== GoRole.ADMIN && actor.role !== GoRole.SUPER_ADMIN) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED);
    }
    const row = await this.prisma.goRideCompensation.findUnique({
      where: { id: compensationId },
      include: { ride: { include: { driver: { select: { id: true, user_id: true } } } } },
    });
    if (!row) throw new GoException(GoErrorCode.NOT_FOUND, 'Compensation not found');
    this.branchScope.assertAccess(actor, row.ride.branch_id);
    if (row.wallet_posted_at) {
      throw new GoException(GoErrorCode.CONFLICT, 'Compensation bearer already posted to driver wallet');
    }
    if (body.bearer === GoCompensationBearer.UNASSIGNED) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'bearer must be BEROYA, DRIVER, or SPLIT');
    }

    let beroyaShare = body.beroya_share;
    let driverShare = body.driver_share;
    if (body.bearer === GoCompensationBearer.SPLIT) {
      const b = new Prisma.Decimal(beroyaShare ?? 0);
      const d = new Prisma.Decimal(driverShare ?? 0);
      if (!b.plus(d).equals(row.applied_amount)) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'beroya_share + driver_share must equal applied_amount');
      }
    } else if (body.bearer === GoCompensationBearer.DRIVER) {
      beroyaShare = 0;
      driverShare = decimalToNumber(row.applied_amount);
    } else {
      beroyaShare = decimalToNumber(row.applied_amount);
      driverShare = 0;
    }

    let walletTransactionId: string | null = null;
    let walletPostedAt: Date | null = null;
    const debitAmount = new Prisma.Decimal(driverShare ?? 0);
    if (
      (body.bearer === GoCompensationBearer.DRIVER || body.bearer === GoCompensationBearer.SPLIT) &&
      debitAmount.gt(0)
    ) {
      if (!row.ride.driver_id || !row.ride.driver) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Ride has no driver to debit for compensation bearer');
      }
      const posted = await this.wallets.debitPenaltyOrDue({
        driverId: row.ride.driver_id,
        amount: debitAmount,
        type: GoWalletTransactionType.COMPENSATION_BEARER,
        rideId: row.ride_id,
        reason: `compensation_bearer; compensation_id=${compensationId}`,
        driverUserId: row.ride.driver.user_id,
        createdById: actor.id,
      });
      walletTransactionId = posted.txRow?.id ?? null;
      walletPostedAt = new Date();
    }

    const updated = await this.prisma.goRideCompensation.update({
      where: { id: compensationId },
      data: {
        bearer: body.bearer,
        beroya_share: beroyaShare,
        driver_share: driverShare,
        finance_reviewed_by_id: actor.id,
        finance_reviewed_at: new Date(),
        wallet_posted_at: walletPostedAt,
        wallet_transaction_id: walletTransactionId,
      },
    });
    await this.audit.log({
      actor,
      action: AuditAction.COMPENSATION_ALLOCATED,
      entity_type: 'GoRideCompensation',
      entity_id: compensationId,
      branch_id: row.ride.branch_id,
      metadata: {
        ...body,
        beroya_share: beroyaShare,
        driver_share: driverShare,
        wallet_transaction_id: walletTransactionId,
      } as Prisma.InputJsonValue,
    });
    return updated;
  }

  list(
    actor: AuthUser,
    q: { page?: number; limit?: number; bearer?: GoCompensationBearer; ride_id?: string; branch_id?: string },
  ) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    return this.prisma.goRideCompensation.findMany({
      where: {
        bearer: q.bearer,
        ride_id: q.ride_id,
        ride: { branch_id: branchId },
      },
      include: {
        ride: { select: { id: true, public_number: true, status: true } },
        created_by: { select: { id: true, full_name: true } },
      },
      orderBy: { created_at: 'desc' },
      ...pageSkip(q.page, q.limit),
    });
  }

  async get(actor: AuthUser, compensationId: string) {
    const row = await this.prisma.goRideCompensation.findUnique({
      where: { id: compensationId },
      include: {
        ride: {
          select: {
            id: true,
            public_number: true,
            status: true,
            branch_id: true,
            pickup_address: true,
            original_destination_address: true,
            created_at: true,
            gross_final_fare: true,
            customer_payable: true,
            customer: { select: { id: true, user: { select: { full_name: true, phone: true } } } },
            driver: { select: { id: true, user: { select: { full_name: true, phone: true } } } },
            ride_category: { select: { id: true, name_ar: true, name_en: true, code: true } },
          },
        },
        created_by: { select: { id: true, full_name: true } },
      },
    });
    if (!row) throw new GoException(GoErrorCode.NOT_FOUND, 'Compensation not found');
    this.branchScope.assertAccess(actor, row.ride.branch_id);
    return row;
  }
}
