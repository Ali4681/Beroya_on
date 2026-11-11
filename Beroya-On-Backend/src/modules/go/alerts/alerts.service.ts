import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  GoAlertSeverity,
  GoOperationalAlertStatus,
  GoOperationalAlertType,
  GoRole,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';

/** Alerts raised by the Command Center engine. Operations may resolve these; ride-monitoring alerts stay CS-only. */
export const COMMAND_CENTER_ALERT_TYPES: readonly GoOperationalAlertType[] = [
  GoOperationalAlertType.DRIVER_COVERAGE_LOW,
  GoOperationalAlertType.ASSIGNMENT_DELAYED,
  GoOperationalAlertType.RIDE_DELAYED,
  GoOperationalAlertType.CANCELLATION_RATE_HIGH,
];

const COMMAND_CENTER_RESOLVERS: readonly GoRole[] = [
  GoRole.OPERATIONS,
  GoRole.CUSTOMER_SERVICE_SUPERVISOR,
  GoRole.ADMIN,
  GoRole.SUPER_ADMIN,
];

const RIDE_ALERT_RESOLVERS: readonly GoRole[] = [
  GoRole.CUSTOMER_SERVICE,
  GoRole.CUSTOMER_SERVICE_SUPERVISOR,
  GoRole.SUPER_ADMIN,
];

