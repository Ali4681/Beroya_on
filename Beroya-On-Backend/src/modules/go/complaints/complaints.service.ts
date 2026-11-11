import { Injectable } from '@nestjs/common';
import {
  GoComplaintPriority,
  GoComplaintStatus,
  GoOperationalAlertType,
  GoPassportScoreEventType,
  GoRideStatus,
  GoRole,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { LockService } from '../../../infra/redis/lock.service';
import { AlertsService } from '../alerts/alerts.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { PassportService } from '../passport/passport.service';
import { COMPLAINT_WINDOW_SEC, URGENT_REASON_CODES } from './complaint-reasons';

/** Customer-facing status (Ticket §20): CLOSED maps to RESOLVED; REJECTED reserved. */
function customerComplaintStatus(status: GoComplaintStatus): 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED' {
  if (status === GoComplaintStatus.OPEN) return 'OPEN';
  if (status === GoComplaintStatus.IN_REVIEW) return 'IN_REVIEW';
  if (status === GoComplaintStatus.RESOLVED) return 'RESOLVED';
  return 'RESOLVED';
}

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly realtime: RealtimeService,
    private readonly alerts: AlertsService,
    private readonly passport: PassportService,
    private readonly locks: LockService,
    private readonly audit: AuditService,
  ) {}

  /** One complaint per ride, on COMPLETED rides only, within COMPLAINT_WINDOW_SEC of completion. */
  async createByCustomer(userId: string, rideId: string, body: { reason_code: string; notes?: string }) {
    const customer = await this.prisma.goCustomerProfile.findUnique({ where: { user_id: userId } });
    if (!customer) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Customer profile not found');

    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, customer_id: customer.id },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    if (ride.status !== GoRideStatus.COMPLETED) {
      throw new GoException(GoErrorCode.COMPLAINT_NOT_ALLOWED, 'Complaints are accepted on completed rides only', {
        reason: 'RIDE_NOT_COMPLETED',
        status: ride.status,
      });
    }
    const allowedUntil = new Date((ride.completed_at ?? ride.updated_at).getTime() + COMPLAINT_WINDOW_SEC * 1000);
    if (Date.now() > allowedUntil.getTime()) {
      throw new GoException(GoErrorCode.COMPLAINT_NOT_ALLOWED, 'The complaint window for this ride has closed', {
        reason: 'WINDOW_EXPIRED',
        allowed_until: allowedUntil,
      });
    }

    const reason = body.reason_code;
    const priority = URGENT_REASON_CODES.has(reason)
      ? GoComplaintPriority.URGENT
      : GoComplaintPriority.NORMAL;

    const complaint = await this.locks.withLock(
      `complaint:${ride.id}:${customer.id}`,
      async () => {
        const existing = await this.prisma.goComplaint.findFirst({
          where: { ride_id: ride.id, customer_id: customer.id },
          orderBy: { created_at: 'desc' },
          select: { id: true, status: true, reason_code: true, created_at: true },
        });
        if (existing) {
          throw new GoException(GoErrorCode.COMPLAINT_ALREADY_EXISTS, 'A complaint was already filed for this ride', {
            complaint: existing,
          });
        }
        return this.prisma.goComplaint.create({
          data: {
            ride_id: ride.id,
            customer_id: customer.id,
            driver_id: ride.driver_id,
            branch_id: ride.branch_id,
            priority,
            reason_code: reason,
            notes: body.notes,
            submitted_during_ride: false,
          },
        });
      },
      { waitMs: 5000 },
    );

    const payload = {
      complaint_id: complaint.id,
      ride_id: ride.id,
      priority,
      reason_code: reason,
      submitted_during_ride: false,
    };
    // Ticket §14.1 — always notify staff.
    this.realtime.emitToStaff(ride.branch_id, 'complaint.created', payload);
    // Ticket §14.2 — URGENT only → CS + CS Supervisor + operational alert
    if (priority === GoComplaintPriority.URGENT) {
      const csRoles = [GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR] as const;
      this.realtime.emitToStaff(ride.branch_id, 'complaint.urgent', payload, csRoles);
      await this.alerts.raise({
        ride_id: ride.id,
        branch_id: ride.branch_id,
        type: GoOperationalAlertType.URGENT_COMPLAINT,
        allowMultiple: true,
        metadata: { complaint_id: complaint.id, reason_code: reason, priority },
      });
    }
    await this.audit.log({
      actor: { id: userId, role: GoRole.CUSTOMER, branch_id: ride.branch_id },
      action: AuditAction.COMPLAINT_CREATED,
      entity_type: 'go_complaint',
      entity_id: complaint.id,
      branch_id: ride.branch_id,
      metadata: { ride_id: ride.id, reason_code: reason, priority },
    });
    return complaint;
  }

  async list(actor: AuthUser, q: { page?: number; limit?: number; status?: GoComplaintStatus; priority?: GoComplaintPriority; branch_id?: string }) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    return this.prisma.goComplaint.findMany({
      where: { branch_id: branchId, status: q.status, priority: q.priority },
      orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
      include: {
        ride: { select: { id: true, public_number: true, status: true } },
        customer: { select: { id: true, user: { select: { full_name: true, phone: true } } } },
      },
      ...pageSkip(q.page, q.limit),
    });
  }

  /** Ticket §20 / §26 — customer complaint history (ride-linked). */
  async listMine(userId: string, page?: number, limit?: number) {
    const customer = await this.prisma.goCustomerProfile.findUnique({ where: { user_id: userId } });
    if (!customer) return [];
    const rows = await this.prisma.goComplaint.findMany({
      where: { customer_id: customer.id },
      orderBy: { created_at: 'desc' },
      ...pageSkip(page, limit),
      select: {
        id: true,
        ride_id: true,
        reason_code: true,
        notes: true,
        status: true,
        staff_notes: true,
        created_at: true,
        updated_at: true,
      },
    });
    return rows.map((c) => ({
      id: c.id,
      ride_id: c.ride_id,
      reason_code: c.reason_code,
      notes: c.notes,
      status: customerComplaintStatus(c.status),
      resolution_note: c.staff_notes,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));
  }

  async get(actor: AuthUser, complaintId: string) {
    const c = await this.prisma.goComplaint.findUnique({
      where: { id: complaintId },
      include: {
        ride: true,
        customer: { include: { user: { select: { full_name: true, phone: true } } } },
        driver: { include: { user: { select: { full_name: true, phone: true } } } },
      },
    });
    if (!c) throw new GoException(GoErrorCode.NOT_FOUND, 'Complaint not found');
    this.branchScope.assertAccess(actor, c.branch_id);
    return c;
  }

  async claim(actor: AuthUser, complaintId: string) {
    const c = await this.get(actor, complaintId);
    if (c.status !== GoComplaintStatus.OPEN && c.status !== GoComplaintStatus.IN_REVIEW) {
      throw new GoException(GoErrorCode.CONFLICT, 'Complaint cannot be claimed');
    }
    const updated = await this.prisma.goComplaint.update({
      where: { id: complaintId },
      data: {
        assigned_to_id: actor.id,
        status: GoComplaintStatus.IN_REVIEW,
      },
    });
    const payload = {
      complaint_id: complaintId,
      status: updated.status,
      assigned_to_id: actor.id,
    };
    this.realtime.emitToStaff(c.branch_id, 'complaint.updated', payload);
    this.realtime.emitToCustomer(c.customer.user_id, 'complaint.updated', payload);
    await this.audit.log({
      actor,
      action: AuditAction.COMPLAINT_CLAIMED,
      entity_type: 'go_complaint',
      entity_id: complaintId,
      branch_id: c.branch_id,
      metadata: { ride_id: c.ride_id, status: updated.status },
    });
    return updated;
  }

  async update(
    actor: AuthUser,
    complaintId: string,
    body: { status?: GoComplaintStatus; notes?: string },
  ) {
    const c = await this.get(actor, complaintId);
    if (c.status === GoComplaintStatus.CLOSED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Complaint is closed');
    }
    if (body.status === GoComplaintStatus.CLOSED) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Use POST .../close to close a complaint');
    }
    const updated = await this.prisma.goComplaint.update({
      where: { id: complaintId },
      data: {
        status: body.status,
        staff_notes: body.notes ?? c.staff_notes,
      },
    });
    const payload = { complaint_id: complaintId, status: updated.status };
    this.realtime.emitToStaff(c.branch_id, 'complaint.updated', payload);
    this.realtime.emitToCustomer(c.customer.user_id, 'complaint.updated', payload);
    await this.audit.log({
      actor,
      action: AuditAction.COMPLAINT_UPDATED,
      entity_type: 'go_complaint',
      entity_id: complaintId,
      branch_id: c.branch_id,
      metadata: { ride_id: c.ride_id, status: updated.status, notes_updated: body.notes != null },
    });
    return updated;
  }

  async close(actor: AuthUser, complaintId: string) {
    const c = await this.get(actor, complaintId);
    if (c.status === GoComplaintStatus.CLOSED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Already closed');
    }
    const updated = await this.prisma.goComplaint.update({
      where: { id: complaintId },
      data: {
        status: GoComplaintStatus.CLOSED,
        resolved_by_id: actor.id,
        resolved_at: new Date(),
      },
    });
    // Closing an urgent complaint confirms it for passport (streak not broken — Ticket §24).
    if (c.priority === GoComplaintPriority.URGENT) {
      const customer = await this.prisma.goCustomerProfile.findUnique({ where: { id: c.customer_id } });
      await this.passport.applyEvent({
        customerId: c.customer_id,
        eventType: GoPassportScoreEventType.CONFIRMED_COMPLAINT,
        rideId: c.ride_id,
        customerUserId: customer?.user_id,
        metadata: { complaint_id: complaintId },
      });
    }
    const payload = { complaint_id: complaintId, status: 'CLOSED' as const };
    this.realtime.emitToStaff(c.branch_id, 'complaint.updated', payload);
    this.realtime.emitToCustomer(c.customer.user_id, 'complaint.updated', payload);
    await this.audit.log({
      actor,
      action: AuditAction.COMPLAINT_CLOSED,
      entity_type: 'go_complaint',
      entity_id: complaintId,
      branch_id: c.branch_id,
      metadata: { ride_id: c.ride_id, priority: c.priority },
    });
    return updated;
  }
}
