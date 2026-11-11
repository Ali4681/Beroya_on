import { Injectable } from '@nestjs/common';
import { GoDriverEntitlementStatus, GoRole, Prisma } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly branchScope: BranchScopeService,
  ) {}

  /** Ticket §18.1 — auto calculate for interrupted original driver segment. */
  async upsertCalculated(input: {
    ride_id: string;
    driver_id: string;
    calculated_amount: Prisma.Decimal | number | string;
    negligence_related?: boolean;
  }) {
    const amount = new Prisma.Decimal(input.calculated_amount);
    return this.prisma.goDriverEntitlement.upsert({
      where: {
        ride_id_driver_id: { ride_id: input.ride_id, driver_id: input.driver_id },
      },
      create: {
        ride_id: input.ride_id,
        driver_id: input.driver_id,
        calculated_amount: amount,
        status: GoDriverEntitlementStatus.CALCULATED,
        negligence_related: input.negligence_related ?? false,
      },
      update: {
        calculated_amount: amount,
        status: GoDriverEntitlementStatus.CALCULATED,
        negligence_related: input.negligence_related ?? false,
        approved_amount: null,
        reviewed_by_id: null,
        reviewed_at: null,
      },
    });
  }

  async markUnderReview(rideId: string, driverId: string) {
    return this.prisma.goDriverEntitlement.updateMany({
      where: { ride_id: rideId, driver_id: driverId },
      data: { status: GoDriverEntitlementStatus.UNDER_REVIEW, negligence_related: true },
    });
  }

  async list(actor: AuthUser, q: { page?: number; limit?: number; status?: GoDriverEntitlementStatus; branch_id?: string }) {
    this.assertFinance(actor);
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    return this.prisma.goDriverEntitlement.findMany({
      where: {
        status: q.status,
        ...(branchId ? { ride: { branch_id: branchId } } : {}),
      },
      orderBy: { created_at: 'desc' },
      include: {
        ride: { select: { id: true, public_number: true, status: true, branch_id: true } },
        driver: { select: { id: true, user: { select: { full_name: true, phone: true } } } },
      },
      ...pageSkip(q.page, q.limit),
    });
  }

  async get(actor: AuthUser, id: string) {
    this.assertFinance(actor);
    const row = await this.prisma.goDriverEntitlement.findUnique({
      where: { id },
      include: {
        ride: true,
        driver: { include: { user: { select: { full_name: true, phone: true } } } },
      },
    });
    if (!row) throw new GoException(GoErrorCode.NOT_FOUND, 'Entitlement not found');
    this.branchScope.assertAccess(actor, row.ride.branch_id);
    return row;
  }

  async approve(actor: AuthUser, id: string, body: { approved_amount: number; notes?: string }) {
    this.assertFinance(actor);
    const row = await this.get(actor, id);
    if (
      row.status !== GoDriverEntitlementStatus.CALCULATED &&
      row.status !== GoDriverEntitlementStatus.UNDER_REVIEW &&
      row.status !== GoDriverEntitlementStatus.PARTIAL
    ) {
      throw new GoException(GoErrorCode.CONFLICT, 'Entitlement cannot be approved in current status');
    }
    const approved = new Prisma.Decimal(body.approved_amount);
    const calculated = new Prisma.Decimal(row.calculated_amount);
    const status =
      approved.equals(0)
        ? GoDriverEntitlementStatus.REJECTED
        : approved.lessThan(calculated)
          ? GoDriverEntitlementStatus.PARTIAL
          : GoDriverEntitlementStatus.APPROVED;

    const updated = await this.prisma.goDriverEntitlement.update({
      where: { id },
      data: {
        approved_amount: approved,
        status,
        finance_notes: body.notes,
        reviewed_by_id: actor.id,
        reviewed_at: new Date(),
      },
    });
    await this.audit.log({
      actor,
      action: AuditAction.DRIVER_ENTITLEMENT_ADJUSTED,
      entity_type: 'GoDriverEntitlement',
      entity_id: id,
      metadata: { status, approved_amount: body.approved_amount, notes: body.notes ?? null },
    });
    return updated;
  }

  async reject(actor: AuthUser, id: string, body: { notes?: string } = {}) {
    this.assertFinance(actor);
    const row = await this.get(actor, id);
    if (
      row.status !== GoDriverEntitlementStatus.CALCULATED &&
      row.status !== GoDriverEntitlementStatus.UNDER_REVIEW &&
      row.status !== GoDriverEntitlementStatus.PARTIAL
    ) {
      throw new GoException(GoErrorCode.CONFLICT, 'Entitlement cannot be rejected in current status');
    }
    const updated = await this.prisma.goDriverEntitlement.update({
      where: { id },
      data: {
        approved_amount: new Prisma.Decimal(0),
        status: GoDriverEntitlementStatus.REJECTED,
        finance_notes: body.notes,
        reviewed_by_id: actor.id,
        reviewed_at: new Date(),
      },
    });
    await this.audit.log({
      actor,
      action: AuditAction.DRIVER_ENTITLEMENT_ADJUSTED,
      entity_type: 'GoDriverEntitlement',
      entity_id: id,
      metadata: { status: GoDriverEntitlementStatus.REJECTED, notes: body.notes ?? null },
    });
    return updated;
  }

  private assertFinance(actor: AuthUser) {
    if (
      actor.role !== GoRole.FINANCE &&
      actor.role !== GoRole.ADMIN &&
      actor.role !== GoRole.SUPER_ADMIN
    ) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, 'Finance role required');
    }
  }
}
