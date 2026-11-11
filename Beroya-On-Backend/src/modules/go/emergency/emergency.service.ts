import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  GoEmergencyRecordingStatus,
  GoEmergencySession,
  GoEmergencyStartedBy,
  GoEmergencyStatus,
  GoOperationalAlertType,
  GoRide,
  GoRideStatus,
  GoRole,
} from '@/generated/prisma/client';
import { Queue } from 'bullmq';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import type { AppConfig } from '../../../config/configuration';
import { EMERGENCY_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { LockService } from '../../../infra/redis/lock.service';
import { AlertsService } from '../alerts/alerts.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { EmergencyStorageService } from './emergency-storage.service';
import { customerEmergencyView, OPEN_EMERGENCY_STATUSES } from './emergency.view';

export const AUDIO_TOKEN_PURPOSE = 'emergency_audio';

/** The SOS button shows from driver assignment; danger can come before pickup. */
const EMERGENCY_RIDE_STATUSES: ReadonlySet<GoRideStatus> = new Set([
  GoRideStatus.DRIVER_ASSIGNED,
  GoRideStatus.DRIVER_EN_ROUTE,
  GoRideStatus.ARRIVED,
  GoRideStatus.IN_PROGRESS,
]);

const CS_ROLES = [GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR] as const;

/** Grace after close before auto-discarding unsaved temp audio (Ticket §29). */
const TEMP_CLEANUP_GRACE_MS = 5 * 60_000;

@Injectable()
export class EmergencyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmergencyService.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly realtime: RealtimeService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
    private readonly storage: EmergencyStorageService,
    private readonly jwt: JwtService,
    private readonly locks: LockService,
    @InjectQueue(QUEUES.EMERGENCY) private readonly emergencyQueue: Queue,
    config: ConfigService,
  ) {
    this.jwtSecret = config.getOrThrow<AppConfig>('app').jwt.accessSecret;
  }

  async onApplicationBootstrap() {
    const schedule = this.emergencyQueue.upsertJobScheduler(
      'emergency-temp-cleanup',
      { every: 60_000 },
      { name: EMERGENCY_JOBS.TEMP_CLEANUP },
    );
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([schedule, timeout]).catch((err: Error) =>
      this.logger.warn(`Could not register emergency cleanup scheduler (${err.message})`),
    );
  }

  /**
   * Ticket §29 — Temporary Emergency Audio Cleanup.
   * Do Not Save is immediate via discardRecording; this sweeper clears CLOSED
   * sessions left in PENDING_DECISION past the grace window.
   */
  async cleanupPendingTempAudio() {
    const cutoff = new Date(Date.now() - TEMP_CLEANUP_GRACE_MS);
    const stale = await this.prisma.goEmergencySession.findMany({
      where: {
        status: GoEmergencyStatus.CLOSED,
        recording_status: GoEmergencyRecordingStatus.PENDING_DECISION,
        ended_at: { lte: cutoff },
      },
      take: 100,
    });
    let cleaned = 0;
    for (const session of stale) {
      this.storage.discardTemp(session.id);
      await this.prisma.goEmergencySession.update({
        where: { id: session.id },
        data: {
          recording_status: GoEmergencyRecordingStatus.DELETED,
          recording_storage_key: null,
          deleted_at: new Date(),
        },
      });
      cleaned += 1;
    }
    if (cleaned > 0) {
      this.logger.log(`Cleaned ${cleaned} pending emergency temp recording(s)`);
    }
    return { cleaned };
  }

  /**
   * Opens an emergency for the customer's ride, or returns the one already open for it
   * (`already_active: true`) without alarming customer service again.
   */
  async startByCustomer(userId: string, rideId: string, loc?: { lat?: number; lng?: number }) {
    const customer = await this.prisma.goCustomerProfile.findUnique({ where: { user_id: userId } });
    if (!customer) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Customer profile not found');
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, customer_id: customer.id },
      include: { driver: { select: { user_id: true } } },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);

    return this.openOrReturnSession({
      ride,
      customerId: customer.id,
      customerUserId: userId,
      driverUserId: ride.driver?.user_id ?? null,
      startedBy: GoEmergencyStartedBy.CUSTOMER,
      loc,
    });
  }

  /** EMRG-001 — driver SOS; same GoEmergencySession as customer (one open per ride). */
  async startByDriver(userId: string, rideId: string, loc?: { lat?: number; lng?: number }) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { user_id: userId } });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, driver_id: driver.id },
      include: {
        customer: { select: { id: true, user_id: true } },
        driver: { select: { user_id: true } },
      },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);

    return this.openOrReturnSession({
      ride,
      customerId: ride.customer.id,
      customerUserId: ride.customer.user_id,
      driverUserId: userId,
      startedBy: GoEmergencyStartedBy.DRIVER,
      loc,
    });
  }

  private async openOrReturnSession(input: {
    ride: GoRide;
    customerId: string;
    customerUserId: string;
    driverUserId: string | null;
    startedBy: GoEmergencyStartedBy;
    loc?: { lat?: number; lng?: number };
  }) {
    const { ride, customerId, customerUserId, driverUserId, startedBy, loc } = input;
    return this.locks.withLock(
      `emergency-start:${ride.id}`,
      async () => {
        const open = await this.prisma.goEmergencySession.findFirst({
          where: { ride_id: ride.id, status: { in: OPEN_EMERGENCY_STATUSES } },
          orderBy: { started_at: 'desc' },
        });
        if (open) {
          const session =
            loc?.lat != null && loc?.lng != null ? await this.recordLocation(open, loc.lat, loc.lng) : open;
          return { ...customerEmergencyView(session), already_active: true };
        }
        if (!EMERGENCY_RIDE_STATUSES.has(ride.status)) {
          throw new GoException(
            GoErrorCode.RIDE_NOT_ACTIVE,
            'Emergency is allowed from DRIVER_ASSIGNED through IN_PROGRESS',
          );
        }

        const started_lat = loc?.lat ?? Number(ride.pickup_lat);
        const started_lng = loc?.lng ?? Number(ride.pickup_lng);
        if (!Number.isFinite(started_lat) || !Number.isFinite(started_lng)) {
          throw new GoException(GoErrorCode.VALIDATION_ERROR, 'lat/lng required for emergency start');
        }

        const session = await this.prisma.goEmergencySession.create({
          data: {
            ride_id: ride.id,
            customer_id: customerId,
            branch_id: ride.branch_id,
            started_by: startedBy,
            started_lat,
            started_lng,
            last_lat: started_lat,
            last_lng: started_lng,
            last_location_at: new Date(),
            recording_status: GoEmergencyRecordingStatus.LIVE,
          },
        });

        const payload = {
          emergency_id: session.id,
          ride_id: ride.id,
          ride_status: ride.status,
          started_lat,
          started_lng,
          started_by: startedBy,
        };
        this.realtime.emitToStaff(ride.branch_id, 'emergency.created', payload, CS_ROLES);
        this.realtime.emitToStaff(ride.branch_id, 'emergency.started', payload, CS_ROLES);
        this.realtime.emitToCustomer(customerUserId, 'emergency.started', payload);
        if (driverUserId) {
          this.realtime.emitToDriver(driverUserId, 'emergency.started', payload);
        }
        await this.alerts.raise({
          ride_id: ride.id,
          branch_id: ride.branch_id,
          type: GoOperationalAlertType.EMERGENCY,
          allowMultiple: true,
          metadata: { emergency_id: session.id, started_by: startedBy },
        });
        await this.audit.log({
          actor: {
            id: startedBy === GoEmergencyStartedBy.DRIVER ? (driverUserId ?? customerUserId) : customerUserId,
            role: startedBy === GoEmergencyStartedBy.DRIVER ? GoRole.DRIVER : GoRole.CUSTOMER,
            branch_id: ride.branch_id,
          },
          action: AuditAction.EMERGENCY_STARTED,
          entity_type: 'go_emergency_session',
          entity_id: session.id,
          branch_id: ride.branch_id,
          metadata: { ride_id: ride.id, started_by: startedBy },
        });
        return { ...customerEmergencyView(session), already_active: false };
      },
      { waitMs: 5000 },
    );
  }

  async updateCustomerLocation(userId: string, rideId: string, emergencyId: string, lat: number, lng: number) {
    const session = await this.requireCustomerSession(userId, emergencyId);
    if (session.ride_id !== rideId) throw new GoException(GoErrorCode.NOT_FOUND, 'Emergency not found');
    if (session.status === GoEmergencyStatus.CLOSED) {
      throw new GoException(GoErrorCode.EMERGENCY_NOT_ACTIVE, 'Emergency is closed');
    }
    return customerEmergencyView(await this.recordLocation(session, lat, lng));
  }

  async updateDriverLocation(userId: string, rideId: string, emergencyId: string, lat: number, lng: number) {
    const session = await this.requireDriverSession(userId, emergencyId);
    if (session.ride_id !== rideId) throw new GoException(GoErrorCode.RIDE_NOT_FOUND, 'Emergency not found');
    if (session.status === GoEmergencyStatus.CLOSED) {
      throw new GoException(GoErrorCode.EMERGENCY_NOT_ACTIVE, 'Emergency is closed');
    }
    return customerEmergencyView(await this.recordLocation(session, lat, lng));
  }

  private async recordLocation(session: GoEmergencySession, lat: number, lng: number) {
    const updated = await this.prisma.goEmergencySession.update({
      where: { id: session.id },
      data: { last_lat: lat, last_lng: lng, last_location_at: new Date() },
    });
    this.realtime.emitToStaff(
      session.branch_id,
      'emergency.location',
      { emergency_id: session.id, ride_id: session.ride_id, lat, lng, recorded_at: updated.last_location_at },
      CS_ROLES,
    );
    return updated;
  }

  async issueAudioToken(userId: string, emergencyId: string) {
    const session = await this.requireCustomerSession(userId, emergencyId);
    if (
      session.recording_status !== GoEmergencyRecordingStatus.LIVE &&
      session.recording_status !== GoEmergencyRecordingStatus.PENDING_DECISION
    ) {
      throw new GoException(GoErrorCode.EMERGENCY_NOT_ACTIVE, 'Recording session not live');
    }
    const token = await this.jwt.signAsync(
      { sub: userId, purpose: AUDIO_TOKEN_PURPOSE, emergency_id: emergencyId },
      { secret: this.jwtSecret, expiresIn: '10m' },
    );
    return {
      token,
      namespace: '/go/emergency-audio',
      emergency_id: emergencyId,
      expires_in_sec: 600,
      upload_path: `/api/v1/go/customer/emergencies/${emergencyId}/audio/chunk`,
    };
  }

  async appendAudioChunk(userId: string, emergencyId: string, dataBase64: string) {
    const session = await this.requireCustomerSession(userId, emergencyId);
    if (session.recording_status !== GoEmergencyRecordingStatus.LIVE) {
      throw new GoException(GoErrorCode.EMERGENCY_NOT_ACTIVE, 'Audio is not live');
    }
    const buf = Buffer.from(dataBase64, 'base64');
    if (buf.length === 0) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Empty chunk');
    if (buf.length > 256_000) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Chunk too large');
    const key = this.storage.appendTemp(emergencyId, buf);
    return { ok: true, bytes: buf.length, storage_key: key };
  }

  async stopAudioByCustomer(userId: string, emergencyId: string) {
    await this.requireCustomerSession(userId, emergencyId);
    return this.stopAudio(emergencyId);
  }

  async stopAudioByStaff(actor: AuthUser, emergencyId: string) {
    const session = await this.requireStaffSession(actor, emergencyId);
    return this.stopAudio(session.id);
  }

  private async stopAudio(emergencyId: string) {
    const session = await this.prisma.goEmergencySession.findUnique({ where: { id: emergencyId } });
    if (!session) throw new GoException(GoErrorCode.NOT_FOUND, 'Emergency not found');
    if (session.recording_status !== GoEmergencyRecordingStatus.LIVE) {
      return session;
    }
    return this.prisma.goEmergencySession.update({
      where: { id: emergencyId },
      data: {
        recording_status: GoEmergencyRecordingStatus.PENDING_DECISION,
        recording_storage_key: this.storage.tempKey(emergencyId),
      },
    });
  }

  async saveRecording(actor: AuthUser, emergencyId: string) {
    const session = await this.requireStaffSession(actor, emergencyId);
    if (
      session.recording_status !== GoEmergencyRecordingStatus.PENDING_DECISION &&
      session.recording_status !== GoEmergencyRecordingStatus.LIVE
    ) {
      throw new GoException(GoErrorCode.CONFLICT, 'Recording cannot be saved in current status');
    }
    if (session.recording_status === GoEmergencyRecordingStatus.LIVE) {
      await this.stopAudio(emergencyId);
    }
    const key = this.storage.promoteToSaved(emergencyId);
    const updated = await this.prisma.goEmergencySession.update({
      where: { id: emergencyId },
      data: {
        recording_status: GoEmergencyRecordingStatus.SAVED,
        recording_storage_key: key,
        saved_by_id: actor.id,
        saved_at: new Date(),
      },
    });
    await this.audit.log({
      actor,
      action: AuditAction.EMERGENCY_RECORDING_SAVED,
      entity_type: 'go_emergency_session',
      entity_id: emergencyId,
      branch_id: session.branch_id,
      metadata: { storage_key: key },
    });
    return updated;
  }

  async discardRecording(actor: AuthUser, emergencyId: string) {
    const session = await this.requireStaffSession(actor, emergencyId);
    if (session.recording_status === GoEmergencyRecordingStatus.SAVED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Use DELETE recording for saved files');
    }
    this.storage.discardTemp(emergencyId);
    return this.prisma.goEmergencySession.update({
      where: { id: emergencyId },
      data: {
        recording_status: GoEmergencyRecordingStatus.DELETED,
        recording_storage_key: null,
        deleted_by_id: actor.id,
        deleted_at: new Date(),
      },
    });
  }

  /** Resolve playable audio: saved file, or temp buffer awaiting save/discard. */
  private recordingBytes(session: {
    id: string;
    recording_status: GoEmergencyRecordingStatus;
    recording_storage_key: string | null;
  }): Buffer | null {
    const playable =
      session.recording_status === GoEmergencyRecordingStatus.SAVED ||
      session.recording_status === GoEmergencyRecordingStatus.PENDING_DECISION ||
      session.recording_status === GoEmergencyRecordingStatus.LIVE;
    if (!playable) return null;
    if (session.recording_storage_key) {
      const fromKey = this.storage.read(session.recording_storage_key);
      if (fromKey?.length) return fromKey;
    }
    if (session.recording_status !== GoEmergencyRecordingStatus.SAVED) {
      return this.storage.readTemp(session.id);
    }
    return null;
  }

  async getRecording(actor: AuthUser, emergencyId: string) {
    if (actor.role !== GoRole.CUSTOMER_SERVICE_SUPERVISOR && actor.role !== GoRole.SUPER_ADMIN) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, 'Supervisor only');
    }
    const session = await this.requireStaffSession(actor, emergencyId);
    const data = this.recordingBytes(session);
    if (!data?.length) {
      throw new GoException(GoErrorCode.RECORDING_NOT_SAVED, 'No recording available to play');
    }

    const stream_token = await this.jwt.signAsync(
      { sub: actor.id, purpose: 'emergency_playback', emergency_id: emergencyId },
      { secret: this.jwtSecret, expiresIn: '5m' },
    );
    await this.audit.log({
      actor,
      action: AuditAction.EMERGENCY_RECORDING_PLAYED,
      entity_type: 'go_emergency_session',
      entity_id: emergencyId,
      branch_id: session.branch_id,
      metadata: { recording_status: session.recording_status, preview: session.recording_status !== GoEmergencyRecordingStatus.SAVED },
    });
    // Ticket §15.7 — signed stream URL (+ base64 fallback for small stub files)
    const signed_url = `/api/v1/go/erp/emergencies/${emergencyId}/recording/stream?token=${encodeURIComponent(stream_token)}`;
    return {
      emergency_id: emergencyId,
      recording_status: session.recording_status,
      size_bytes: data.length,
      signed_url,
      stream_token,
      expires_in_sec: 300,
      content_base64: data.length <= 64_000 ? data.toString('base64') : undefined,
    };
  }

  /** Binary stream via short-lived playback token (Ticket §15.7). */
  async streamRecording(emergencyId: string, token: string) {
    let payload: { purpose?: string; emergency_id?: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.jwtSecret });
    } catch {
      throw new GoException(GoErrorCode.UNAUTHORIZED, 'Invalid or expired stream token');
    }
    if (payload.purpose !== 'emergency_playback' || payload.emergency_id !== emergencyId) {
      throw new GoException(GoErrorCode.UNAUTHORIZED, 'Invalid stream token');
    }
    const session = await this.prisma.goEmergencySession.findUnique({ where: { id: emergencyId } });
    if (!session) throw new GoException(GoErrorCode.NOT_FOUND, 'Emergency not found');
    const data = this.recordingBytes(session);
    if (!data?.length) {
      throw new GoException(GoErrorCode.RECORDING_NOT_SAVED, 'No recording available to play');
    }
    return data;
  }

  async deleteRecording(actor: AuthUser, emergencyId: string) {
    if (actor.role !== GoRole.CUSTOMER_SERVICE_SUPERVISOR && actor.role !== GoRole.SUPER_ADMIN) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, 'Supervisor only');
    }
    const session = await this.requireStaffSession(actor, emergencyId);
    if (session.recording_status !== GoEmergencyRecordingStatus.SAVED || !session.recording_storage_key) {
      throw new GoException(GoErrorCode.RECORDING_NOT_SAVED, 'No saved recording');
    }
    this.storage.deleteSaved(session.recording_storage_key);
    const updated = await this.prisma.goEmergencySession.update({
      where: { id: emergencyId },
      data: {
        recording_status: GoEmergencyRecordingStatus.DELETED,
        recording_storage_key: null,
        deleted_by_id: actor.id,
        deleted_at: new Date(),
      },
    });
    await this.audit.log({
      actor,
      action: AuditAction.EMERGENCY_RECORDING_DELETED,
      entity_type: 'go_emergency_session',
      entity_id: emergencyId,
      branch_id: session.branch_id,
    });
    return updated;
  }

  async get(actor: AuthUser, emergencyId: string) {
    const session = await this.prisma.goEmergencySession.findUnique({
      where: { id: emergencyId },
      include: {
        ride: {
          select: {
            id: true,
            public_number: true,
            status: true,
            pickup_address: true,
            driver: { select: { user: { select: { full_name: true } } } },
          },
        },
        customer: { select: { id: true, user: { select: { full_name: true, phone: true } } } },
        handled_by: { select: { id: true, full_name: true } },
        branch: { select: { id: true, name_ar: true, code: true } },
      },
    });
    if (!session) throw new GoException(GoErrorCode.NOT_FOUND, 'Emergency not found');
    this.branchScope.assertAccess(actor, session.branch_id);
    return session;
  }

  async issueStaffAudioToken(actor: AuthUser, emergencyId: string) {
    const session = await this.requireStaffSession(actor, emergencyId);
    if (
      session.recording_status !== GoEmergencyRecordingStatus.LIVE &&
      session.recording_status !== GoEmergencyRecordingStatus.PENDING_DECISION
    ) {
      throw new GoException(GoErrorCode.EMERGENCY_NOT_ACTIVE, 'Recording session not live');
    }
    const token = await this.jwt.signAsync(
      { sub: actor.id, purpose: AUDIO_TOKEN_PURPOSE, emergency_id: emergencyId },
      { secret: this.jwtSecret, expiresIn: '10m' },
    );
    return { token, namespace: '/go/emergency-audio', emergency_id: emergencyId, expires_in_sec: 600 };
  }

  async list(actor: AuthUser, q: { page?: number; limit?: number; status?: GoEmergencyStatus; branch_id?: string }) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    return this.prisma.goEmergencySession.findMany({
      where: { branch_id: branchId, status: q.status },
      orderBy: { started_at: 'desc' },
      include: {
        ride: { select: { id: true, public_number: true, status: true } },
        customer: { select: { id: true, user: { select: { full_name: true, phone: true } } } },
      },
      ...pageSkip(q.page, q.limit),
    });
  }

  async claim(actor: AuthUser, emergencyId: string) {
    const session = await this.requireStaffSession(actor, emergencyId);
    if (session.status !== GoEmergencyStatus.ACTIVE) {
      throw new GoException(GoErrorCode.CONFLICT, 'Emergency not active');
    }
    const updated = await this.prisma.goEmergencySession.update({
      where: { id: emergencyId },
      data: { status: GoEmergencyStatus.HANDLED, handled_by_id: actor.id, claimed_at: new Date() },
    });
    const claimedPayload = {
      emergency_id: emergencyId,
      handled_by_id: actor.id,
      claimed_at: updated.claimed_at,
    };
    this.realtime.emitToStaff(session.branch_id, 'emergency.claimed', claimedPayload);
    await this.emitEmergencyToRideParties(session.ride_id, session.customer_id, 'emergency.claimed', claimedPayload);
    await this.audit.log({
      actor,
      action: AuditAction.EMERGENCY_CLAIMED,
      entity_type: 'go_emergency_session',
      entity_id: emergencyId,
      branch_id: session.branch_id,
      metadata: { ride_id: session.ride_id },
    });
    return updated;
  }

  async close(actor: AuthUser, emergencyId: string) {
    const session = await this.requireStaffSession(actor, emergencyId);
    if (session.status === GoEmergencyStatus.CLOSED) {
      throw new GoException(GoErrorCode.CONFLICT, 'Already closed');
    }
    if (session.recording_status === GoEmergencyRecordingStatus.LIVE) {
      await this.stopAudio(emergencyId);
    }
    const updated = await this.prisma.goEmergencySession.update({
      where: { id: emergencyId },
      data: {
        status: GoEmergencyStatus.CLOSED,
        ended_at: new Date(),
        handled_by_id: session.handled_by_id ?? actor.id,
      },
    });
    const closedPayload = { emergency_id: emergencyId };
    this.realtime.emitToStaff(session.branch_id, 'emergency.closed', closedPayload);
    await this.emitEmergencyToRideParties(session.ride_id, session.customer_id, 'emergency.closed', closedPayload);
    await this.audit.log({
      actor,
      action: AuditAction.EMERGENCY_CLOSED,
      entity_type: 'go_emergency_session',
      entity_id: emergencyId,
      branch_id: session.branch_id,
      metadata: { ride_id: session.ride_id },
    });
    return updated;
  }

  private async emitEmergencyToRideParties(
    rideId: string,
    customerId: string,
    event: 'emergency.claimed' | 'emergency.closed',
    payload: unknown,
  ) {
    const [customer, ride] = await Promise.all([
      this.prisma.goCustomerProfile.findUnique({ where: { id: customerId }, select: { user_id: true } }),
      this.prisma.goRide.findUnique({
        where: { id: rideId },
        select: { driver: { select: { user_id: true } } },
      }),
    ]);
    if (customer) this.realtime.emitToCustomer(customer.user_id, event, payload);
    if (ride?.driver) this.realtime.emitToDriver(ride.driver.user_id, event, payload);
  }

  private async requireCustomerSession(userId: string, emergencyId: string) {
    const customer = await this.prisma.goCustomerProfile.findUnique({ where: { user_id: userId } });
    if (!customer) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Customer profile not found');
    const session = await this.prisma.goEmergencySession.findFirst({
      where: { id: emergencyId, customer_id: customer.id },
    });
    if (!session) throw new GoException(GoErrorCode.NOT_FOUND, 'Emergency not found');
    return session;
  }

  private async requireDriverSession(userId: string, emergencyId: string) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { user_id: userId } });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    const session = await this.prisma.goEmergencySession.findFirst({
      where: { id: emergencyId, ride: { driver_id: driver.id } },
    });
    if (!session) throw new GoException(GoErrorCode.RIDE_NOT_FOUND, 'Emergency not found');
    return session;
  }

  private async requireStaffSession(actor: AuthUser, emergencyId: string) {
    const session = await this.prisma.goEmergencySession.findUnique({ where: { id: emergencyId } });
    if (!session) throw new GoException(GoErrorCode.NOT_FOUND, 'Emergency not found');
    this.branchScope.assertAccess(actor, session.branch_id);
    return session;
  }
}
