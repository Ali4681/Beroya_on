import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  GoDiscountAudience,
  GoDiscountCodeStatus,
  GoRideDiscountReservationStatus,
  GoRideStatus,
  GoRideType,
  GoServiceCode,
  Prisma,
} from '@/generated/prisma/client';
import { Queue } from 'bullmq';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { DISCOUNT_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { discountAmount } from './discount-math';
import { decimalToNumber } from '../pricing/fare.calculator';
import { pointInServiceArea } from '../branches/branch-geo.util';

const adminInclude = {
  customer: { select: { id: true, user: { select: { full_name: true, phone: true } } } },
  passport_level: { select: { id: true, name_ar: true } },
  holders: { include: { customer: { select: { id: true, user: { select: { full_name: true, phone: true } } } } } },
  categories: true,
  services: { select: { service_code: true } },
  branch: { select: { id: true, code: true, name_ar: true } },
};

const codeCheckInclude = {
  categories: true,
  services: { select: { service_code: true } },
  holders: { select: { customer_id: true } },
  branch: { select: { id: true, name_ar: true, name_en: true, service_area: true } },
} satisfies Prisma.GoCustomerDiscountCodeInclude;

const LIVE_RESERVATIONS = [GoRideDiscountReservationStatus.RESERVED, GoRideDiscountReservationStatus.APPLIED];

function totalReached(used: number, limit: number | null) {
  return limit != null && used >= limit;
}

/** A code without linked services covers DAILY rides only. */
export function codeServices(code: { services: { service_code: GoServiceCode }[] }): GoServiceCode[] {
  return code.services.length ? code.services.map((s) => s.service_code) : [GoServiceCode.DAILY];
}

type LatLng = { lat: number; lng: number };

/** Where the ride starts and ends. Area-bound codes are only checked when a point is known. */
export type DiscountRideArea = { pickup?: LatLng; destination?: LatLng };

type CampaignInput = {
  max_customers?: number | null;
  per_customer_limit?: number | null;
  new_users_only?: boolean;
  branch_id?: string | null;
  event_name?: string | null;
  event_area?: Record<string, unknown> | null;
};

type CampaignRules = {
  id: string;
  max_customers: number | null;
  per_customer_limit: number | null;
  new_users_only: boolean;
};

export function publicCode(code: {
  id: string;
  code: string;
  name: string;
  percentage: Prisma.Decimal;
  maximum_discount_amount: Prisma.Decimal | null;
}) {
  return {
    discount_code_id: code.id,
    code: code.code,
    name: code.name,
    percentage: decimalToNumber(code.percentage),
    maximum_discount_amount: code.maximum_discount_amount ? decimalToNumber(code.maximum_discount_amount) : null,
  };
}

@Injectable()
export class DiscountsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DiscountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locks: LockService,
    private readonly realtime: RealtimeService,
    @InjectQueue(QUEUES.DISCOUNTS) private readonly discountQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    const schedule = this.discountQueue.upsertJobScheduler(
      'discount-expire',
      { every: 60_000 },
      { name: DISCOUNT_JOBS.EXPIRE_TICK },
    );
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([schedule, timeout]).catch((err: Error) =>
      this.logger.warn(`Could not register discount expire scheduler (${err.message})`),
    );
  }

  /** Ticket §29 — mark ACTIVE codes past expires_at as EXPIRED. */
  async expireTick() {
    const result = await this.prisma.goCustomerDiscountCode.updateMany({
      where: {
        status: GoDiscountCodeStatus.ACTIVE,
        expires_at: { lte: new Date() },
      },
      data: { status: GoDiscountCodeStatus.EXPIRED },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} discount code(s)`);
    }
    return result;
  }

  async listForCustomer(userId: string, service?: GoServiceCode) {
    const customer = await this.prisma.goCustomerProfile.findUnique({ where: { user_id: userId } });
    if (!customer) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Customer profile not found');
    const redemptions = await this.prisma.goDiscountCodeRedemption.findMany({
      where: { customer_id: customer.id },
      select: { discount_code_id: true, redeemed_at: true },
    });
    const redeemedAt = new Map(redemptions.map((r) => [r.discount_code_id, r.redeemed_at]));
    const codes = await this.usableCodes(customer.id);
    return codes
      .filter((c) => !service || codeServices(c).includes(service))
      .map((c) => this.toCustomerListItem(c, redeemedAt.get(c.id) ?? null))
      .sort((a, b) => {
        if (a.redeemed_at && b.redeemed_at) {
          return new Date(b.redeemed_at).getTime() - new Date(a.redeemed_at).getTime();
        }
        if (a.redeemed_at) return -1;
        if (b.redeemed_at) return 1;
        return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
      });
  }

  /**
   * Ticket §23 — activate a typed code on the account (no ride context, no usage_count++).
   * Idempotent: repeating the same code returns 200 with the existing redeemed_at.
   */
  async redeemForCustomer(userId: string, rawCode: string) {
    const codeText = rawCode?.trim() ?? '';
    if (!codeText || codeText.length > 32) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'code must be 1–32 characters');
    }
    const customer = await this.prisma.goCustomerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
    });
    const code = await this.prisma.goCustomerDiscountCode.findUnique({
      where: { code: codeText.toUpperCase() },
      include: {
        categories: { include: { ride_category: { select: { id: true, code: true, name_ar: true } } } },
        services: { select: { service_code: true } },
        holders: { select: { customer_id: true } },
        branch: { select: { id: true, code: true, name_ar: true } },
      },
    });
    const existing = code
      ? await this.prisma.goDiscountCodeRedemption.findUnique({
          where: { customer_id_discount_code_id: { customer_id: customer.id, discount_code_id: code.id } },
        })
      : null;
    if (existing && code) {
      return this.toCustomerListItem(code, existing.redeemed_at);
    }
    const usable = await this.assertRedeemable(code, customer.id);
    const redemption = await this.prisma.goDiscountCodeRedemption.create({
      data: { customer_id: customer.id, discount_code_id: usable.id },
    });
    return this.toCustomerListItem(usable, redemption.redeemed_at);
  }

  private toCustomerListItem(
    c: {
      id: string;
      code: string;
      name: string;
      name_en: string | null;
      percentage: Prisma.Decimal;
      maximum_discount_amount: Prisma.Decimal | null;
      expires_at: Date;
      usage_limit: number | null;
      usage_count: number;
      immediate_allowed: boolean;
      scheduled_allowed: boolean;
      categories: { ride_category: { id: string; code: string; name_ar: string } }[];
      services: { service_code: GoServiceCode }[];
      new_users_only: boolean;
      branch: { id: string; code: string; name_ar: string } | null;
      event_name: string | null;
    },
    redeemedAt: Date | null,
  ) {
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      name_en: c.name_en,
      percentage: decimalToNumber(c.percentage),
      maximum_discount_amount: c.maximum_discount_amount ? decimalToNumber(c.maximum_discount_amount) : null,
      expires_at: c.expires_at,
      remaining_uses: c.usage_limit == null ? null : c.usage_limit - c.usage_count,
      immediate_allowed: c.immediate_allowed,
      scheduled_allowed: c.scheduled_allowed,
      categories: c.categories.map((x) => x.ride_category),
      services: codeServices(c),
      new_users_only: c.new_users_only,
      branch: c.branch,
      event_name: c.event_name,
      redeemed_at: redeemedAt,
    };
  }

  /** Highest-percentage usable code per service for this customer (earliest expiry on ties). */
  async bestCodeByService(userId: string) {
    const best = new Map<GoServiceCode, { id: string; code: string; name: string; percentage: number; expires_at: Date }>();
    const customer = await this.prisma.goCustomerProfile.findUnique({ where: { user_id: userId }, select: { id: true } });
    if (!customer) return best;
    for (const c of await this.usableCodes(customer.id)) {
      const percentage = decimalToNumber(c.percentage);
      for (const service of codeServices(c)) {
        const current = best.get(service);
        if (current && current.percentage >= percentage) continue;
        best.set(service, { id: c.id, code: c.code, name: c.name, percentage, expires_at: c.expires_at });
      }
    }
    return best;
  }

  /** ACTIVE, in-window codes this customer may use now, ordered by expiry. Unlisted codes only after redeem. */
  private async usableCodes(customerId: string) {
    const passport = await this.prisma.goCustomerPassport.findUnique({
      where: { customer_id: customerId },
      select: { current_level_id: true },
    });
    const now = new Date();
    const codes = await this.prisma.goCustomerDiscountCode.findMany({
      where: {
        status: GoDiscountCodeStatus.ACTIVE,
        valid_from: { lte: now },
        expires_at: { gt: now },
        AND: [
          {
            OR: [
              { audience: GoDiscountAudience.ALL },
              {
                audience: GoDiscountAudience.CUSTOMERS,
                OR: [
                  { customer_id: customerId },
                  { holders: { some: { customer_id: customerId } } },
                ],
              },
              ...(passport
                ? [{ audience: GoDiscountAudience.STAMP, passport_level_id: passport.current_level_id }]
                : []),
            ],
          },
          {
            OR: [{ listed: true }, { redemptions: { some: { customer_id: customerId } } }],
          },
        ],
      },
      include: {
        categories: { include: { ride_category: { select: { id: true, code: true, name_ar: true } } } },
        services: { select: { service_code: true } },
        branch: { select: { id: true, code: true, name_ar: true } },
      },
      orderBy: { expires_at: 'asc' },
    });
    const usable: typeof codes = [];
    for (const c of codes) {
      if (totalReached(c.usage_count, c.usage_limit)) continue;
      try {
        await this.assertCustomerRules(c, customerId);
      } catch (err) {
        if (err instanceof GoException) continue;
        throw err;
      }
      usable.push(c);
    }
    return usable;
  }

  /**
   * Best unused passport-linked discount for the customer passport screen:
   * milestone grant codes, or STAMP-audience codes for the current level.
   * Highest percentage wins; sooner expiry breaks ties. Null when none.
   */
  async activePassportReward(customerId: string) {
    const codes = await this.usableCodes(customerId);
    let best: (typeof codes)[number] | null = null;
    let bestPct = -1;
    for (const c of codes) {
      const passportLinked =
        c.milestone_grant_id != null || c.audience === GoDiscountAudience.STAMP;
      if (!passportLinked) continue;
      const pct = decimalToNumber(c.percentage);
      if (
        !best ||
        pct > bestPct ||
        (pct === bestPct && c.expires_at.getTime() < best.expires_at.getTime())
      ) {
        best = c;
        bestPct = pct;
      }
    }
    if (!best) return null;
    return {
      label: `خصم ${bestPct}%`,
      percentage: bestPct,
      discount_code_id: best.id,
      code: best.code,
      expires_at: best.expires_at.toISOString(),
    };
  }

  async reserveForRide(input: {
    customerId: string;
    rideId: string;
    discountCodeId: string;
    rideCategoryId: string;
    rideType: GoRideType;
    serviceCode?: GoServiceCode;
    area?: DiscountRideArea;
  }) {
    return this.locks.withLock(`discount:${input.discountCodeId}`, async () => {
      const code = await this.prisma.goCustomerDiscountCode.findUnique({
        where: { id: input.discountCodeId },
        include: codeCheckInclude,
      });
      const usable = await this.assertUsable(code, input);

      return this.prisma.goRideDiscountReservation.create({
        data: {
          ride_id: input.rideId,
          discount_code_id: usable.id,
          status: GoRideDiscountReservationStatus.RESERVED,
        },
      });
    });
  }

  /** Finds a typed code and checks it for this customer and ride. Does not reserve it. */
  async resolveTypedCode(
    userId: string,
    input: {
      code: string;
      rideCategoryId: string;
      rideType: GoRideType;
      serviceCode?: GoServiceCode;
      area?: DiscountRideArea;
    },
  ) {
    const customer = await this.prisma.goCustomerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
    });
    const code = await this.prisma.goCustomerDiscountCode.findUnique({
      where: { code: input.code.trim().toUpperCase() },
      include: codeCheckInclude,
    });
    return this.assertUsable(code, { ...input, customerId: customer.id });
  }

  /** Server-side price check for a typed code (POST /customer/discount-codes/validate). */
  async validateForCustomer(
    userId: string,
    input: {
      code: string;
      rideCategoryId: string;
      rideType: GoRideType;
      serviceCode?: GoServiceCode;
      estimatedFare?: number;
      area?: DiscountRideArea;
    },
  ) {
    const code = await this.resolveTypedCode(userId, input);
    const fare = input.estimatedFare != null ? new Prisma.Decimal(input.estimatedFare) : null;
    const amount = fare ? discountAmount(fare, code.percentage, code.maximum_discount_amount) : null;
    return {
      ...publicCode(code),
      discount_amount: amount ? decimalToNumber(amount) : null,
      final_fare: fare && amount ? decimalToNumber(fare.minus(amount)) : null,
    };
  }

  async releaseForRide(rideId: string) {
    await this.prisma.goRideDiscountReservation.updateMany({
      where: { ride_id: rideId, status: GoRideDiscountReservationStatus.RESERVED },
      data: { status: GoRideDiscountReservationStatus.RELEASED, released_at: new Date() },
    });
  }

  /** Move a RESERVED discount from an interrupted ride onto its replacement. */
  async transferReservation(
    fromRideId: string,
    toRideId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const reservation = await tx.goRideDiscountReservation.findFirst({
      where: { ride_id: fromRideId, status: GoRideDiscountReservationStatus.RESERVED },
    });
    if (!reservation) return null;
    return tx.goRideDiscountReservation.update({
      where: { id: reservation.id },
      data: { ride_id: toRideId },
    });
  }

  /**
   * Service promotion % — customer pays less; gross fare (driver base) stays full; company absorbs.
   * Personal discount codes on the ride win over this.
   */
  async amountForService(
    serviceCode: GoServiceCode | null | undefined,
    grossFare: Prisma.Decimal | number | string,
    now = new Date(),
  ) {
    if (!serviceCode) return new Prisma.Decimal(0);
    const service = await this.prisma.goService.findUnique({
      where: { code: serviceCode },
      select: { promotion_label_ar: true, promotion_percentage: true, promotion_expires_at: true },
    });
    if (
      !service?.promotion_label_ar ||
      service.promotion_percentage == null ||
      (service.promotion_expires_at && service.promotion_expires_at <= now)
    ) {
      return new Prisma.Decimal(0);
    }
    return discountAmount(grossFare, service.promotion_percentage, null);
  }

  /** Amount that would apply. Does not consume the code. */
  async preview(rideId: string, grossFare: Prisma.Decimal | number | string) {
    const reservation = await this.prisma.goRideDiscountReservation.findUnique({
      where: { ride_id: rideId },
      include: { discount_code: true },
    });
    if (
      reservation &&
      (reservation.status === GoRideDiscountReservationStatus.RESERVED ||
        reservation.status === GoRideDiscountReservationStatus.APPLIED)
    ) {
      const code = reservation.discount_code;
      const amount = discountAmount(grossFare, code.percentage, code.maximum_discount_amount);
      const state =
        reservation.status === GoRideDiscountReservationStatus.APPLIED ? ('APPLIED' as const) : ('RESERVED' as const);
      return { amount, state };
    }
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      select: { service_code: true },
    });
    const promo = await this.amountForService(ride?.service_code, grossFare);
    if (promo.gt(0)) return { amount: promo, state: 'PROMO' as const };
    return { amount: new Prisma.Decimal(0), state: 'NONE' as const };
  }

  /** Release a reservation, or return a consumed use when staff keeps compensation only. */
  async releaseOrRevert(rideId: string) {
    const reservation = await this.prisma.goRideDiscountReservation.findUnique({
      where: { ride_id: rideId },
      include: { discount_code: true },
    });
    if (!reservation || reservation.status === GoRideDiscountReservationStatus.RELEASED) return;
    await this.prisma.$transaction(async (tx) => {
      if (reservation.status === GoRideDiscountReservationStatus.APPLIED) {
        const code = reservation.discount_code;
        const usage = Math.max(0, code.usage_count - 1);
        await tx.goCustomerDiscountCode.update({
          where: { id: code.id },
          data: {
            usage_count: usage,
            status: !totalReached(usage, code.usage_limit) && code.expires_at > new Date() ? GoDiscountCodeStatus.ACTIVE : code.status,
          },
        });
      }
      await tx.goRideDiscountReservation.update({
        where: { id: reservation.id },
        data: { status: GoRideDiscountReservationStatus.RELEASED, released_at: new Date() },
      });
    });
  }

  /** Apply to final fare; returns discount amount. */
  async applyOnComplete(rideId: string, grossFare: Prisma.Decimal | number | string) {
    const reservation = await this.prisma.goRideDiscountReservation.findUnique({
      where: { ride_id: rideId },
      include: { discount_code: true },
    });
    if (!reservation || reservation.status !== GoRideDiscountReservationStatus.RESERVED) {
      return new Prisma.Decimal(0);
    }

    return this.locks.withLock(`discount:${reservation.discount_code_id}`, async () => {
      const fresh = await this.prisma.goRideDiscountReservation.findUnique({
        where: { id: reservation.id },
        include: { discount_code: true },
      });
      if (!fresh || fresh.status !== GoRideDiscountReservationStatus.RESERVED) {
        return new Prisma.Decimal(0);
      }
      const code = fresh.discount_code;
      const now = new Date();
      if (
        code.status !== GoDiscountCodeStatus.ACTIVE ||
        totalReached(code.usage_count, code.usage_limit) ||
        code.expires_at <= now
      ) {
        await this.releaseForRide(rideId);
        return new Prisma.Decimal(0);
      }

      const discount = discountAmount(grossFare, code.percentage, code.maximum_discount_amount);

      await this.prisma.$transaction(async (tx) => {
        await tx.goRideDiscountReservation.update({
          where: { id: fresh.id },
          data: { status: GoRideDiscountReservationStatus.APPLIED, applied_at: new Date() },
        });
        const updated = await tx.goCustomerDiscountCode.update({
          where: { id: code.id },
          data: { usage_count: { increment: 1 } },
        });
        if (totalReached(updated.usage_count, updated.usage_limit)) {
          await tx.goCustomerDiscountCode.update({
            where: { id: code.id },
            data: { status: GoDiscountCodeStatus.CONSUMED },
          });
        }
      });
      return discount;
    });
  }

  async adminList() {
    const rows = await this.prisma.goCustomerDiscountCode.findMany({
      orderBy: { created_at: 'desc' },
      include: adminInclude,
      take: 100,
    });
    return rows.map((row) => this.toAdminRow(row));
  }

  async adminGet(discountId: string) {
    const row = await this.prisma.goCustomerDiscountCode.findUnique({
      where: { id: discountId },
      include: adminInclude,
    });
    if (!row) throw new GoException(GoErrorCode.NOT_FOUND, 'Discount code not found');
    const people = await this.prisma.goRide.findMany({
      where: { discount_reservation: { is: { discount_code_id: row.id, status: { in: LIVE_RESERVATIONS } } } },
      distinct: ['customer_id'],
      select: { customer_id: true },
    });
    return { ...this.toAdminRow(row), customers_count: people.length };
  }

  private toAdminRow(row: any) {
    return {
      id: row.id,
      name: row.name,
      name_en: row.name_en ?? null,
      code: row.code,
      audience: row.audience,
      scope: this.scopeLabel(row),
      percentage: decimalToNumber(row.percentage),
      maximum_discount_amount: row.maximum_discount_amount ? decimalToNumber(row.maximum_discount_amount) : null,
      usage_limit: row.usage_limit,
      usage_count: row.usage_count,
      max_customers: row.max_customers,
      per_customer_limit: row.per_customer_limit,
      new_users_only: row.new_users_only,
      branch_id: row.branch_id,
      branch: row.branch,
      event_name: row.event_name,
      event_area: row.event_area,
      status: row.status,
      listed: row.listed,
      valid_from: row.valid_from,
      expires_at: row.expires_at,
      immediate_allowed: row.immediate_allowed,
      scheduled_allowed: row.scheduled_allowed,
      categories: row.categories,
      service_codes: row.services.map((s: { service_code: GoServiceCode }) => s.service_code),
      customer_ids: this.holderIds(row),
      passport_level_id: row.passport_level_id,
      created_at: row.created_at,
    };
  }

  async adminCreate(
    actor: AuthUser,
    body: {
      name: string;
      name_en?: string | null;
      code: string;
      percentage: number;
      maximum_discount_amount?: number;
      valid_from: string;
      expires_at: string;
      usage_limit?: number | null;
      immediate_allowed?: boolean;
      scheduled_allowed?: boolean;
      listed?: boolean;
      ride_category_ids?: string[];
      service_codes?: GoServiceCode[];
      audience?: GoDiscountAudience;
      customer_ids?: string[];
      passport_level_id?: string;
    } & CampaignInput,
  ) {
    if (body.percentage <= 0 || body.percentage > 100) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'percentage must be 0–100');
    }
    const target = await this.resolveAudience(body.audience, body.customer_ids, body.passport_level_id);
    const campaign = await this.resolveCampaign(body, null);
    const usageLimit = this.usageLimitFor(body.usage_limit, campaign.max_customers, campaign.per_customer_limit);
    const created = await this.prisma.goCustomerDiscountCode.create({
      data: {
        ...campaign,
        audience: target.audience,
        customer_id: target.customer_id,
        passport_level_id: target.passport_level_id,
        holders: target.customer_ids.length
          ? { create: target.customer_ids.map((customer_id) => ({ customer_id })) }
          : undefined,
        code: body.code.trim().toUpperCase(),
        name: body.name,
        name_en: body.name_en?.trim() || null,
        percentage: body.percentage,
        maximum_discount_amount: body.maximum_discount_amount,
        valid_from: new Date(body.valid_from),
        expires_at: new Date(body.expires_at),
        usage_limit: usageLimit,
        immediate_allowed: body.immediate_allowed ?? true,
        scheduled_allowed: body.scheduled_allowed ?? true,
        listed: body.listed ?? true,
        created_by_id: actor.id,
        categories: body.ride_category_ids?.length
          ? { create: body.ride_category_ids.map((id) => ({ ride_category_id: id })) }
          : undefined,
        services: body.service_codes?.length
          ? { create: [...new Set(body.service_codes)].map((service_code) => ({ service_code })) }
          : undefined,
      },
      include: { categories: true, services: { select: { service_code: true } } },
    });
    await this.audit.log({
      actor,
      action: AuditAction.DISCOUNT_CODE_CHANGED,
      entity_type: 'GoCustomerDiscountCode',
      entity_id: created.id,
      metadata: { action: 'create', audience: target.audience, customer_ids: target.customer_ids },
    });
    // Secret (unlisted) codes are not pushed — customers must type them to redeem.
    if (created.listed) {
      for (const userId of target.notify_user_ids) {
        this.realtime.emitToCustomer(userId, 'discount_code.available', {
          discount_code_id: created.id,
          code: created.code,
          percentage: body.percentage,
        });
      }
    }
    return created;
  }

  async adminPatch(
    actor: AuthUser,
    discountId: string,
    body: {
      name?: string;
      name_en?: string | null;
      percentage?: number;
      maximum_discount_amount?: number | null;
      expires_at?: string;
      usage_limit?: number | null;
      immediate_allowed?: boolean;
      scheduled_allowed?: boolean;
      listed?: boolean;
      ride_category_ids?: string[];
      service_codes?: GoServiceCode[];
      audience?: GoDiscountAudience;
      customer_ids?: string[];
      passport_level_id?: string | null;
    } & CampaignInput,
  ) {
    const existing = await this.prisma.goCustomerDiscountCode.findUnique({ where: { id: discountId } });
    if (!existing) throw new GoException(GoErrorCode.NOT_FOUND);
    const campaign = await this.resolveCampaign(body, existing);
    const maxCustomers = campaign.max_customers === undefined ? existing.max_customers : campaign.max_customers;
    const perCustomer = campaign.per_customer_limit === undefined ? existing.per_customer_limit : campaign.per_customer_limit;
    let explicit = body.usage_limit;
    if (explicit === undefined && maxCustomers == null) {
      explicit = existing.max_customers != null ? null : existing.usage_limit;
    }
    const usageLimit =
      body.usage_limit !== undefined || campaign.max_customers !== undefined || campaign.per_customer_limit !== undefined
        ? this.usageLimitFor(explicit, maxCustomers, perCustomer)
        : undefined;
    const retarget = body.audience != null || body.customer_ids != null || body.passport_level_id !== undefined;
    const target = retarget
      ? await this.resolveAudience(
          body.audience ?? existing.audience,
          body.customer_ids ?? undefined,
          body.passport_level_id === null ? undefined : body.passport_level_id ?? existing.passport_level_id ?? undefined,
        )
      : null;
    const updated = await this.prisma.goCustomerDiscountCode.update({
      where: { id: discountId },
      data: {
        ...campaign,
        name: body.name,
        name_en: body.name_en === undefined ? undefined : body.name_en?.trim() || null,
        percentage: body.percentage,
        maximum_discount_amount: body.maximum_discount_amount,
        expires_at: body.expires_at ? new Date(body.expires_at) : undefined,
        usage_limit: usageLimit,
        immediate_allowed: body.immediate_allowed,
        scheduled_allowed: body.scheduled_allowed,
        listed: body.listed,
        audience: target?.audience,
        customer_id: target ? target.customer_id : undefined,
        passport_level_id: target ? target.passport_level_id : undefined,
        holders: target
          ? { deleteMany: {}, create: target.customer_ids.map((customer_id) => ({ customer_id })) }
          : undefined,
        categories: body.ride_category_ids
          ? { deleteMany: {}, create: body.ride_category_ids.map((id) => ({ ride_category_id: id })) }
          : undefined,
        services: body.service_codes
          ? { deleteMany: {}, create: [...new Set(body.service_codes)].map((service_code) => ({ service_code })) }
          : undefined,
      },
      include: { categories: true, services: { select: { service_code: true } } },
    });
    await this.audit.log({
      actor,
      action: AuditAction.DISCOUNT_CODE_CHANGED,
      entity_type: 'GoCustomerDiscountCode',
      entity_id: discountId,
      metadata: { action: 'update' },
    });
    return updated;
  }

  async deactivate(actor: AuthUser, discountId: string) {
    const updated = await this.prisma.goCustomerDiscountCode.update({
      where: { id: discountId },
      data: { status: GoDiscountCodeStatus.INACTIVE },
    });
    await this.audit.log({
      actor,
      action: AuditAction.DISCOUNT_CODE_CHANGED,
      entity_type: 'GoCustomerDiscountCode',
      entity_id: discountId,
      metadata: { action: 'deactivate' },
    });
    return updated;
  }

  async activate(actor: AuthUser, discountId: string) {
    const code = await this.prisma.goCustomerDiscountCode.findUnique({ where: { id: discountId } });
    if (!code) throw new GoException(GoErrorCode.NOT_FOUND);
    if (code.status === GoDiscountCodeStatus.CONSUMED || totalReached(code.usage_count, code.usage_limit)) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_USAGE_EXHAUSTED, 'Cannot reactivate exhausted code');
    }
    if (code.expires_at <= new Date()) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_EXPIRED);
    }
    const updated = await this.prisma.goCustomerDiscountCode.update({
      where: { id: discountId },
      data: { status: GoDiscountCodeStatus.ACTIVE },
    });
    await this.audit.log({
      actor,
      action: AuditAction.DISCOUNT_CODE_CHANGED,
      entity_type: 'GoCustomerDiscountCode',
      entity_id: discountId,
      metadata: { action: 'activate' },
    });
    return updated;
  }

  async adminRemove(actor: AuthUser, discountId: string) {
    const existing = await this.prisma.goCustomerDiscountCode.findUnique({ where: { id: discountId } });
    if (!existing) throw new GoException(GoErrorCode.NOT_FOUND, 'Discount code not found');
    const inUse = await this.prisma.goRideDiscountReservation.count({
      where: {
        discount_code_id: discountId,
        status: { in: [GoRideDiscountReservationStatus.RESERVED, GoRideDiscountReservationStatus.APPLIED] },
      },
    });
    if (inUse > 0) {
      throw new GoException(GoErrorCode.CONFLICT, 'Cannot delete a discount code used on rides');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.goRideDiscountReservation.deleteMany({ where: { discount_code_id: discountId } });
      await tx.goCustomerDiscountCode.delete({ where: { id: discountId } });
    });
    await this.audit.log({
      actor,
      action: AuditAction.DISCOUNT_CODE_CHANGED,
      entity_type: 'GoCustomerDiscountCode',
      entity_id: discountId,
      metadata: { action: 'delete', code: existing.code },
    });
    return { success: true };
  }

  private holderIds(row: { customer_id: string | null; holders: { customer_id: string }[] }) {
    return [...new Set([row.customer_id, ...row.holders.map((holder) => holder.customer_id)].filter((id): id is string => !!id))];
  }

  private scopeLabel(row: {
    audience: GoDiscountAudience;
    customer: { user: { full_name: string | null; phone: string | null } } | null;
    passport_level: { name_ar: string } | null;
    holders: { customer: { user: { full_name: string | null; phone: string | null } } }[];
    max_customers: number | null;
    new_users_only: boolean;
    branch: { name_ar: string } | null;
    event_name: string | null;
  }) {
    const rules = [
      row.new_users_only ? 'مستخدمون جدد' : null,
      row.max_customers != null ? `أول ${row.max_customers} شخص` : null,
      row.branch ? `محافظة ${row.branch.name_ar}` : null,
      row.event_name ? `فعالية ${row.event_name}` : null,
    ].filter((rule): rule is string => !!rule);
    return [this.audienceLabel(row), ...rules].filter(Boolean).join(' · ');
  }

  private audienceLabel(row: {
    audience: GoDiscountAudience;
    customer: { user: { full_name: string | null; phone: string | null } } | null;
    passport_level: { name_ar: string } | null;
    holders: { customer: { user: { full_name: string | null; phone: string | null } } }[];
  }) {
    if (row.audience === GoDiscountAudience.ALL) return 'للكل';
    if (row.audience === GoDiscountAudience.STAMP) return row.passport_level?.name_ar ?? 'ختم';
    const names = row.holders
      .map((holder) => holder.customer.user.full_name || holder.customer.user.phone)
      .filter((name): name is string => !!name);
    if (!names.length && row.customer) {
      const fallback = row.customer.user.full_name || row.customer.user.phone;
      if (fallback) names.push(fallback);
    }
    return names.join('، ');
  }

  /**
   * Redeem checks: existence/audience, ACTIVE window, usage/customer caps.
   * Does not check category, ride type, service, or area — those run at booking.
   */
  private async assertRedeemable<
    T extends CampaignRules & {
      status: GoDiscountCodeStatus;
      expires_at: Date;
      valid_from: Date;
      usage_count: number;
      usage_limit: number | null;
      audience: GoDiscountAudience;
      customer_id: string | null;
      passport_level_id: string | null;
      holders: { customer_id: string }[];
    },
  >(code: T | null, customerId: string): Promise<T> {
    if (!code || !(await this.customerCanUse(code, customerId))) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_INVALID, 'Discount code not found for customer');
    }
    const now = new Date();
    if (code.status === GoDiscountCodeStatus.EXPIRED || code.expires_at <= now || code.valid_from > now) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_EXPIRED);
    }
    if (code.status === GoDiscountCodeStatus.CONSUMED || totalReached(code.usage_count, code.usage_limit)) {
      this.limitReached(code);
    }
    if (code.status !== GoDiscountCodeStatus.ACTIVE) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_INVALID, 'Discount code inactive');
    }
    await this.assertCustomerRules(code, customerId);
    return code;
  }

  private async assertUsable(
    code: Prisma.GoCustomerDiscountCodeGetPayload<{ include: typeof codeCheckInclude }> | null,
    input: {
      customerId: string;
      rideCategoryId: string;
      rideType: GoRideType;
      serviceCode?: GoServiceCode;
      area?: DiscountRideArea;
    },
  ) {
    if (!code || !(await this.customerCanUse(code, input.customerId))) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_INVALID, 'Discount code not found for customer');
    }
    const now = new Date();
    if (code.status === GoDiscountCodeStatus.EXPIRED || code.expires_at <= now || code.valid_from > now) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_EXPIRED);
    }
    if (code.status === GoDiscountCodeStatus.CONSUMED) {
      this.limitReached(code);
    }
    if (code.status !== GoDiscountCodeStatus.ACTIVE) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_INVALID, 'Discount code inactive');
    }
    await this.assertCustomerRules(code, input.customerId);
    const openReserved = await this.prisma.goRideDiscountReservation.count({
      where: { discount_code_id: code.id, status: GoRideDiscountReservationStatus.RESERVED },
    });
    if (totalReached(code.usage_count + openReserved, code.usage_limit)) {
      this.limitReached(code);
    }
    if (input.rideType === GoRideType.IMMEDIATE && !code.immediate_allowed) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_RIDE_TYPE);
    }
    if (input.rideType === GoRideType.SCHEDULED && !code.scheduled_allowed) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_RIDE_TYPE);
    }
    const serviceCode = input.serviceCode ?? GoServiceCode.DAILY;
    if (!codeServices(code).includes(serviceCode)) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_SERVICE, undefined, {
        services: codeServices(code),
      });
    }
    if (code.categories.length > 0 && !code.categories.some((c) => c.ride_category_id === input.rideCategoryId)) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_CATEGORY);
    }
    this.assertArea(code, input.area);
    return code;
  }

  /** "First N people" codes tell late customers the offer is over. */
  private limitReached(code: { max_customers: number | null }): never {
    if (code.max_customers != null) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_EXPIRED, undefined, {
        code_detail: 'CUSTOMER_LIMIT_REACHED',
        reason: 'CUSTOMER_LIMIT_REACHED',
      });
    }
    throw new GoException(GoErrorCode.DISCOUNT_CODE_USAGE_EXHAUSTED);
  }

  /** New-user, per-customer and first-N-people rules. Reserved and applied rides both hold a slot. */
  private async assertCustomerRules(code: CampaignRules, customerId: string) {
    if (code.new_users_only) {
      const completed = await this.prisma.goRide.count({
        where: { customer_id: customerId, status: GoRideStatus.COMPLETED },
      });
      if (completed > 0) {
        throw new GoException(GoErrorCode.DISCOUNT_CODE_NEW_USERS_ONLY);
      }
    }
    if (code.max_customers == null && code.per_customer_limit == null) return;
    const rides = await this.prisma.goRide.findMany({
      where: { discount_reservation: { is: { discount_code_id: code.id, status: { in: LIVE_RESERVATIONS } } } },
      select: { customer_id: true },
    });
    const mine = rides.filter((ride) => ride.customer_id === customerId).length;
    if (code.per_customer_limit != null && mine >= code.per_customer_limit) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_USAGE_EXHAUSTED, undefined, {
        code_detail: 'PER_CUSTOMER_LIMIT_REACHED',
        reason: 'PER_CUSTOMER_LIMIT_REACHED',
      });
    }
    if (code.max_customers != null && mine === 0) {
      const people = new Set(rides.map((ride) => ride.customer_id)).size;
      if (people >= code.max_customers) this.limitReached(code);
    }
  }

  private assertArea(
    code: {
      branch_id: string | null;
      branch: { name_ar: string; name_en: string | null; service_area: Prisma.JsonValue } | null;
      event_name: string | null;
      event_area: Prisma.JsonValue;
    },
    area?: DiscountRideArea,
  ) {
    if (code.branch_id && area?.pickup && !pointInServiceArea(area.pickup, code.branch?.service_area)) {
      throw new GoException(GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA, undefined, {
        code_detail: 'BRANCH',
        reason: 'BRANCH',
        branch_id: code.branch_id,
        name_ar: code.branch?.name_ar ?? '',
        name_en: code.branch?.name_en ?? code.branch?.name_ar ?? '',
      });
    }
    if (code.event_area) {
      const points = [area?.pickup, area?.destination].filter((point): point is LatLng => !!point);
      if (points.length && !points.some((point) => pointInServiceArea(point, code.event_area))) {
        throw new GoException(GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA, undefined, {
          code_detail: 'EVENT',
          reason: 'EVENT',
          name_ar: code.event_name ?? '',
          name_en: code.event_name ?? '',
        });
      }
    }
  }

  /** Null = no total cap. First-N codes default to people × uses per person. */
  private usageLimitFor(explicit: number | null | undefined, maxCustomers: number | null | undefined, perCustomer: number | null | undefined) {
    const limit = explicit ?? (maxCustomers != null && perCustomer != null ? maxCustomers * perCustomer : null);
    if (limit != null && maxCustomers != null && limit < maxCustomers) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'usage_limit must be at least max_customers');
    }
    return limit;
  }

  /** Normalizes the optional campaign rules. Undefined keeps the stored value on patch. */
  private async resolveCampaign(body: CampaignInput, existing: { event_name: string | null; event_area: Prisma.JsonValue } | null) {
    if (body.branch_id) {
      const branch = await this.prisma.goBranch.findUnique({ where: { id: body.branch_id }, select: { id: true } });
      if (!branch) throw new GoException(GoErrorCode.NOT_FOUND, 'Branch not found');
    }
    const eventName = body.event_name === undefined ? existing?.event_name ?? null : body.event_name?.trim() || null;
    const eventArea = body.event_area === undefined ? existing?.event_area ?? null : body.event_area;
    if (eventName && !this.isPolygon(eventArea)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Draw the event area on the map');
    }
    if (!eventName && eventArea) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Enter the event name');
    }
    const eventTouched = body.event_name !== undefined || body.event_area !== undefined;
    return {
      max_customers: body.max_customers,
      per_customer_limit: body.per_customer_limit,
      new_users_only: body.new_users_only,
      branch_id: body.branch_id,
      event_name: eventTouched ? eventName : undefined,
      event_area: eventTouched
        ? eventArea
          ? (eventArea as Prisma.InputJsonValue)
          : Prisma.DbNull
        : undefined,
    };
  }

  private isPolygon(value: unknown) {
    if (!value || typeof value !== 'object') return false;
    const geo = value as { type?: unknown; coordinates?: unknown };
    if (geo.type === 'Polygon') return Array.isArray(geo.coordinates) && Array.isArray(geo.coordinates[0]) && geo.coordinates[0].length >= 4;
    return geo.type === 'MultiPolygon' && Array.isArray(geo.coordinates) && geo.coordinates.length > 0;
  }

  private async customerCanUse(
    code: { audience: GoDiscountAudience; customer_id: string | null; passport_level_id: string | null; holders: { customer_id: string }[] },
    customerId: string,
  ) {
    if (code.audience === GoDiscountAudience.ALL) return true;
    if (code.audience === GoDiscountAudience.STAMP) {
      const passport = await this.prisma.goCustomerPassport.findUnique({
        where: { customer_id: customerId },
        select: { current_level_id: true },
      });
      return passport?.current_level_id === code.passport_level_id;
    }
    return code.customer_id === customerId || code.holders.some((holder) => holder.customer_id === customerId);
  }

  private async resolveAudience(audience: GoDiscountAudience | undefined, customerIds: string[] | undefined, passportLevelId: string | undefined) {
    const kind = audience ?? (customerIds?.length ? GoDiscountAudience.CUSTOMERS : GoDiscountAudience.ALL);
    const ids = [...new Set((customerIds ?? []).filter(Boolean))];
    if (kind === GoDiscountAudience.CUSTOMERS) {
      if (!ids.length) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Select at least one customer');
      const found = await this.prisma.goCustomerProfile.findMany({
        where: { id: { in: ids } },
        select: { id: true, user_id: true },
      });
      if (found.length !== ids.length) throw new GoException(GoErrorCode.NOT_FOUND, 'Customer not found');
      return {
        audience: kind,
        customer_id: ids.length === 1 ? ids[0] : null,
        passport_level_id: null,
        customer_ids: ids,
        notify_user_ids: found.map((customer) => customer.user_id),
      };
    }
    if (kind === GoDiscountAudience.STAMP) {
      if (!passportLevelId) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Select a stamp');
      const level = await this.prisma.goCustomerPassportLevel.findUnique({ where: { id: passportLevelId }, select: { id: true } });
      if (!level) throw new GoException(GoErrorCode.NOT_FOUND, 'Passport level not found');
      return {
        audience: kind,
        customer_id: null,
        passport_level_id: level.id,
        customer_ids: [] as string[],
        notify_user_ids: [] as string[],
      };
    }
    return {
      audience: GoDiscountAudience.ALL,
      customer_id: null,
      passport_level_id: null,
      customer_ids: [] as string[],
      notify_user_ids: [] as string[],
    };
  }
}