export type RaiseAlertInput = {
  ride_id?: string | null;
  branch_id: string;
  type: GoOperationalAlertType;
  metadata?: Record<string, unknown>;
  occurrence_no?: number;
  allowMultiple?: boolean;
  severity?: GoAlertSeverity;
  h3_cell?: string | null;
  measured_value?: number | null;
  threshold?: number | null;
  /** With `dedupe_minutes`: an alert with this key created inside the window is returned instead of a new one. */
  dedupe_key?: string;
  dedupe_minutes?: number;
};

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly branchScope: BranchScopeService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => CasesService))
    private readonly cases: CasesService,
  ) {}

  /**
   * Creates an OPEN alert unless one of the same type is already open/claimed for the ride
   * (unless `allowMultiple` — used for repeated LONG_STOP occurrences).
   * Area alerts (no ride) dedupe on `dedupe_key`: an open one, or any one created inside `dedupe_minutes`.
   */
  async raise(input: RaiseAlertInput) {
    if (input.dedupe_key) {
      const since = new Date(Date.now() - (input.dedupe_minutes ?? 30) * 60_000);
      const existing = await this.prisma.goOperationalAlert.findFirst({
        where: {
          dedupe_key: input.dedupe_key,
          OR: [
            { status: { in: [GoOperationalAlertStatus.OPEN, GoOperationalAlertStatus.CLAIMED] } },
            { created_at: { gte: since } },
          ],
        },
        orderBy: { created_at: 'desc' },
      });
      if (existing) return existing;
    } else if (!input.allowMultiple && input.ride_id) {
      const existing = await this.prisma.goOperationalAlert.findFirst({
        where: {
          ride_id: input.ride_id,
          type: input.type,
          status: { in: [GoOperationalAlertStatus.OPEN, GoOperationalAlertStatus.CLAIMED] },
        },
      });
      if (existing) return existing;
    }

    const alert = await this.prisma.goOperationalAlert.create({
      data: {
        ride_id: input.ride_id ?? null,
        branch_id: input.branch_id,
        type: input.type,
        severity: input.severity ?? GoAlertSeverity.WARNING,
        h3_cell: input.h3_cell ?? null,
        measured_value: input.measured_value ?? null,
        threshold: input.threshold ?? null,
        dedupe_key: input.dedupe_key ?? null,
        occurrence_no: input.occurrence_no,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    const payload = {
      alert_id: alert.id,
      ride_id: alert.ride_id,
      branch_id: alert.branch_id,
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      h3_cell: alert.h3_cell,
      measured_value: alert.measured_value,
      threshold: alert.threshold,
      metadata: alert.metadata,
    };
    this.realtime.emitToStaff(input.branch_id, 'alert.created', payload);
    // Ticket §28.3 — typed aliases alongside generic alert.created
    if (input.type === GoOperationalAlertType.SCHEDULED_DRIVER_OFFLINE) {
      this.realtime.emitToStaff(input.branch_id, 'scheduled_driver.offline', payload);
    }
    if (input.type === GoOperationalAlertType.SCHEDULED_DRIVER_DELAY) {
      this.realtime.emitToStaff(input.branch_id, 'scheduled_driver.delay', payload);
    }
    if (input.type === GoOperationalAlertType.LONG_STOP) {
      this.realtime.emitToStaff(input.branch_id, 'long_stop.created', payload);
    }
    if (input.type === GoOperationalAlertType.LOCATION_STALE) {
      this.realtime.emitToStaff(input.branch_id, 'location_stale.created', payload);
    }
    if (input.type === GoOperationalAlertType.MAJOR_ROUTE_DEVIATION) {
      this.realtime.emitToStaff(input.branch_id, 'route_deviation.created', payload);
    }
    if (input.type === GoOperationalAlertType.REPLACEMENT_NEEDED) {
      this.realtime.emitToStaff(input.branch_id, 'replacement_needed.created', payload);
    }
    return alert;
  }

  /** Auto-resolve open/claimed alerts of a type (stale GPS / route deviation). */
  async autoResolve(rideId: string, type: GoOperationalAlertType) {
    const open = await this.prisma.goOperationalAlert.findMany({
      where: {
        ride_id: rideId,
        type,
        status: { in: [GoOperationalAlertStatus.OPEN, GoOperationalAlertStatus.CLAIMED] },
      },
    });
    for (const alert of open) {
      await this.prisma.goOperationalAlert.update({
        where: { id: alert.id },
        data: {
          status: GoOperationalAlertStatus.RESOLVED,
          resolved_at: new Date(),
          auto_resolved: true,
        },
      });
      this.realtime.emitToStaff(alert.branch_id, 'alert.resolved', {
        alert_id: alert.id,
        auto_resolved: true,
        type,
      });
    }
    return open.length;
  }

  async list(
    actor: AuthUser,
    q: {
      page?: number;
      limit?: number;
      type?: GoOperationalAlertType;
      status?: GoOperationalAlertStatus;
      severity?: GoAlertSeverity;
      ride_id?: string;
      branch_id?: string;
    },
  ) {
    const branchFilter = this.branchScope.resolveFilter(actor, q.branch_id);
    return this.prisma.goOperationalAlert.findMany({
      where: {
        branch_id: branchFilter,
        type: q.type,
        status: q.status,
        severity: q.severity,
        ride_id: q.ride_id,
      },
      orderBy: { started_at: 'desc' },
      include: {
        ride: {
          select: {
            id: true,
            public_number: true,
            scheduled_at: true,
            type: true,
            status: true,
            customer: { select: { user: { select: { full_name: true } } } },
            driver: { select: { user: { select: { full_name: true } } } },
          },
        },
        branch: { select: { id: true, code: true, name_ar: true } },
        claimed_by: { select: { id: true, full_name: true } },
      },
      ...pageSkip(q.page, q.limit),
    });
  }

  async claim(actor: AuthUser, alertId: string) {
    const alert = await this.prisma.goOperationalAlert.findUnique({ where: { id: alertId } });
    if (!alert) throw new GoException(GoErrorCode.NOT_FOUND, 'Alert not found');
    this.branchScope.assertAccess(actor, alert.branch_id);
    if (alert.status !== GoOperationalAlertStatus.OPEN) {
      throw new GoException(GoErrorCode.CONFLICT, 'Alert is not open');
    }
    const updated = await this.prisma.goOperationalAlert.update({
      where: { id: alertId },
      data: {
        status: GoOperationalAlertStatus.CLAIMED,
        claimed_by_id: actor.id,
        claimed_at: new Date(),
      },
    });
    await this.audit.log({
      actor,
      action: AuditAction.ALERT_ACKNOWLEDGED,
      entity_type: 'operational_alert',
      entity_id: alertId,
      branch_id: alert.branch_id,
      metadata: { type: alert.type },
    });
    this.realtime.emitToStaff(alert.branch_id, 'alert.claimed', { alert_id: alertId, claimed_by_id: actor.id });
    return updated;
  }

  async resolve(actor: AuthUser, alertId: string, body: { reason?: string; notes?: string }) {
    const alert = await this.prisma.goOperationalAlert.findUnique({ where: { id: alertId } });
    if (!alert) throw new GoException(GoErrorCode.NOT_FOUND, 'Alert not found');
    this.branchScope.assertAccess(actor, alert.branch_id);
    const resolvers = COMMAND_CENTER_ALERT_TYPES.includes(alert.type) ? COMMAND_CENTER_RESOLVERS : RIDE_ALERT_RESOLVERS;
    if (!resolvers.includes(actor.role)) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, `Role ${actor.role} cannot resolve ${alert.type} alerts`, {
        allowed_roles: resolvers,
      });
    }
    if (alert.status === GoOperationalAlertStatus.RESOLVED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Alert already resolved');
    }

    const LONG_STOP_REASONS = [
      'TRAFFIC',
      'VEHICLE_BREAKDOWN',
      'WAITING_FOR_CUSTOMER',
      'ACCIDENT',
      'ROAD_CLOSED',
      'CUSTOMER_REQUESTED_STOP',
      'OTHER',
    ] as const;
    if (alert.type === GoOperationalAlertType.LONG_STOP) {
      if (!body.reason || !(LONG_STOP_REASONS as readonly string[]).includes(body.reason)) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'LONG_STOP resolve requires a valid reason');
      }
      if (body.reason === 'OTHER' && !body.notes?.trim()) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'notes required when reason is OTHER');
      }
    }

    const updated = await this.prisma.goOperationalAlert.update({
      where: { id: alertId },
      data: {
        status: GoOperationalAlertStatus.RESOLVED,
        resolved_at: new Date(),
        claimed_by_id: alert.claimed_by_id ?? actor.id,
        claimed_at: alert.claimed_at ?? new Date(),
        metadata: {
          ...((alert.metadata as object) ?? {}),
          resolve_reason: body.reason ?? null,
          resolve_notes: body.notes ?? null,
          resolved_by_id: actor.id,
        } as Prisma.InputJsonValue,
      },
    });

    // Ticket §16.3 — auto-create ACCIDENT / BREAKDOWN case from LONG_STOP reason.
    if (
      alert.ride_id &&
      alert.type === GoOperationalAlertType.LONG_STOP &&
      (body.reason === 'ACCIDENT' || body.reason === 'VEHICLE_BREAKDOWN')
    ) {
      const ride = await this.prisma.goRide.findUnique({
        where: { id: alert.ride_id },
        include: { driver: { include: { state: true } } },
      });
      await this.cases.ensureFromLongStopResolve({
        alert_id: alert.id,
        ride_id: alert.ride_id,
        branch_id: alert.branch_id,
        reason: body.reason,
        lat: ride?.driver?.state?.last_lat != null ? Number(ride.driver.state.last_lat) : null,
        lng: ride?.driver?.state?.last_lng != null ? Number(ride.driver.state.last_lng) : null,
      });
    }

    await this.audit.log({
      actor,
      action: AuditAction.ALERT_RESOLVED,
      entity_type: 'operational_alert',
      entity_id: alertId,
      branch_id: alert.branch_id,
      metadata: { type: alert.type, reason: body.reason ?? null },
    });
    this.realtime.emitToStaff(alert.branch_id, 'alert.resolved', { alert_id: alertId });
    return updated;
  }
}
