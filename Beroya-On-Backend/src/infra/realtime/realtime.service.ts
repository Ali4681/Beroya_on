import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { GoRole } from '@/generated/prisma/client';
import type { Namespace } from 'socket.io';
import { redactForCustomer } from '../../common/privacy/customer-redaction';
import { redactForDriver } from '../../common/privacy/driver-redaction';
import { Rooms } from './rooms';
import { NotificationsService } from '../../modules/go/notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type NamespaceKey = 'customer' | 'driver' | 'staff';

/** Customer/driver events that staff already receive under the same name, are too frequent, or are private chat. */
const NO_STAFF_MIRROR = new Set([
  'ride.driver_location',
  'ride.location',
  'ride.message',
  'ride.messages_read',
  'eligibility.updated',
  'complaint.updated',
  'support.updated',
  'emergency.started',
  'emergency.claimed',
  'emergency.closed',
  'ride.created',
  'ride.replacement_created',
  'ride.compensation_applied',
  'wallet.pos_recharge',
  'wallet.pos_recharge_reversed',
  'driver.phone_change_approved',
  'driver.phone_change_rejected',
]);

/** Single entry point for pushing real-time events (Ticket §28). Domain services never touch sockets directly. */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly namespaces = new Map<NamespaceKey, Namespace>();

  constructor(
    @Inject(forwardRef(() => NotificationsService)) private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  register(key: NamespaceKey, ns: Namespace) {
    this.namespaces.set(key, ns);
  }

  emitToCustomer(userId: string, event: string, payload: unknown) {
    const safe = redactForCustomer(payload);
    this.emit('customer', [Rooms.user(userId)], event, safe);
    this.notifications.enqueue('customer', userId, event, safe);
    void this.notifications
      .persistCustomerInbox(userId, event, safe)
      .then((item) => {
        if (item) this.emit('customer', [Rooms.user(userId)], 'notification.created', item);
      })
      .catch((err: Error) => this.logger.warn(`Inbox persist failed for ${event}: ${err.message}`));
    this.mirrorToStaff(event, payload);
  }

  /** Socket-only emit to one customer (no push enqueue, no inbox write). */
  emitCustomerSocket(userId: string, event: string, payload: unknown) {
    this.emit('customer', [Rooms.user(userId)], event, payload);
  }

  emitToDriver(userId: string, event: string, payload: unknown) {
    const safe = redactForDriver(payload);
    this.emit('driver', [Rooms.user(userId)], event, safe);
    this.notifications.enqueue('driver', userId, event, safe);
    void this.notifications
      .persistDriverInbox(userId, event, safe)
      .then((item) => {
        if (item) this.emit('driver', [Rooms.user(userId)], 'notification.created', item);
      })
      .catch((err: Error) => this.logger.warn(`Driver inbox persist failed for ${event}: ${err.message}`));
    this.mirrorToStaff(event, safe);
  }

  /** Socket-only emit to one driver (no push enqueue, no inbox write). */
  emitDriverSocket(userId: string, event: string, payload: unknown) {
    this.emit('driver', [Rooms.user(userId)], event, payload);
  }

  /** Every connected socket in the namespace, including branch-scoped staff. */
  broadcast(keys: readonly NamespaceKey[], event: string, payload: unknown) {
    for (const key of keys) {
      const ns = this.namespaces.get(key);
      if (!ns) {
        this.logger.warn(`Namespace ${key} not ready; dropped ${event}`);
        continue;
      }
      ns.emit(event, payload);
    }
  }

  emitToStaffUser(userId: string, event: string, payload: unknown) {
    this.emit('staff', [Rooms.user(userId)], event, payload);
  }

  /**
   * Staff of the record's branch plus all global staff.
   * Pass `roles` to target only those roles (e.g. CS + CS Supervisor alarms).
   */
  emitToStaff(branchId: string, event: string, payload: unknown, roles?: readonly GoRole[]) {
    const rooms = roles?.length
      ? roles.flatMap((r) => [Rooms.branchRole(branchId, r), Rooms.globalRole(r)])
      : [Rooms.branch(branchId), Rooms.staffGlobal()];
    this.emit('staff', rooms, event, payload);
  }

  /** Global role rooms only (no branch) — e.g. account support messages. */
  emitToStaffRoles(roles: readonly GoRole[], event: string, payload: unknown) {
    this.emit(
      'staff',
      roles.map((r) => Rooms.globalRole(r)),
      event,
      payload,
    );
  }

  /**
   * Staff copy of a customer/driver event, limited to the record's branch plus global staff.
   * Events that cannot be tied to a branch go to global staff only, never to other branches.
   */
  private mirrorToStaff(event: string, payload: unknown) {
    if (NO_STAFF_MIRROR.has(event)) return;
    const branchId = stringField(payload, 'branch_id');
    if (branchId) {
      this.emitToStaff(branchId, event, payload);
      return;
    }
    const rideId = stringField(payload, 'ride_id');
    if (!rideId) {
      this.emit('staff', [Rooms.staffGlobal()], event, payload);
      return;
    }
    void this.prisma.goRide
      .findUnique({ where: { id: rideId }, select: { branch_id: true } })
      .then((ride) => {
        if (ride) this.emitToStaff(ride.branch_id, event, payload);
        else this.emit('staff', [Rooms.staffGlobal()], event, payload);
      })
      .catch((err: Error) => {
        this.logger.warn(`Branch lookup failed for ${event}: ${err.message}`);
        this.emit('staff', [Rooms.staffGlobal()], event, payload);
      });
  }

  private emit(key: NamespaceKey, rooms: string[], event: string, payload: unknown) {
    const ns = this.namespaces.get(key);
    if (!ns) {
      this.logger.warn(`Namespace ${key} not ready; dropped ${event}`);
      return;
    }
    ns.to(rooms).emit(event, payload);
  }
}

function stringField(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === 'string' && v ? v : null;
}
