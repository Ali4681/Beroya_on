import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoDriverAvailability,
  GoDriverPhoneChangeStatus,
  GoLanguage,
  GoOtpPurpose,
  GoRole,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import type { AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { OtpService } from '../auth/otp.service';
import { SessionService } from '../auth/session.service';
import { ChatMediaStorage } from '../ride-chat/chat-media';
import { passportIconMime } from '../passport/passport-icon.storage';
import { ACTIVE_RIDE_STATUSES } from '../rides/ride-state-machine';
import { driverRating } from '../rides/ride-driver-card';
import { maskPhone } from '../stores/store-money';
import { DriverAvatarStorage } from './driver-avatar.storage';
import { driverPersonalFields } from './driver-profile.view';
import type { UpdateDriverProfileDto } from './dto/driver-profile.dto';

function phoneTaken() {
  const message = 'Another driver account already uses this phone';
  return new GoException(GoErrorCode.CONFLICT, message, { errors: [{ field: 'phone', messages: [message] }] });
}

const PENDING_KEY = (userId: string) => `driver:phone_change:${userId}`;

@Injectable()
export class DriverProfileService {
  private readonly otpTtlSec: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly avatars: DriverAvatarStorage,
    private readonly chatMedia: ChatMediaStorage,
    private readonly branchScope: BranchScopeService,
    private readonly realtime: RealtimeService,
    config: ConfigService,
  ) {
    this.otpTtlSec = config.getOrThrow<AppConfig>('app').otp.ttlSeconds;
  }

  async getMe(userId: string) {
    const profile = await this.requireProfile(userId);
    const [user, pending] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { phone: true, full_name: true },
      }),
      this.findPendingPhoneChange(profile.id),
    ]);
    return {
      ...driverPersonalFields(profile, await driverRating(this.prisma, userId)),
      phone: user.phone,
      full_name: user.full_name,
      phone_change_request: pending ? this.toPendingView(pending) : null,
    };
  }

  async updateMe(userId: string, dto: UpdateDriverProfileDto) {
    await this.requireProfile(userId);
    if (dto.preferred_language !== undefined) {
      await this.prisma.goDriverProfile.update({
        where: { user_id: userId },
        data: { preferred_language: dto.preferred_language },
      });
    }
    return this.getMe(userId);
  }

  /**
   * Soft-delete own driver account. Frees the phone for OTP re-registration.
   * Idempotent: repeating after delete returns the original deleted_at.
   */
  async deleteOwnAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, deleted_at: true },
    });
    if (!user || user.role !== GoRole.DRIVER) {
      throw new GoException(GoErrorCode.UNAUTHORIZED, 'Driver account required');
    }
    if (user.deleted_at) {
      return { ok: true as const, deleted_at: user.deleted_at };
    }

    const profile = await this.prisma.goDriverProfile.findUnique({
      where: { user_id: userId },
      select: { id: true, avatar_key: true, branch_id: true },
    });
    if (!profile) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');

    const activeRide = await this.prisma.goRide.findFirst({
      where: { driver_id: profile.id, status: { in: [...ACTIVE_RIDE_STATUSES] } },
      select: { id: true, status: true },
    });
    if (activeRide) {
      throw new GoException(GoErrorCode.ACTIVE_RIDE_EXISTS, 'Cannot delete account while an active ride exists', {
        ride_id: activeRide.id,
        ride_status: activeRide.status,
      });
    }

    const mediaKeys = (
      await this.prisma.goRideMessage.findMany({
        where: { sender_user_id: userId, media_key: { not: null } },
        select: { media_key: true },
      })
    )
      .map((m) => m.media_key)
      .filter((k): k is string => !!k);

    const avatarKey = profile.avatar_key;
    const deletedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          deleted_at: deletedAt,
          is_active: false,
          phone: null,
          full_name: null,
        },
      });

      await tx.goDriverProfile.update({
        where: { id: profile.id },
        data: {
          avatar_key: null,
          preferred_language: GoLanguage.AR,
          is_suspended: true,
          suspended_reason: 'ACCOUNT_DELETED',
          operational_blocked: true,
          operational_reason: 'ACCOUNT_DELETED',
        },
      });

      await tx.goDriverState.upsert({
        where: { driver_id: profile.id },
        create: {
          driver_id: profile.id,
          availability: GoDriverAvailability.OFFLINE,
          current_ride_id: null,
          next_ride_id: null,
        },
        update: {
          availability: GoDriverAvailability.OFFLINE,
          current_ride_id: null,
          next_ride_id: null,
        },
      });

      await tx.goUserSession.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: deletedAt },
      });
      await tx.goPushToken.deleteMany({ where: { user_id: userId } });
      await tx.goDriverNotification.deleteMany({ where: { user_id: userId } });

      await tx.goRideMessage.updateMany({
        where: { sender_user_id: userId },
        data: { text: null, media_key: null, media_mime: null, duration_sec: null },
      });

      await tx.goSupportMessage.updateMany({
        where: { driver_id: profile.id },
        data: {
          full_name: '[deleted]',
          phone: '+00000000000',
          email: null,
          message: '[deleted]',
          reply: null,
        },
      });

      await this.audit.log(
        {
          actor: { id: userId, role: GoRole.DRIVER },
          action: AuditAction.DRIVER_ACCOUNT_DELETED,
          entity_type: 'GoDriverProfile',
          entity_id: profile.id,
          branch_id: profile.branch_id,
          metadata: { user_id: userId, deleted_at: deletedAt.toISOString() },
        },
        tx,
      );
    });

    await this.avatars.remove(avatarKey);
    for (const key of mediaKeys) {
      try {
        await this.chatMedia.remove(key);
      } catch {
        /* invalid key already skipped by storage */
      }
    }
    await this.sessions.revokeAllForUser(userId);

    return { ok: true as const, deleted_at: deletedAt };
  }

  async requestPhoneChange(auth: AuthUser, phone: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.id },
      select: { phone: true },
    });
    if (phone === user.phone) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'New phone must differ from the current one', {
        errors: [{ field: 'phone', messages: ['New phone must differ from the current one'] }],
      });
    }
    const taken = await this.prisma.user.findUnique({
      where: { phone_role: { phone, role: GoRole.DRIVER } },
      select: { id: true },
    });
    if (taken) throw phoneTaken();

    const issued = await this.otp.issue(phone, GoOtpPurpose.DRIVER_PHONE_CHANGE);
    await this.redis.set(PENDING_KEY(auth.id), phone, this.otpTtlSec);
    return issued;
  }

  /**
   * OTP proves ownership of the new number only.
   * Creates a PENDING staff approval request — does NOT update User.phone.
   */
  async confirmPhoneChange(auth: AuthUser, phone: string, code: string) {
    const pendingOtp = await this.redis.get(PENDING_KEY(auth.id));
    if (!pendingOtp || pendingOtp !== phone) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Request a code for this phone first', {
        errors: [{ field: 'phone', messages: ['Request a code for this phone first'] }],
      });
    }

    await this.otp.verify(phone, GoOtpPurpose.DRIVER_PHONE_CHANGE, code);

    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.id },
      select: { phone: true },
    });
    if (!current.phone) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Current phone is missing');
    }
    if (phone === current.phone) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'New phone must differ from the current one');
    }
    const taken = await this.prisma.user.findUnique({
      where: { phone_role: { phone, role: GoRole.DRIVER } },
      select: { id: true },
    });
    if (taken && taken.id !== auth.id) throw phoneTaken();

    const profile = await this.prisma.goDriverProfile.findUniqueOrThrow({
      where: { user_id: auth.id },
      select: { id: true, branch_id: true },
    });

    const otp_verified_at = new Date();
    const request = await this.prisma.$transaction(async (tx) => {
      await tx.goDriverPhoneChangeRequest.updateMany({
        where: { driver_id: profile.id, status: GoDriverPhoneChangeStatus.PENDING },
        data: { status: GoDriverPhoneChangeStatus.CANCELLED, reviewed_at: otp_verified_at },
      });
      return tx.goDriverPhoneChangeRequest.create({
        data: {
          driver_id: profile.id,
          user_id: auth.id,
          branch_id: profile.branch_id,
          current_phone: current.phone!,
          requested_phone: phone,
          status: GoDriverPhoneChangeStatus.PENDING,
          otp_verified_at,
        },
      });
    });

    await this.redis.del(PENDING_KEY(auth.id));
    await this.audit.log({
      actor: auth,
      action: AuditAction.DRIVER_PHONE_CHANGE_REQUESTED,
      entity_type: 'go_driver_phone_change_request',
      entity_id: request.id,
      branch_id: profile.branch_id,
      metadata: {
        request_id: request.id,
        phone: { from: maskPhone(current.phone), to: maskPhone(phone) },
      },
    });

    return {
      status: 'PENDING_APPROVAL' as const,
      request_id: request.id,
      requested_phone: maskPhone(phone),
      created_at: request.created_at.toISOString(),
    };
  }

  async getPhoneChangeRequest(userId: string) {
    const profile = await this.requireProfile(userId);
    const pending = await this.findPendingPhoneChange(profile.id);
    return pending ? this.toPendingView(pending) : null;
  }

  async cancelPhoneChangeRequest(auth: AuthUser) {
    const profile = await this.requireProfile(auth.id);
    const pending = await this.findPendingPhoneChange(profile.id);
    if (!pending) throw new GoException(GoErrorCode.NOT_FOUND, 'No pending phone change request');

    const updated = await this.prisma.goDriverPhoneChangeRequest.update({
      where: { id: pending.id },
      data: { status: GoDriverPhoneChangeStatus.CANCELLED, reviewed_at: new Date() },
    });
    await this.audit.log({
      actor: auth,
      action: AuditAction.DRIVER_PHONE_CHANGE_CANCELLED,
      entity_type: 'go_driver_phone_change_request',
      entity_id: updated.id,
      branch_id: profile.branch_id ?? pending.branch_id,
      metadata: { request_id: updated.id, phone: { to: maskPhone(pending.requested_phone) } },
    });
    return { ok: true as const, request_id: updated.id, status: updated.status };
  }

  async listPhoneChangeRequests(
    actor: AuthUser,
    q: { page?: number; limit?: number; status?: GoDriverPhoneChangeStatus; branch_id?: string },
  ) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    const where: Prisma.GoDriverPhoneChangeRequestWhereInput = {
      branch_id: branchId,
      status: q.status,
    };
    const { skip, take } = pageSkip(q.page, q.limit);
    const [rows, total] = await Promise.all([
      this.prisma.goDriverPhoneChangeRequest.findMany({
        where,
        include: {
          driver: {
            select: {
              id: true,
              user: { select: { id: true, full_name: true, phone: true } },
            },
          },
          reviewed_by: { select: { id: true, full_name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.goDriverPhoneChangeRequest.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        driver_id: r.driver_id,
        user_id: r.user_id,
        branch_id: r.branch_id,
        current_phone: r.current_phone,
        requested_phone: r.requested_phone,
        otp_verified_at: r.otp_verified_at.toISOString(),
        reviewed_at: r.reviewed_at?.toISOString() ?? null,
        reject_reason: r.reject_reason,
        created_at: r.created_at.toISOString(),
        driver: {
          id: r.driver.id,
          full_name: r.driver.user.full_name,
          phone: r.driver.user.phone,
        },
        reviewed_by: r.reviewed_by
          ? { id: r.reviewed_by.id, full_name: r.reviewed_by.full_name }
          : null,
      })),
      page: skip / take + 1,
      limit: take,
      total,
      has_more: skip + rows.length < total,
    };
  }

  async approvePhoneChangeRequest(actor: AuthUser, requestId: string) {
    const request = await this.loadPhoneChangeForStaff(actor, requestId);
    if (request.status !== GoDriverPhoneChangeStatus.PENDING) {
      throw new GoException(GoErrorCode.CONFLICT, 'Request is not pending');
    }

    const taken = await this.prisma.user.findUnique({
      where: { phone_role: { phone: request.requested_phone, role: GoRole.DRIVER } },
      select: { id: true },
    });
    if (taken && taken.id !== request.user_id) throw phoneTaken();

    const reviewed_at = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user
        .update({
          where: { id: request.user_id },
          data: { phone: request.requested_phone },
        })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw phoneTaken();
          }
          throw error;
        });
      const updated = await tx.goDriverPhoneChangeRequest.updateMany({
        where: { id: request.id, status: GoDriverPhoneChangeStatus.PENDING },
        data: {
          status: GoDriverPhoneChangeStatus.APPROVED,
          reviewed_by_id: actor.id,
          reviewed_at,
        },
      });
      if (updated.count === 0) {
        throw new GoException(GoErrorCode.CONFLICT, 'Request is not pending');
      }
      await this.audit.log(
        {
          actor,
          action: AuditAction.DRIVER_PHONE_CHANGE_APPROVED,
          entity_type: 'go_driver_phone_change_request',
          entity_id: request.id,
          branch_id: request.branch_id,
          metadata: {
            request_id: request.id,
            driver_id: request.driver_id,
            phone: { from: maskPhone(request.current_phone), to: maskPhone(request.requested_phone) },
          },
        },
        tx,
      );
      await this.audit.log(
        {
          actor,
          action: AuditAction.DRIVER_PHONE_CHANGED,
          entity_type: 'go_driver_profile',
          entity_id: request.driver_id,
          branch_id: request.branch_id,
          metadata: {
            request_id: request.id,
            phone: { from: maskPhone(request.current_phone), to: maskPhone(request.requested_phone) },
            sessions_revoked: true,
            via: 'staff_approval',
          },
        },
        tx,
      );
    });

    await this.sessions.revokeAllForUser(request.user_id);
    this.realtime.emitToDriver(request.user_id, 'driver.phone_change_approved', {
      request_id: request.id,
      branch_id: request.branch_id,
      phone: maskPhone(request.requested_phone),
    });

    return this.getPhoneChangeRequestAdmin(request.id);
  }

  async rejectPhoneChangeRequest(actor: AuthUser, requestId: string, reason?: string) {
    const request = await this.loadPhoneChangeForStaff(actor, requestId);
    if (request.status !== GoDriverPhoneChangeStatus.PENDING) {
      throw new GoException(GoErrorCode.CONFLICT, 'Request is not pending');
    }

    const reviewed_at = new Date();
    const updated = await this.prisma.goDriverPhoneChangeRequest.updateMany({
      where: { id: request.id, status: GoDriverPhoneChangeStatus.PENDING },
      data: {
        status: GoDriverPhoneChangeStatus.REJECTED,
        reviewed_by_id: actor.id,
        reviewed_at,
        reject_reason: reason?.trim() || null,
      },
    });
    if (updated.count === 0) {
      throw new GoException(GoErrorCode.CONFLICT, 'Request is not pending');
    }

    await this.audit.log({
      actor,
      action: AuditAction.DRIVER_PHONE_CHANGE_REJECTED,
      entity_type: 'go_driver_phone_change_request',
      entity_id: request.id,
      branch_id: request.branch_id,
      metadata: {
        request_id: request.id,
        driver_id: request.driver_id,
        phone: { from: maskPhone(request.current_phone), to: maskPhone(request.requested_phone) },
        reason: reason?.trim() || null,
      },
    });

    this.realtime.emitToDriver(request.user_id, 'driver.phone_change_rejected', {
      request_id: request.id,
      branch_id: request.branch_id,
      reason: reason?.trim() || null,
    });

    return this.getPhoneChangeRequestAdmin(request.id);
  }

  async setAvatar(userId: string, image: string) {
    const current = await this.requireProfile(userId);
    const key = await this.avatars.save(current.id, image);
    await this.prisma.goDriverProfile.update({
      where: { id: current.id },
      data: { avatar_key: key },
    });
    return this.getMe(userId);
  }

  async removeAvatar(userId: string) {
    const current = await this.requireProfile(userId);
    await this.avatars.remove(current.avatar_key);
    await this.prisma.goDriverProfile.update({
      where: { id: current.id },
      data: { avatar_key: null },
    });
    return this.getMe(userId);
  }

  async readAvatar(userId: string) {
    const profile = await this.prisma.goDriverProfile.findUnique({
      where: { user_id: userId },
      select: { avatar_key: true },
    });
    const data = profile?.avatar_key ? await this.avatars.read(profile.avatar_key) : null;
    if (!profile?.avatar_key || !data) throw new GoException(GoErrorCode.NOT_FOUND, 'Avatar not found');
    return { data, mime: passportIconMime(profile.avatar_key) };
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.goDriverProfile.findUnique({
      where: { user_id: userId },
      select: {
        id: true,
        gender: true,
        avatar_key: true,
        updated_at: true,
        preferred_language: true,
        branch_id: true,
      },
    });
    if (!profile) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    return profile;
  }

  private async findPendingPhoneChange(driverId: string) {
    return this.prisma.goDriverPhoneChangeRequest.findFirst({
      where: { driver_id: driverId, status: GoDriverPhoneChangeStatus.PENDING },
      orderBy: { created_at: 'desc' },
    });
  }

  private toPendingView(row: {
    id: string;
    status: GoDriverPhoneChangeStatus;
    requested_phone: string;
    created_at: Date;
  }) {
    return {
      request_id: row.id,
      status: row.status,
      requested_phone: maskPhone(row.requested_phone),
      created_at: row.created_at.toISOString(),
    };
  }

  private async loadPhoneChangeForStaff(actor: AuthUser, requestId: string) {
    const request = await this.prisma.goDriverPhoneChangeRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new GoException(GoErrorCode.NOT_FOUND, 'Phone change request not found');
    if (request.branch_id) this.branchScope.assertAccess(actor, request.branch_id);
    else if (!this.branchScope.isGlobal(actor)) {
      throw new GoException(GoErrorCode.BRANCH_SCOPE_DENIED, 'Request has no branch');
    }
    return request;
  }

  private async getPhoneChangeRequestAdmin(requestId: string) {
    const r = await this.prisma.goDriverPhoneChangeRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: {
        driver: {
          select: { id: true, user: { select: { id: true, full_name: true, phone: true } } },
        },
        reviewed_by: { select: { id: true, full_name: true } },
      },
    });
    return {
      id: r.id,
      status: r.status,
      driver_id: r.driver_id,
      user_id: r.user_id,
      branch_id: r.branch_id,
      current_phone: r.current_phone,
      requested_phone: r.requested_phone,
      otp_verified_at: r.otp_verified_at.toISOString(),
      reviewed_at: r.reviewed_at?.toISOString() ?? null,
      reject_reason: r.reject_reason,
      created_at: r.created_at.toISOString(),
      driver: {
        id: r.driver.id,
        full_name: r.driver.user.full_name,
        phone: r.driver.user.phone,
      },
      reviewed_by: r.reviewed_by
        ? { id: r.reviewed_by.id, full_name: r.reviewed_by.full_name }
        : null,
    };
  }
}
