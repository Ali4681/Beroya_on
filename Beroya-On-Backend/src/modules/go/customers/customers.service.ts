import { Injectable } from '@nestjs/common';
import {
  GoDiscountAudience,
  GoDriverGender,
  GoEmergencyStatus,
  GoRole,
  GoWalletTransactionType,
  Prisma,
} from '../../../generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import { CitiesService } from '../cities/cities.service';
import type { CreateCustomerDto } from '../drivers/dto/drivers.dto';
import { passportIconMime } from '../passport/passport-icon.storage';
import { ChatMediaStorage } from '../ride-chat/chat-media';
import { ACTIVE_RIDE_STATUSES } from '../rides/ride-state-machine';
import { CustomerAvatarStorage, customerProfileInclude, customerProfileView } from './customer-profile.view';
import type { UpdateCustomerProfileDto } from './dto/customer-profile.dto';

const OLDEST_BIRTH_DATE = new Date('1900-01-01T00:00:00Z');

/** Parses a validated YYYY-MM-DD; must be a past date from 1900 on. */
function birthDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date < OLDEST_BIRTH_DATE || date.getTime() > Date.now()) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'date_of_birth must be a past date from 1900 on', {
      errors: [{ field: 'date_of_birth', messages: ['date_of_birth must be a past date from 1900 on'] }],
    });
  }
  return date;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly branchScope: BranchScopeService,
    private readonly avatars: CustomerAvatarStorage,
    private readonly cities: CitiesService,
    private readonly sessions: SessionService,
    private readonly chatMedia: ChatMediaStorage,
  ) {}

  /** Ticket §1.3 / §36 — branch staff only see customers with rides in their branch. */
  list(actor: AuthUser, page = 1, limit = 20, requestedBranch?: string, includeDeleted = false) {
    const branchId = this.branchScope.resolveFilter(actor, requestedBranch);
    return this.prisma.goCustomerProfile.findMany({
      where: {
        ...(branchId ? { rides: { some: { branch_id: branchId } } } : {}),
        ...(includeDeleted ? {} : { user: { deleted_at: null } }),
      },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            full_name: true,
            is_active: true,
            deleted_at: true,
            created_at: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      ...pageSkip(page, limit),
    });
  }

  async get(actor: AuthUser, id: string) {
    const customer = await this.prisma.goCustomerProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, phone: true, full_name: true, is_active: true, created_at: true } },
        wallet: { select: { id: true, balance: true, updated_at: true } },
        rides: {
          take: 20,
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            public_number: true,
            status: true,
            type: true,
            scheduled_at: true,
            created_at: true,
            customer_payable: true,
            estimated_fare: true,
          },
        },
        complaints: {
          take: 20,
          orderBy: { created_at: 'desc' },
          select: { id: true, status: true, priority: true, created_at: true, ride_id: true },
        },
        passport: {
          include: { current_level: { select: { id: true, name_ar: true, name_en: true, minimum_score: true } } },
        },
        passport_stamps: {
          take: 50,
          orderBy: [{ earned_at: 'desc' }, { level: { level_order: 'desc' } }],
          include: {
            level: {
              select: {
                id: true,
                level_order: true,
                name_ar: true,
                name_en: true,
                stamp_name_ar: true,
                stamp_name_en: true,
                icon_storage_key: true,
              },
            },
          },
        },
        score_ledger: { take: 20, orderBy: { created_at: 'desc' } },
        discount_codes: { take: 20, orderBy: { created_at: 'desc' }, include: { categories: true } },
        reward_grants: { take: 20, orderBy: { created_at: 'desc' } },
      },
    });
    if (!customer) throw new GoException(GoErrorCode.NOT_FOUND, 'Customer not found');
    const levelId = customer.passport?.current_level_id;
    const shared = await this.prisma.goCustomerDiscountCode.findMany({
      where: {
        id: { notIn: customer.discount_codes.map((code) => code.id) },
        OR: [
          { holders: { some: { customer_id: id } } },
          ...(levelId ? [{ audience: GoDiscountAudience.STAMP, passport_level_id: levelId }] : []),
        ],
      },
      take: 20,
      orderBy: { created_at: 'desc' },
      include: { categories: true },
    });
    const { passport_stamps, ...rest } = customer;
    const stamps = passport_stamps.map((stamp) => ({
      id: stamp.id,
      earned_at: stamp.earned_at,
      expires_at: stamp.expires_at,
      level_id: stamp.level_id,
      name_ar: stamp.level.stamp_name_ar ?? stamp.level.name_ar,
      name_en: stamp.level.stamp_name_en ?? stamp.level.name_en,
      level: stamp.level,
    }));
    const withCodes = {
      ...rest,
      stamps,
      discount_codes: [...customer.discount_codes, ...shared].slice(0, 20),
    };
    const scope = this.branchScope.scopeOf(actor);
    if (scope !== null) {
      const inBranch = await this.prisma.goRide.findFirst({
        where: { customer_id: id, branch_id: scope },
        select: { id: true },
      });
      if (!inBranch) {
        throw new GoException(GoErrorCode.BRANCH_SCOPE_DENIED, 'Customer has no rides in your branch');
      }
    }
    return withCodes;
  }

  async getMe(userId: string) {
    const profile = await this.prisma.goCustomerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
      include: customerProfileInclude,
    });
    return customerProfileView(profile);
  }

  async updateMe(userId: string, dto: UpdateCustomerProfileDto) {
    const dateOfBirth = dto.date_of_birth ? birthDate(dto.date_of_birth) : dto.date_of_birth;
    let cityId: string | null | undefined = dto.city_id;
    let cityText: string | null | undefined = dto.city;

    if (dto.city_id !== undefined) {
      if (dto.city_id === null) {
        cityId = null;
        if (dto.city === undefined) cityText = null;
      } else {
        const city = await this.cities.requireActiveCity(dto.city_id);
        cityId = city.id;
        cityText = city.name_ar;
      }
    } else if (dto.city !== undefined) {
      if (dto.city === null) {
        cityId = null;
        cityText = null;
      } else {
        const match = await this.prisma.goCity.findFirst({
          where: { name_ar: dto.city, is_active: true },
        });
        cityId = match?.id ?? null;
        cityText = dto.city;
      }
    }

    const profile = await this.prisma.$transaction(async (tx) => {
      if (dto.full_name !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { full_name: dto.full_name } });
      }
      const data = {
        email: dto.email,
        city: cityText,
        city_id: cityId,
        gender: dto.gender,
        date_of_birth: dateOfBirth,
        preferred_currency: dto.preferred_currency,
        preferred_language: dto.preferred_language,
      };
      return tx.goCustomerProfile.upsert({
        where: { user_id: userId },
        create: { user_id: userId, ...data },
        update: data,
        include: customerProfileInclude,
      });
    });
    return customerProfileView(profile);
  }

  async setAvatar(userId: string, image: string) {
    const current = await this.ensureForUser(userId);
    const key = await this.avatars.save(current.id, image);
    const profile = await this.prisma.goCustomerProfile.update({
      where: { id: current.id },
      data: { avatar_key: key },
      include: customerProfileInclude,
    });
    return customerProfileView(profile);
  }

  async removeAvatar(userId: string) {
    const current = await this.ensureForUser(userId);
    await this.avatars.remove(current.avatar_key);
    const profile = await this.prisma.goCustomerProfile.update({
      where: { id: current.id },
      data: { avatar_key: null },
      include: customerProfileInclude,
    });
    return customerProfileView(profile);
  }

  async readAvatar(userId: string) {
    const profile = await this.prisma.goCustomerProfile.findUnique({
      where: { user_id: userId },
      select: { avatar_key: true },
    });
    const data = profile?.avatar_key ? await this.avatars.read(profile.avatar_key) : null;
    if (!profile?.avatar_key || !data) throw new GoException(GoErrorCode.NOT_FOUND, 'Avatar not found');
    return { data, mime: passportIconMime(profile.avatar_key) };
  }

  async create(actor: AuthUser, dto: CreateCustomerDto) {
    const existing = await this.prisma.user.findUnique({
      where: { phone_role: { phone: dto.phone, role: GoRole.CUSTOMER } },
    });
    if (existing) throw new GoException(GoErrorCode.CONFLICT, 'Customer already exists for this phone');

    const customer = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { phone: dto.phone, role: GoRole.CUSTOMER, full_name: dto.full_name },
      });
      return tx.goCustomerProfile.create({
        data: { user_id: user.id, notes: dto.notes },
        include: { user: { select: { id: true, phone: true, full_name: true, is_active: true } } },
      });
    });
    await this.audit.log({
      actor,
      action: 'customer.created',
      entity_type: 'go_customer_profile',
      entity_id: customer.id,
      metadata: { phone: dto.phone } as Prisma.InputJsonValue,
    });
    return customer;
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: { full_name?: string; notes?: string | null; user_is_active?: boolean },
  ) {
    const current = await this.get(actor, id);
    const admin = actor.role === GoRole.ADMIN || actor.role === GoRole.SUPER_ADMIN;
    if ((dto.full_name !== undefined || dto.user_is_active !== undefined) && !admin) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, 'Only an admin can change the account');
    }
    const customer = await this.prisma.$transaction(async (tx) => {
      if (dto.full_name !== undefined || dto.user_is_active !== undefined) {
        await tx.user.update({
          where: { id: current.user_id },
          data: {
            full_name: dto.full_name,
            is_active: dto.user_is_active,
          },
        });
      }
      return tx.goCustomerProfile.update({
        where: { id },
        data: { notes: dto.notes },
        include: { user: { select: { id: true, phone: true, full_name: true, is_active: true, created_at: true } } },
      });
    });
    await this.audit.log({
      actor,
      action: 'customer.updated',
      entity_type: 'go_customer_profile',
      entity_id: id,
      metadata: dto as Prisma.InputJsonValue,
    });
    return customer;
  }

  /** Ensure profile exists when customer OTP-registers (called from auth later or lazily). */
  async ensureForUser(userId: string) {
    return this.prisma.goCustomerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
    });
  }

  /**
   * Ticket §27 — soft-delete own account. Frees the phone for OTP re-registration.
   * Idempotent: repeating after delete returns the original deleted_at.
   */
  async deleteOwnAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, deleted_at: true },
    });
    if (!user || user.role !== GoRole.CUSTOMER) {
      throw new GoException(GoErrorCode.UNAUTHORIZED, 'Customer account required');
    }
    if (user.deleted_at) {
      return { ok: true as const, deleted_at: user.deleted_at };
    }

    const profile = await this.prisma.goCustomerProfile.findUnique({
      where: { user_id: userId },
      select: { id: true, avatar_key: true },
    });
    if (!profile) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Customer profile not found');

    const [activeRide, activeEmergency] = await Promise.all([
      this.prisma.goRide.findFirst({
        where: { customer_id: profile.id, status: { in: [...ACTIVE_RIDE_STATUSES] } },
        select: { id: true, status: true },
      }),
      this.prisma.goEmergencySession.findFirst({
        where: { customer_id: profile.id, status: GoEmergencyStatus.ACTIVE },
        select: { id: true },
      }),
    ]);
    if (activeRide || activeEmergency) {
      throw new GoException(GoErrorCode.ACTIVE_RIDE_EXISTS, 'Finish active rides and emergencies before deleting the account', {
        ride_id: activeRide?.id,
        ride_status: activeRide?.status,
        emergency_id: activeEmergency?.id,
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

      await tx.goCustomerProfile.update({
        where: { id: profile.id },
        data: {
          email: null,
          city: null,
          city_id: null,
          date_of_birth: null,
          gender: GoDriverGender.UNSPECIFIED,
          avatar_key: null,
          notes: null,
        },
      });

      await tx.goUserSession.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: deletedAt },
      });
      await tx.goPushToken.deleteMany({ where: { user_id: userId } });
      await tx.goCustomerNotification.deleteMany({ where: { user_id: userId } });

      await tx.goRide.updateMany({
        where: { customer_id: profile.id },
        data: {
          other_passenger_name: null,
          other_passenger_phone: null,
          pickup_sign_name: null,
          customer_note: null,
          tracking_token: null,
          share_tracking_link: false,
        },
      });

      await tx.goRideMessage.updateMany({
        where: { sender_user_id: userId },
        data: { text: null, media_key: null, media_mime: null, duration_sec: null },
      });

      const wallet = await tx.goCustomerWallet.findUnique({ where: { customer_id: profile.id } });
      if (wallet) {
        const balanceBefore = new Prisma.Decimal(wallet.balance);
        if (!balanceBefore.isZero()) {
          await tx.goCustomerWallet.update({
            where: { id: wallet.id },
            data: { balance: 0 },
          });
          await tx.goCustomerWalletTransaction.create({
            data: {
              wallet_id: wallet.id,
              customer_id: profile.id,
              type: GoWalletTransactionType.ADJUSTMENT,
              amount: balanceBefore,
              balance_before: balanceBefore,
              balance_after: 0,
              reason: 'ACCOUNT_DELETED',
              created_by_id: userId,
            },
          });
        }
      }

      // Personal loyalty / discounts (profile kept for ride FK; no cascade).
      await tx.goDiscountCodeRedemption.deleteMany({ where: { customer_id: profile.id } });
      await tx.goDiscountCodeCustomer.deleteMany({ where: { customer_id: profile.id } });
      await tx.goCustomerDiscountCode.deleteMany({ where: { customer_id: profile.id } });
      await tx.goPassportRewardGrant.deleteMany({ where: { customer_id: profile.id } });
      await tx.goCustomerPassportStamp.deleteMany({ where: { customer_id: profile.id } });
      await tx.goPassportScoreLedger.deleteMany({ where: { customer_id: profile.id } });
      await tx.goCustomerPassport.deleteMany({ where: { customer_id: profile.id } });

      await tx.goCustomerSavedPlace.deleteMany({ where: { customer_id: profile.id } });
      await tx.goSupportMessage.updateMany({
        where: { customer_id: profile.id },
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
          actor: { id: userId, role: GoRole.CUSTOMER },
          action: AuditAction.CUSTOMER_ACCOUNT_DELETED,
          entity_type: 'GoCustomerProfile',
          entity_id: profile.id,
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
    // Sessions already revoked in-tx; keep API parity with other disable paths.
    await this.sessions.revokeAllForUser(userId);

    return { ok: true as const, deleted_at: deletedAt };
  }
}
