import { Injectable } from '@nestjs/common';
import {
  GoCompensationType,
  GoFareStackDecision,
  GoRideStatus,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { DiscountsService } from '../discounts/discounts.service';
import { CustomerWalletService } from '../wallets/customer-wallet.service';
import { resolveFareStack } from './fare-stack';
import { paymentStatusFor } from './payment-status';

const CHOICES = ['DISCOUNT_ONLY', 'COMPENSATION_ONLY', 'BOTH'] as const;
export type StaffFareChoice = (typeof CHOICES)[number];

@Injectable()
export class FareSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discounts: DiscountsService,
    private readonly branchScope: BranchScopeService,
    private readonly customerWallets: CustomerWalletService,
  ) {}

  async settle(rideId: string, gross: Prisma.Decimal) {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      select: { fare_stack_decision: true, status: true, payment_method: true },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    const preview = await this.discounts.preview(rideId, gross);
    const compensation = await this.compensationTotal(rideId, gross);
    const stack = resolveFareStack({
      gross,
      discount: preview.amount,
      compensation,
      decision: ride.fare_stack_decision,
    });
    if (stack.consumeDiscount && preview.state === 'RESERVED') {
      await this.discounts.applyOnComplete(rideId, gross);
    }
    if (stack.releaseDiscount && preview.state !== 'NONE') {
      await this.discounts.releaseOrRevert(rideId);
    }
    const walletPaid =
      ride.status === GoRideStatus.COMPLETED ? await this.customerWallets.settleRide(rideId, stack.payable) : null;
    const payment_status = paymentStatusFor(
      ride.status,
      ride.payment_method,
      stack.payable,
      walletPaid ?? undefined,
    );
    await this.prisma.goRide.update({
      where: { id: rideId },
      data: {
        discount_total: stack.discountTotal,
        compensation_total: stack.compensationTotal,
        customer_payable: stack.payable,
        fare_stack_decision: stack.decision,
        payment_status,
      },
    });
    return { ...stack, payment_status, walletPaid };
  }

  async decide(actor: AuthUser, rideId: string, decision: StaffFareChoice) {
    const ride = await this.prisma.goRide.findUnique({ where: { id: rideId } });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    this.branchScope.assertAccess(actor, ride.branch_id);
    if (ride.fare_stack_decision !== GoFareStackDecision.PENDING) {
      throw new GoException(GoErrorCode.CONFLICT, 'Fare stack is not waiting for a decision');
    }
    const gross = new Prisma.Decimal(ride.gross_final_fare ?? ride.estimated_fare ?? 0);
    await this.prisma.goRide.update({
      where: { id: rideId },
      data: { fare_stack_decision: decision },
    });
    return this.settle(rideId, gross);
  }

  private async compensationTotal(rideId: string, gross: Prisma.Decimal) {
    const rows = await this.prisma.goRideCompensation.findMany({ where: { ride_id: rideId } });
    let total = new Prisma.Decimal(0);
    for (const row of rows) {
      let applied: Prisma.Decimal;
      if (row.type === GoCompensationType.PERCENTAGE && row.percentage != null) {
        applied = gross.mul(row.percentage).div(100).toDecimalPlaces(2);
        await this.prisma.goRideCompensation.update({
          where: { id: row.id },
          data: { applied_amount: applied },
        });
      } else {
        applied = new Prisma.Decimal(row.applied_amount);
      }
      total = total.plus(applied);
    }
    return total;
  }
}

export function isStaffFareChoice(value: string): value is StaffFareChoice {
  return (CHOICES as readonly string[]).includes(value);
}
