import { Injectable } from '@nestjs/common';
import {
  GoAccidentSeverity,
  GoCaseStatus,
  GoCaseType,
  GoDriverEntitlementStatus,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';

const vehicleSelect = {
  id: true,
  plate_number: true,
  make: true,
  model: true,
  color: true,
  year: true,
  is_active: true,
  ride_category: { select: { id: true, name_ar: true, name_en: true, code: true } },
} as const;

const caseInclude = {
  notes: { orderBy: { created_at: 'desc' as const }, include: { author: { select: { id: true, full_name: true, role: true } } } },
  ride: {
    select: {
      id: true,
      public_number: true,
      status: true,
      vehicle_id: true,
      vehicle_snapshot: true,
      vehicle: { select: vehicleSelect },
    },
  },
  replacement_ride: { select: { id: true, public_number: true, status: true } },
  customer: { select: { id: true, user: { select: { full_name: true, phone: true } } } },
  driver: {
    select: {
      id: true,
      user: { select: { full_name: true, phone: true } },
      active_vehicle: { select: vehicleSelect },
    },
  },
};

type CaseVehicleRow = {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
  is_active: boolean;
  ride_category: { id: string; name_ar: string; name_en: string | null; code: string } | null;
};

type CaseVehicleSource = {
  ride: { vehicle: CaseVehicleRow | null; vehicle_snapshot: unknown } | null;
  driver: { active_vehicle: CaseVehicleRow | null } | null;
};

/** Prefer ride vehicle (assignment), then snapshot, then driver's current vehicle. */
function caseVehicleOf(c: CaseVehicleSource) {
  if (c.ride?.vehicle) return c.ride.vehicle;
  const snap = c.ride?.vehicle_snapshot;
  if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
    const s = snap as Record<string, unknown>;
    if (typeof s.plate_number === 'string') {
      return {
        id: typeof s.id === 'string' ? s.id : null,
        plate_number: s.plate_number,
        make: typeof s.make === 'string' ? s.make : null,
        model: typeof s.model === 'string' ? s.model : null,
        color: typeof s.color === 'string' ? s.color : null,
        year: typeof s.year === 'number' ? s.year : null,
        is_active: true,
        ride_category: null,
        from_snapshot: true as const,
      };
    }
  }
  return c.driver?.active_vehicle ?? null;
}

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  private async nextCaseNumber() {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.goRideCase.count({
      where: { created_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });
    return `CASE-${day}-${String(count + 1).padStart(5, '0')}`;
  }

  /** Ticket §16.3 — ACCIDENT / VEHICLE_BREAKDOWN from LONG_STOP resolve. */
  async ensureFromLongStopResolve(input: {
    alert_id: string;
    ride_id: string;
    branch_id: string;
    reason: string;
    lat?: number | null;
    lng?: number | null;
  }) {
    const type =
      input.reason === 'ACCIDENT'
        ? GoCaseType.ACCIDENT
        : input.reason === 'VEHICLE_BREAKDOWN'
          ? GoCaseType.BREAKDOWN
          : null;
    if (!type) return null;

    const existing = await this.prisma.goRideCase.findUnique({ where: { source_alert_id: input.alert_id } });
    if (existing) return existing;

    const ride = await this.prisma.goRide.findUnique({ where: { id: input.ride_id } });
    if (!ride) return null;

    const dupOpen = await this.prisma.goRideCase.findFirst({
      where: {
        ride_id: ride.id,
        type,
        status: { in: [GoCaseStatus.OPEN, GoCaseStatus.IN_REVIEW] },
      },
    });
    if (dupOpen) {
      return this.prisma.goRideCase.update({
        where: { id: dupOpen.id },
        data: { source_alert_id: dupOpen.source_alert_id ?? input.alert_id },
      });
    }

    const created = await this.prisma.goRideCase.create({
      data: {
        case_number: await this.nextCaseNumber(),
        ride_id: ride.id,
        branch_id: input.branch_id,
        customer_id: ride.customer_id,
        driver_id: ride.driver_id,
        type,
        reason_code: input.reason,
        source_alert_id: input.alert_id,
        latitude: input.lat ?? undefined,
        longitude: input.lng ?? undefined,
        occurred_at: new Date(),
      },
    });
    this.emitCaseCreated(input.branch_id, {
      case_id: created.id,
      ride_id: ride.id,
      type: created.type,
      alert_id: input.alert_id,
    });
    return created;
  }

  async list(
    actor: AuthUser,
    q: { page?: number; limit?: number; type?: GoCaseType; status?: GoCaseStatus; branch_id?: string },
  ) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    return this.prisma.goRideCase.findMany({
      where: { branch_id: branchId, type: q.type, status: q.status },
      orderBy: { created_at: 'desc' },
      include: {
        ride: { select: { id: true, public_number: true, status: true } },
        customer: { select: { id: true, user: { select: { full_name: true, phone: true } } } },
      },
      ...pageSkip(q.page, q.limit),
    });
  }

  private present<T extends CaseVehicleSource>(c: T) {
    return { ...c, vehicle: caseVehicleOf(c) };
  }

  async get(actor: AuthUser, caseId: string) {
    const c = await this.prisma.goRideCase.findUnique({
      where: { id: caseId },
      include: caseInclude,
    });
    if (!c) throw new GoException(GoErrorCode.NOT_FOUND, 'Case not found');
    this.branchScope.assertAccess(actor, c.branch_id);
    return this.present(c);
  }

  async update(
    actor: AuthUser,
    caseId: string,
    body: {
      status?: GoCaseStatus;
      accident_severity?: GoAccidentSeverity;
      negligence_suspected?: boolean;
      supervisor_decision?: string;
      reason_code?: string;
    },
  ) {
    const c = await this.get(actor, caseId);
    if (c.status === GoCaseStatus.CLOSED && body.status && body.status !== GoCaseStatus.CLOSED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Case is closed — use reopen');
    }
    const updated = await this.prisma.goRideCase.update({
      where: { id: caseId },
      data: {
        status: body.status === GoCaseStatus.CLOSED ? undefined : body.status,
        accident_severity: body.accident_severity,
        negligence_suspected: body.negligence_suspected,
        supervisor_decision: body.supervisor_decision,
        reason_code: body.reason_code,
      },
      include: caseInclude,
    });
    // Ticket §18.2 — suspected negligence → entitlement under review.
    if (body.negligence_suspected === true && c.driver_id) {
      await this.prisma.goDriverEntitlement.updateMany({
        where: { ride_id: c.ride_id, driver_id: c.driver_id },
        data: {
          negligence_related: true,
          status: GoDriverEntitlementStatus.UNDER_REVIEW,
        },
      });
    }
    this.realtime.emitToStaff(c.branch_id, 'case.updated', { case_id: caseId, status: updated.status });
    return this.present(updated);
  }

  async addCustomerStatement(actor: AuthUser, caseId: string, statement: string) {
    await this.get(actor, caseId);
    const updated = await this.prisma.goRideCase.update({
      where: { id: caseId },
      data: { customer_statement: statement },
      include: caseInclude,
    });
    return this.present(updated);
  }

  async addDriverStatement(actor: AuthUser, caseId: string, statement: string) {
    await this.get(actor, caseId);
    const updated = await this.prisma.goRideCase.update({
      where: { id: caseId },
      data: { driver_statement: statement },
      include: caseInclude,
    });
    return this.present(updated);
  }

  async addNote(actor: AuthUser, caseId: string, note: string) {
    const c = await this.get(actor, caseId);
    await this.prisma.goRideCaseNote.create({
      data: { case_id: caseId, author_id: actor.id, note },
    });
    return this.get(actor, caseId).then((fresh) => {
      this.realtime.emitToStaff(c.branch_id, 'case.note_added', { case_id: caseId });
      return fresh;
    });
  }

  async close(actor: AuthUser, caseId: string) {
    const c = await this.get(actor, caseId);
    if (c.status === GoCaseStatus.CLOSED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Case already closed');
    }
    const updated = await this.prisma.goRideCase.update({
      where: { id: caseId },
      data: {
        status: GoCaseStatus.CLOSED,
        closed_by_id: actor.id,
        closed_at: new Date(),
      },
      include: caseInclude,
    });
    await this.audit.log({
      actor,
      action: AuditAction.CASE_CLOSED,
      entity_type: 'GoRideCase',
      entity_id: caseId,
      branch_id: c.branch_id,
    });
    this.realtime.emitToStaff(c.branch_id, 'case.closed', { case_id: caseId });
    return this.present(updated);
  }

  async reopen(actor: AuthUser, caseId: string) {
    const c = await this.get(actor, caseId);
    if (c.status !== GoCaseStatus.CLOSED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Case is not closed');
    }
    const updated = await this.prisma.goRideCase.update({
      where: { id: caseId },
      data: {
        status: GoCaseStatus.IN_REVIEW,
        closed_by_id: null,
        closed_at: null,
      },
      include: caseInclude,
    });
    await this.audit.log({
      actor,
      action: AuditAction.CASE_REOPENED,
      entity_type: 'GoRideCase',
      entity_id: caseId,
      branch_id: c.branch_id,
    });
    this.realtime.emitToStaff(c.branch_id, 'case.reopened', { case_id: caseId });
    return this.present(updated);
  }

  async linkReplacement(rideId: string, replacementRideId: string) {
    await this.prisma.goRideCase.updateMany({
      where: {
        ride_id: rideId,
        type: { in: [GoCaseType.ACCIDENT, GoCaseType.BREAKDOWN] },
        replacement_ride_id: null,
      },
      data: { replacement_ride_id: replacementRideId },
    });
  }

  /** Ensure open case exists for replacement / driver breakdown (manual CS or driver path). */
  async ensureForReplacement(
    rideId: string,
    reason: 'ACCIDENT' | 'BREAKDOWN',
    opts?: { reason_code?: string; lat?: number; lng?: number; source?: string },
  ) {
    const type = reason === 'ACCIDENT' ? GoCaseType.ACCIDENT : GoCaseType.BREAKDOWN;
    const ride = await this.prisma.goRide.findUniqueOrThrow({ where: { id: rideId } });
    const existing = await this.prisma.goRideCase.findFirst({
      where: {
        ride_id: rideId,
        type: { in: [GoCaseType.ACCIDENT, GoCaseType.BREAKDOWN] },
        status: { in: [GoCaseStatus.OPEN, GoCaseStatus.IN_REVIEW] },
      },
    });
    if (existing) {
      return this.prisma.goRideCase.update({
        where: { id: existing.id },
        data: {
          type,
          reason_code: opts?.reason_code ?? existing.reason_code ?? reason,
          latitude: opts?.lat ?? existing.latitude,
          longitude: opts?.lng ?? existing.longitude,
        },
      });
    }
    const created = await this.prisma.goRideCase.create({
      data: {
        case_number: await this.nextCaseNumber(),
        ride_id: ride.id,
        branch_id: ride.branch_id,
        customer_id: ride.customer_id,
        driver_id: ride.driver_id,
        type,
        reason_code: opts?.reason_code ?? reason,
        latitude: opts?.lat,
        longitude: opts?.lng,
        occurred_at: new Date(),
      },
    });
    this.emitCaseCreated(ride.branch_id, {
      case_id: created.id,
      ride_id: ride.id,
      type: created.type,
      source: opts?.source ?? 'replacement',
    });
    return created;
  }

  /** Ticket §28.3 — typed aliases + generic case.created */
  private emitCaseCreated(
    branchId: string,
    payload: { case_id: string; ride_id: string; type: GoCaseType; alert_id?: string; source?: string },
  ) {
    this.realtime.emitToStaff(branchId, 'case.created', payload);
    if (payload.type === GoCaseType.ACCIDENT) {
      this.realtime.emitToStaff(branchId, 'accident_case.created', payload);
    }
    if (payload.type === GoCaseType.BREAKDOWN) {
      this.realtime.emitToStaff(branchId, 'breakdown_case.created', payload);
    }
  }
}
