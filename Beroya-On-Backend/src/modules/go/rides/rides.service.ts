import { Injectable, Logger } from '@nestjs/common';
import {
  GoBookingFor,
  GoCancelActorRole,
  GoCommissionBase,
  GoDriverAvailability,
  GoDriverGender,
  GoDriverPassportScoreEventType,
  GoOnlineSessionEnd,
  GoAlertSeverity,
  GoOperationalAlertStatus,
  GoOperationalAlertType,
  GoPassportScoreEventType,
  GoPaymentMethod,
  GoPaymentStatus,
  GoRideOfferStatus,
  GoRideRequirementType,
  GoRideStatus,
  GoRideType,
  GoRole,
  GoServiceCode,
  GoWalletTransactionType,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { haversineM, safeH3Index } from '../dispatch/h3.util';
import { AlertsService } from '../alerts/alerts.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { BranchesService } from '../branches/branches.service';
import { CitiesService } from '../cities/cities.service';
import { erpCustomerDisplayName } from '../customers/customer-display';
import { CasesService } from '../cases/cases.service';
import { discountAmount } from '../discounts/discount-math';
import { DiscountsService, publicCode } from '../discounts/discounts.service';
import { rideRequiresLanguageMatch } from '../dispatch/candidate-ranking';
import { DispatchService } from '../dispatch/dispatch.service';
import { normalizeLanguageCode } from '../drivers/world-languages';
import { DriverPassportService } from '../driver-passport/driver-passport.service';
import { DriverSessionsService } from '../driver-sessions/driver-sessions.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { IncentivesService } from '../incentives/incentives.service';
import { PassportService } from '../passport/passport.service';
import { calculateFare, decimalToNumber } from '../pricing/fare.calculator';
import { pricingSnapshot, ridePricing } from '../pricing/pricing-snapshot';
import { selectedRouteId } from './polyline';
import { RouteEstimateService, type RouteOption } from './route-estimate.service';
import { RatingsService } from '../ratings/ratings.service';
import { ScheduledService } from '../scheduled/scheduled.service';
import { CustomerWalletService } from '../wallets/customer-wallet.service';
import { WalletService } from '../wallets/wallet.service';
import type {
  AddStopDto,
  AssignDriverDto,
  CreateRideDto,
  EndRideDto,
  ReturnChangeDto,
  EstimateRideDto,
  FleetVehicleLineDto,
  DriverBreakdownDto,
  LatLngDto,
  RideHistoryQueryDto,
  UpdatePickupDto,
} from './dto/rides.dto';
import { RideHistoryScope } from './dto/rides.dto';
import { RideDefaults, requirementsForCategory } from './ride-rules';
import {
  ACTIVE_RIDE_STATUSES,
  assertTransition,
  canCustomerCancel,
  canDriverCancel,
  canStaffCancel,
} from './ride-state-machine';
import { assertRideCategoryMatchesService } from './ride-service-categories';
import { resolveRideServiceBooking } from './ride-service-booking';
import {
  calculateFleetFare,
  fareFromPricingSnapshot,
  fleetLinesForSnapshot,
  publicFleetVehicles,
  resolveFleetBooking,
  type FleetFareLine,
  type FleetVehicleLine,
} from './ride-fleet';
import {
  calculateRentalFare,
  resolveRentalWindow,
  rentalPricingBasis,
  rentalSyntheticRoute,
} from './ride-rental';
import { assertIntercityCityPairIds } from './ride-intercity';
import { FareSettlementService } from './fare-settlement.service';
import { initialPaymentStatus } from './payment-status';
import { GoConfigService } from '../config/config.service';
import { CustomerRideViewService, customerRideInclude } from './customer-ride-view.service';
import { resolvePickupNavigation } from './pickup-navigation';
import { rideDisplayCode } from './ride-display-code';
import { assignedVehicleData, customerDriverSelect, driverCard, rideVehicle } from './ride-driver-card';
import { newTrackingToken } from './ride-tracking-link';
import { findSlotConflict, isLiveRide, pickActiveRide, type SlotCandidate, type SlotRide } from './customer-ride-slots';
import { DriverAvatarStorage } from '../drivers/driver-avatar.storage';
import { CustomerAvatarStorage } from '../customers/customer-profile.view';
import { passportIconMime } from '../passport/passport-icon.storage';
import {
  buildDriverInvoice,
  commissionFromLedger,
  resolveCommissionStatus,
  type DriverInvoice,
} from './driver-invoice';
import {
  activeCustomerCard,
  driverRideCustomerSelect,
  invoiceCustomerCard,
  waitingFields,
  paymentFields,
  pickupWaitBreakdown,
} from './driver-ride-customer';
import { cashDueAmount, changeReturnAmount, RIDE_CHANGE_RETURN_REASON } from './payment-change';
import {
  destinationChanged,
  plannedTripDistanceM,
  resolveToCustomerDistanceM,
  toPickupHaversineM,
  withCustomerDistanceM,
} from './ride-distances';
import { driverEmergencySummary, OPEN_EMERGENCY_STATUSES } from '../emergency/emergency.view';

type ResolvedBooking = {
  service_code: GoServiceCode;
  passengers_count: number | null;
  vehicles_count: number;
  random_vehicles: boolean;
  fleet_vehicles: FleetVehicleLine[] | null;
  fare_lines: FleetFareLine[] | null;
};

const slotSelect = {
  id: true,
  type: true,
  status: true,
  scheduled_at: true,
  started_at: true,
  estimated_duration_sec: true,
} satisfies Prisma.GoRideSelect;

const PAST_RIDE_STATUSES = Object.values(GoRideStatus).filter((s) => !ACTIVE_RIDE_STATUSES.includes(s));

/** scope narrows the status[] filter; neither = every ride. */
function historyStatusFilter(q: RideHistoryQueryDto): Prisma.EnumGoRideStatusFilter | undefined {
  const scope =
    q.scope === RideHistoryScope.CURRENT ? ACTIVE_RIDE_STATUSES : q.scope === RideHistoryScope.PAST ? PAST_RIDE_STATUSES : null;
  const wanted = q.status?.length ? q.status : null;
  const statuses = scope && wanted ? wanted.filter((s) => scope.includes(s)) : (wanted ?? scope);
  return statuses ? { in: [...statuses] } : undefined;
}

/**
 * Customer cancel classification. Driver on the way or arrived = en-route cancel;
 * assigned but not yet moving = late once the free window after acceptance has passed.
 */
export function cancelOutcome(
  ride: { status: GoRideStatus; type: GoRideType; assigned_at: Date | null },
  now = Date.now(),
) {
  if (ride.status === GoRideStatus.DRIVER_EN_ROUTE || ride.status === GoRideStatus.ARRIVED) {
    return {
      late_cancel: false,
      en_route_cancel: true,
      free_cancel_until: null,
      scoreEvent: GoPassportScoreEventType.EN_ROUTE_CANCELLATION as GoPassportScoreEventType | null,
    };
  }
  if (ride.status === GoRideStatus.DRIVER_ASSIGNED && ride.assigned_at) {
    const freeSec =
      ride.type === GoRideType.SCHEDULED
        ? RideDefaults.SCHEDULED_CANCEL_FREE_AFTER_ACCEPT_SEC
        : RideDefaults.IMMEDIATE_CANCEL_FREE_AFTER_ACCEPT_SEC;
    const freeUntil = new Date(ride.assigned_at.getTime() + freeSec * 1000);
    const late = now > freeUntil.getTime();
    return {
      late_cancel: late,
      en_route_cancel: false,
      free_cancel_until: freeUntil,
      scoreEvent: late ? GoPassportScoreEventType.LATE_CANCELLATION : null,
    };
  }
  return { late_cancel: false, en_route_cancel: false, free_cancel_until: null, scoreEvent: null };
}

const rideInclude = {
  stops: { orderBy: { sequence: 'asc' as const } },
  requirements: true,
  ride_category: { select: { id: true, code: true, name_ar: true, name_en: true } },
  branch: { select: { id: true, code: true, name_ar: true } },
  driver: { select: { id: true, user_id: true, user: { select: { full_name: true, phone: true } } } },
  customer: { select: driverRideCustomerSelect },
} satisfies Prisma.GoRideInclude;

/** Ticket §13.1 — ERP monitoring must not expose phones; use contact-info (audited). */
const erpRideInclude = {
  stops: { orderBy: { sequence: 'asc' as const } },
  requirements: true,
  ride_category: { select: { id: true, code: true, name_ar: true, name_en: true } },
  branch: { select: { id: true, code: true, name_ar: true } },
  driver: { select: { id: true, user_id: true, user: { select: { full_name: true } } } },
  customer: {
    select: { id: true, user_id: true, user: { select: { full_name: true, deleted_at: true } } },
  },
} satisfies Prisma.GoRideInclude;

function normalizeNote(note: string | null | undefined) {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

/** Short Arabic place label for breakdown stop (best-effort; never blocks the flow). */
async function reverseAreaLabel(lat: number, lng: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lng),
      'accept-language': 'ar',
      zoom: '16',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Beroya-Go/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
    };
    const a = body.address ?? {};
    const area = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.residential;
    const road = a.road || a.pedestrian;
    const city = a.city || a.town || a.village || a.state;
    const parts = [area, road, city].filter(Boolean);
    if (parts.length) return [...new Set(parts)].join('، ');
    if (body.name?.trim()) return body.name.trim();
    if (body.display_name) {
      return body.display_name
        .split(',')
        .slice(0, 3)
        .map((p) => p.trim())
        .filter(Boolean)
        .join('، ');
    }
    return null;
  } catch {
    return null;
  }
}

/** Ticket §27 — soft-deleted customers show as «حساب محذوف» on ERP ride views. */
function withDeletedCustomerLabel<T extends { customer?: { user?: { full_name: string | null; deleted_at?: Date | null } } | null }>(
  ride: T,
): T {
  if (!ride.customer?.user) return ride;
  return {
    ...ride,
    customer: {
      ...ride.customer,
      user: {
        ...ride.customer.user,
        full_name: erpCustomerDisplayName(ride.customer.user),
      },
    },
  };
}

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchesService,
    private readonly cities: CitiesService,
    private readonly route: RouteEstimateService,
    private readonly realtime: RealtimeService,
    private readonly locks: LockService,
    private readonly redis: RedisService,
    private readonly branchScope: BranchScopeService,
    private readonly dispatch: DispatchService,
    private readonly scheduled: ScheduledService,
    private readonly audit: AuditService,
    private readonly cases: CasesService,
    private readonly alerts: AlertsService,
    private readonly entitlements: EntitlementsService,
    private readonly wallets: WalletService,
    private readonly passport: PassportService,
    private readonly driverPassport: DriverPassportService,
    private readonly discounts: DiscountsService,
    private readonly ratings: RatingsService,
    private readonly fareSettlement: FareSettlementService,
    private readonly customerWallets: CustomerWalletService,
    private readonly customerView: CustomerRideViewService,
    private readonly driverAvatars: DriverAvatarStorage,
    private readonly customerAvatars: CustomerAvatarStorage,
    private readonly incentives: IncentivesService,
    private readonly sessions: DriverSessionsService,
    private readonly goConfig: GoConfigService,
  ) {}

  /** Minutes before scheduled_at when the driver must be online (dispatch config). */
  private async onlineBeforeMinutes() {
    const cfg = await this.goConfig.getDispatch();
    return Math.max(1, Math.round(cfg.scheduled_online_required_seconds / 60));
  }

  /** Enrich driver-facing ride with unified customer card + waiting/payment + pickup nav. */
  private async withDriverRideExtras<T extends {
    id: string;
    public_number: string;
    type?: GoRideType;
    status: GoRideStatus;
    arrived_at: Date | null;
    started_at?: Date | null;
    actual_distance_m?: number | null;
    actual_duration_sec?: number | null;
    payment_method: GoPaymentMethod;
    pickup_lat: Prisma.Decimal | number;
    pickup_lng: Prisma.Decimal | number;
    customer?: Parameters<typeof activeCustomerCard>[2];
  }>(ride: T, driverId: string, opts?: { onlineBeforeMinutes?: number }) {
    const needOnlineBefore = ride.type === GoRideType.SCHEDULED;
    const needLiveActuals = ride.status === GoRideStatus.IN_PROGRESS;
    const [customer, pickupNav, onlineBefore, openEmergency, liveActuals] = await Promise.all([
      activeCustomerCard(this.prisma, ride.id, ride.customer),
      this.pickupNavigation(driverId, ride),
      needOnlineBefore
        ? opts?.onlineBeforeMinutes != null
          ? Promise.resolve(opts.onlineBeforeMinutes)
          : this.onlineBeforeMinutes()
        : Promise.resolve(null as number | null),
      this.prisma.goEmergencySession.findFirst({
        where: { ride_id: ride.id, status: { in: OPEN_EMERGENCY_STATUSES } },
        orderBy: { started_at: 'desc' },
        select: { id: true, status: true, claimed_at: true, started_at: true },
      }),
      needLiveActuals ? this.liveActualsWhileInProgress(ride) : Promise.resolve(null),
    ]);
    return {
      ...ride,
      display_code: rideDisplayCode(ride.public_number),
      customer,
      active_emergency: driverEmergencySummary(openEmergency),
      ...waitingFields(ride.arrived_at),
      ...paymentFields(ride.payment_method),
      ...pickupNav,
      ...(onlineBefore != null ? { online_before_minutes: onlineBefore } : {}),
      ...(liveActuals ?? {}),
    };
  }

  /**
   * DIST-001 — while passenger is aboard, surface track haversine + wall-clock duration
   * so restore-after-kill does not depend on the last DB write alone.
   */
  private async liveActualsWhileInProgress(ride: {
    id: string;
    started_at?: Date | null;
    actual_distance_m?: number | null;
    actual_duration_sec?: number | null;
  }) {
    const tracked = await this.distanceFromRideTrack(ride.id);
    const wallDuration =
      ride.started_at != null
        ? Math.max(0, Math.round((Date.now() - ride.started_at.getTime()) / 1000))
        : 0;
    const distance_m =
      tracked?.distance_m && tracked.distance_m > 0
        ? tracked.distance_m
        : Math.max(0, ride.actual_distance_m ?? 0);
    const duration_sec = Math.max(wallDuration, tracked?.duration_sec ?? 0, ride.actual_duration_sec ?? 0);
    return { actual_distance_m: distance_m, actual_duration_sec: duration_sec };
  }

  /** ETA + polyline from the driver's live/last location to pickup (EN_ROUTE / ASSIGNED only). */
  private pickupNavigation(
    driverId: string,
    ride: {
      id: string;
      status: GoRideStatus;
      pickup_lat: Prisma.Decimal | number;
      pickup_lng: Prisma.Decimal | number;
    },
  ) {
    return resolvePickupNavigation({
      redis: this.redis,
      prisma: this.prisma,
      route: this.route,
      driverId,
      ride,
    });
  }

  private async customerProfileId(userId: string) {
    const p = await this.prisma.goCustomerProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
    });
    return p.id;
  }

  private activeRideExists(rideId: string) {
    return new GoException(GoErrorCode.ACTIVE_RIDE_EXISTS, 'Customer already has an active ride', { ride_id: rideId });
  }

  private assertSlotFree(active: SlotRide[], candidate: SlotCandidate) {
    const conflict = findSlotConflict(active, candidate);
    if (!conflict) return;
    if (conflict.reason === 'ACTIVE_RIDE') throw this.activeRideExists(conflict.ride.id);
    throw new GoException(GoErrorCode.RIDE_TIME_CONFLICT, 'Another booking of yours overlaps this time', {
      ride_id: conflict.ride.id,
      scheduled_at: conflict.ride.scheduled_at,
    });
  }

  private async driverProfileByUser(userId: string) {
    const d = await this.prisma.goDriverProfile.findUnique({ where: { user_id: userId } });
    if (!d) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    return d;
  }

  private pointsFrom(dto: { pickup: LatLngDto; destination: LatLngDto; stops?: LatLngDto[] }) {
    return [dto.pickup, ...(dto.stops ?? []), dto.destination];
  }

  private assertDestinationRequired(serviceType: GoServiceCode | undefined, destination?: LatLngDto) {
    if (serviceType === GoServiceCode.RENTAL) return;
    if (!destination) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'destination', messages: ['destination is required'] }],
      });
    }
  }

  /**
   * ISO preferred language for dispatch. VIP + tourist require an explicit pick;
   * other rides default to `ar` (soft ranking only).
   */
  private resolvePreferredDriverLanguage(
    preferred: string | undefined,
    opts: { categoryCode: string; serviceCode: GoServiceCode },
  ): string {
    const requirePick = rideRequiresLanguageMatch({
      service_code: opts.serviceCode,
      category_code: opts.categoryCode,
    });
    if (requirePick && (preferred == null || String(preferred).trim() === '')) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [
          {
            field: 'preferred_driver_language',
            messages: ['Preferred driver language is required for VIP and tourist rides'],
          },
        ],
      });
    }
    return normalizeLanguageCode(preferred ?? 'ar');
  }

  private async assertServiceBookable(code: GoServiceCode) {
    const service = await this.prisma.goService.findUnique({ where: { code } });
    if (!service) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'service_type', messages: ['Unknown service'] }],
      });
    }
    if (!service.is_available) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'service_type', messages: ['This service is not available yet'] }],
      });
    }
    return service;
  }

  /** INTERCITY optional city pair: both active cities, must differ. */
  private async assertIntercityCities(dto: {
    service_type?: GoServiceCode;
    pickup_city_id?: string | null;
    destination_city_id?: string | null;
  }) {
    if (dto.service_type !== GoServiceCode.INTERCITY) return null;
    const pair = assertIntercityCityPairIds({
      pickup_city_id: dto.pickup_city_id,
      destination_city_id: dto.destination_city_id,
    });
    if (!pair) return null;
    await this.cities.requireActiveCity(pair.pickup_city_id, 'pickup_city_id');
    await this.cities.requireActiveCity(pair.destination_city_id, 'destination_city_id');
    return pair;
  }

  private async resolveChosenRoute(dto: CreateRideDto): Promise<RouteOption> {
    if (dto.service_type === GoServiceCode.RENTAL) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'selected_route', messages: ['selected_route is not used for RENTAL'] }],
      });
    }
    const live = await this.route.estimateOptions(this.pointsFrom(dto as CreateRideDto & { destination: LatLngDto }), true);
    const selected = dto.selected_route;
    if (!selected) return live.routes[0];
    const fromLive = live.routes.find((r) => r.route_id === selected.route_id);
    if (fromLive) return fromLive;
    const expected = selectedRouteId(selected.encoded_polyline, selected.distance_m, selected.duration_sec);
    if (expected !== selected.route_id) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'selected_route.route_id does not match the route');
    }
    return {
      route_id: selected.route_id,
      summary: selected.summary ?? '',
      distance_m: selected.distance_m,
      duration_sec: selected.duration_sec,
      encoded_polyline: selected.encoded_polyline,
      source: live.source,
    };
  }

  private async categoryFor(categoryId: string) {
    const category = await this.prisma.goRideCategory.findUnique({
      where: { id: categoryId },
      include: { pricing: true },
    });
    if (!category?.is_active) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Ride category inactive or missing');
    const pricing = category.pricing;
    if (!pricing?.is_active) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Pricing inactive for category');
    return { ...category, pricing };
  }

  private async pricingFor(categoryId: string) {
    return (await this.categoryFor(categoryId)).pricing;
  }

  private async resolveBookingService(
    input: {
      service_type?: GoServiceCode;
      passengers_count?: number;
      vehicles_count?: number;
      random_vehicles?: boolean;
      vehicles?: FleetVehicleLineDto[];
    },
    category: Awaited<ReturnType<RidesService['categoryFor']>>,
    rideType: GoRideType,
    nightPct: Prisma.Decimal | number | null,
  ): Promise<ResolvedBooking> {
    const code = input.service_type ?? GoServiceCode.DAILY;
    const service = await this.prisma.goService.findUnique({ where: { code } });

    if (code === GoServiceCode.FLEET) {
      if (rideType !== GoRideType.SCHEDULED) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'ride_type', messages: ['FLEET bookings must be SCHEDULED'] }],
        });
      }
      if (!service || service.code !== GoServiceCode.FLEET) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'service_type', messages: ['Unknown service'] }],
        });
      }
      if (!service.is_available) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'service_type', messages: ['This service is not available yet'] }],
        });
      }

      const ids = [
        ...new Set([category.id, ...(input.vehicles ?? []).map((v) => v.ride_category_id)]),
      ];
      const rows = await this.prisma.goRideCategory.findMany({
        where: { id: { in: ids } },
        include: { pricing: true },
      });
      const categoriesById = new Map(
        rows.map((r) => [
          r.id,
          {
            id: r.id,
            code: r.code,
            is_active: r.is_active,
            pricing: r.pricing
              ? {
                  base_fare: r.pricing.base_fare,
                  price_per_km: r.pricing.price_per_km,
                  price_per_minute: r.pricing.price_per_minute,
                  minimum_fare: r.pricing.minimum_fare,
                  currency: r.pricing.currency,
                  is_active: r.pricing.is_active,
                }
              : null,
          },
        ]),
      );
      const fleet = resolveFleetBooking(input, category, categoriesById);
      const fare_lines: FleetFareLine[] | null = fleet.random_vehicles
        ? null
        : (fleet.fleet_vehicles ?? []).map((line) => {
            const row = categoriesById.get(line.ride_category_id)!;
            return {
              ride_category_id: line.ride_category_id,
              count: line.count,
              rates: {
                base_fare: row.pricing!.base_fare,
                price_per_km: row.pricing!.price_per_km,
                price_per_minute: row.pricing!.price_per_minute,
                minimum_fare: row.pricing!.minimum_fare,
                night_pct: nightPct,
              },
            };
          });
      return {
        service_code: GoServiceCode.FLEET,
        passengers_count: fleet.passengers_count,
        vehicles_count: fleet.vehicles_count,
        random_vehicles: fleet.random_vehicles,
        fleet_vehicles: fleet.fleet_vehicles,
        fare_lines,
      };
    }

    const booking = resolveRideServiceBooking(input, category, service);
    return {
      ...booking,
      random_vehicles: false,
      fleet_vehicles: null,
      fare_lines: null,
    };
  }

  private fareForBooking(
    booking: ResolvedBooking,
    primaryPricing: { base_fare: unknown; price_per_km: unknown; price_per_minute: unknown; minimum_fare: unknown; night_pct?: unknown },
    distance_m: number,
    duration_sec: number,
  ) {
    if (booking.service_code === GoServiceCode.FLEET) {
      return calculateFleetFare(distance_m, duration_sec, {
        random_vehicles: booking.random_vehicles,
        vehicles_count: booking.vehicles_count,
        primary: primaryPricing as Parameters<typeof calculateFleetFare>[2]['primary'],
        lines: booking.fare_lines ?? undefined,
      });
    }
    return calculateFare(
      primaryPricing as Parameters<typeof calculateFare>[0],
      distance_m,
      duration_sec,
      booking.vehicles_count,
    );
  }

  private async fleetVehiclesEcho(
    booking: ResolvedBooking,
    category: { id: string; code: string; name_ar: string; name_en: string | null },
  ) {
    if (booking.service_code !== GoServiceCode.FLEET) {
      return [{ ride_category_id: category.id, count: booking.vehicles_count, category, random: false }];
    }
    const ids = booking.fleet_vehicles?.map((l) => l.ride_category_id) ?? [];
    const rows = ids.length
      ? await this.prisma.goRideCategory.findMany({
          where: { id: { in: ids } },
          select: { id: true, code: true, name_ar: true, name_en: true },
        })
      : [];
    const map = new Map(rows.map((r) => [r.id, r]));
    map.set(category.id, category);
    return publicFleetVehicles(booking.fleet_vehicles, map, category, booking.vehicles_count, booking.random_vehicles);
  }

  private async nextPublicNumber() {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.goRide.count({
      where: { created_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });
    return `GO-${day}-${String(count + 1).padStart(5, '0')}`;
  }

  /** The moment night fare is judged at: the appointment for scheduled rides, now otherwise. */
  private fareTime(type: GoRideType, scheduledAt?: string | null) {
    return type === GoRideType.SCHEDULED && scheduledAt ? new Date(scheduledAt) : new Date();
  }

  /**
   * Fare discounts (promo badge or discount code) are cash-only for the customer:
   * they pay the reduced amount in cash; company credits the driver wallet; no customer wallet hold.
   */
  private async paymentMethodWhenDiscounted(input: {
    requested?: GoPaymentMethod | null;
    discountCodeId?: string | null;
    serviceCode: GoServiceCode;
    grossFare: Prisma.Decimal | number | string;
  }) {
    const requested = input.requested ?? GoPaymentMethod.CASH;
    if (requested === GoPaymentMethod.SHAM_CASH) return requested;
    if (input.discountCodeId) return GoPaymentMethod.CASH;
    const promo = await this.discounts.amountForService(input.serviceCode, input.grossFare);
    if (promo.gt(0)) return GoPaymentMethod.CASH;
    return requested;
  }

  async estimate(user: AuthUser, dto: EstimateRideDto) {
    if (dto.service_type === GoServiceCode.RENTAL) {
      return this.estimateRental(user, dto);
    }
    this.assertDestinationRequired(dto.service_type, dto.destination);
    const intercityCities = await this.assertIntercityCities(dto);
    const category = await this.categoryFor(dto.ride_category_id);
    const nightPct = await this.incentives.nightFarePct(dto.ride_category_id, this.fareTime(dto.ride_type, dto.scheduled_at));
    const booking = await this.resolveBookingService(dto, category, dto.ride_type, nightPct);
    assertRideCategoryMatchesService(booking.service_code, category.code);
    const pricing = { ...category.pricing, night_pct: nightPct };
    const code = dto.discount_code?.trim()
      ? await this.discounts.resolveTypedCode(user.id, {
          code: dto.discount_code,
          rideCategoryId: dto.ride_category_id,
          rideType: dto.ride_type,
          serviceCode: booking.service_code,
          area: { pickup: dto.pickup, destination: dto.destination },
        })
      : null;
    await this.branches.resolveFromPickup(dto.pickup.lat, dto.pickup.lng);
    const { source, routes } = await this.route.estimateOptions(
      this.pointsFrom({ pickup: dto.pickup, destination: dto.destination!, stops: dto.stops }),
      true,
    );
    const promoByFare = new Map<string, Prisma.Decimal>();
    const priced = [];
    for (const r of routes) {
      const fare = this.fareForBooking(booking, pricing, r.distance_m, r.duration_sec).final_fare;
      const key = fare.toString();
      let discount: Prisma.Decimal;
      if (code) {
        discount = discountAmount(fare, code.percentage, code.maximum_discount_amount);
      } else if (promoByFare.has(key)) {
        discount = promoByFare.get(key)!;
      } else {
        discount = await this.discounts.amountForService(booking.service_code, fare);
        promoByFare.set(key, discount);
      }
      priced.push({
        route_id: r.route_id,
        summary: r.summary,
        distance_m: r.distance_m,
        duration_sec: r.duration_sec,
        encoded_polyline: r.encoded_polyline,
        source: r.source,
        estimated_fare: decimalToNumber(fare),
        discount_amount: decimalToNumber(discount),
        final_fare: decimalToNumber(new Prisma.Decimal(fare).minus(discount)),
      });
    }
    const first = priced[0];
    const vehiclesEcho = await this.fleetVehiclesEcho(booking, category);
    const preferred_driver_language = this.resolvePreferredDriverLanguage(dto.preferred_driver_language, {
      categoryCode: category.code,
      serviceCode: booking.service_code,
    });
    return {
      source,
      currency: pricing.currency,
      service_type: booking.service_code,
      vehicles_count: booking.vehicles_count,
      passengers_count: booking.passengers_count,
      random_vehicles: booking.service_code === GoServiceCode.FLEET ? booking.random_vehicles : undefined,
      vehicles: booking.service_code === GoServiceCode.FLEET ? vehiclesEcho : undefined,
      pickup_city_id: intercityCities?.pickup_city_id ?? null,
      destination_city_id: intercityCities?.destination_city_id ?? null,
      preferred_driver_language,
      discount: code ? publicCode(code) : null,
      night_fare: nightPct ? { percentage: decimalToNumber(nightPct) } : null,
      routes: priced,
      distance_m: first.distance_m,
      duration_sec: first.duration_sec,
      estimated_fare: first.estimated_fare,
      discount_amount: first.discount_amount,
      final_fare: first.final_fare,
    };
  }

  private async estimateRental(user: AuthUser, dto: EstimateRideDto) {
    if (dto.ride_type !== GoRideType.SCHEDULED) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'ride_type', messages: ['RENTAL bookings must be SCHEDULED'] }],
      });
    }
    if (dto.stops?.length) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'stops', messages: ['stops are not used for RENTAL in V1'] }],
      });
    }
    await this.assertServiceBookable(GoServiceCode.RENTAL);
    const category = await this.categoryFor(dto.ride_category_id);
    const window = resolveRentalWindow({
      scheduled_at: dto.scheduled_at,
      ends_at: dto.ends_at,
      duration_hours: dto.duration_hours,
    });
    const nightPct = await this.incentives.nightFarePct(category.id, window.scheduled_at);
    const pricing = { ...category.pricing, night_pct: nightPct };
    const code = dto.discount_code?.trim()
      ? await this.discounts.resolveTypedCode(user.id, {
          code: dto.discount_code,
          rideCategoryId: dto.ride_category_id,
          rideType: GoRideType.SCHEDULED,
          serviceCode: GoServiceCode.RENTAL,
          area: { pickup: dto.pickup, destination: dto.destination ?? dto.pickup },
        })
      : null;
    await this.branches.resolveFromPickup(dto.pickup.lat, dto.pickup.lng);
    const fare = calculateRentalFare(pricing, window.duration_sec).final_fare;
    const discount = code
      ? discountAmount(fare, code.percentage, code.maximum_discount_amount)
      : await this.discounts.amountForService(GoServiceCode.RENTAL, fare);
    const route = rentalSyntheticRoute(window.duration_sec);
    const estimated_fare = decimalToNumber(fare);
    const discount_amount = decimalToNumber(discount);
    const final_fare = decimalToNumber(new Prisma.Decimal(fare).minus(discount));
    return {
      source: 'RENTAL',
      currency: pricing.currency,
      service_type: GoServiceCode.RENTAL,
      vehicles_count: 1,
      passengers_count: null,
      scheduled_at: window.scheduled_at.toISOString(),
      ends_at: window.ends_at.toISOString(),
      rental_ends_at: window.ends_at.toISOString(),
      duration_sec: window.duration_sec,
      duration_hours: window.duration_hours,
      pricing_basis: rentalPricingBasis(pricing, window),
      preferred_driver_language: this.resolvePreferredDriverLanguage(dto.preferred_driver_language, {
        categoryCode: category.code,
        serviceCode: GoServiceCode.RENTAL,
      }),
      discount: code ? publicCode(code) : null,
      night_fare: nightPct ? { percentage: decimalToNumber(nightPct) } : null,
      routes: [
        {
          ...route,
          estimated_fare,
          discount_amount,
          final_fare,
        },
      ],
      distance_m: 0,
      estimated_fare,
      discount_amount,
      final_fare,
    };
  }

  async create(user: AuthUser, dto: CreateRideDto) {
    if (dto.payment_method === GoPaymentMethod.SHAM_CASH) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'SHAM_CASH is disabled in V1');
    }
    if (
      (dto.service_type === GoServiceCode.FLEET || dto.service_type === GoServiceCode.RENTAL) &&
      dto.type !== GoRideType.SCHEDULED
    ) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'type', messages: [`${dto.service_type} bookings must be SCHEDULED`] }],
      });
    }
    if (dto.service_type === GoServiceCode.RENTAL) {
      return this.createRental(user, dto);
    }
    this.assertDestinationRequired(dto.service_type, dto.destination);
    await this.assertIntercityCities(dto);
    if (dto.type === GoRideType.SCHEDULED) {
      if (!dto.scheduled_at || new Date(dto.scheduled_at) <= new Date()) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'scheduled_at must be in the future');
      }
    }
    if (dto.booking_for === GoBookingFor.OTHER) {
      if (!dto.other_passenger?.name) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'other_passenger.name', messages: ['other_passenger.name is required for booking_for OTHER'] }],
        });
      }
    } else if (dto.pickup_sign_name) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'pickup_sign_name', messages: ['pickup_sign_name is only allowed with booking_for OTHER'] }],
      });
    }

    const customerId = await this.customerProfileId(user.id);
    return this.locks.withLock(`customer-ride:${customerId}`, async () => {
      const active = await this.prisma.goRide.findMany({
        where: { customer_id: customerId, status: { in: [...ACTIVE_RIDE_STATUSES] } },
        select: slotSelect,
      });
      const live = dto.type === GoRideType.IMMEDIATE ? active.find((r) => isLiveRide(r)) : undefined;
      if (live) throw this.activeRideExists(live.id);

      const category = await this.categoryFor(dto.ride_category_id);
      const nightPct = await this.incentives.nightFarePct(category.id, this.fareTime(dto.type, dto.scheduled_at));
      const booking = await this.resolveBookingService(dto, category, dto.type, nightPct);
      assertRideCategoryMatchesService(booking.service_code, category.code);
      const preferred_driver_language = this.resolvePreferredDriverLanguage(dto.preferred_driver_language, {
        categoryCode: category.code,
        serviceCode: booking.service_code,
      });
      const pricing = category.pricing;
      const requirements = requirementsForCategory(category.code, dto.requirements, booking.service_code);
      const branch = await this.branches.resolveFromPickup(dto.pickup.lat, dto.pickup.lng);
      const chosen = await this.resolveChosenRoute(dto);
      this.assertSlotFree(active, {
        type: dto.type,
        scheduled_at: dto.type === GoRideType.SCHEDULED ? new Date(dto.scheduled_at!) : null,
        estimated_duration_sec: chosen.duration_sec,
      });
      const baseSnapshot = pricingSnapshot(pricing, nightPct);
      const snapshot = {
        ...baseSnapshot,
        ...(booking.service_code === GoServiceCode.FLEET
          ? {
              random_vehicles: booking.random_vehicles,
              vehicles_count: booking.vehicles_count,
              fleet_lines:
                booking.fare_lines && !booking.random_vehicles
                  ? fleetLinesForSnapshot(booking.fare_lines)
                  : undefined,
            }
          : {}),
      };
      const fare = this.fareForBooking(booking, { ...pricing, night_pct: nightPct }, chosen.distance_m, chosen.duration_sec);
      const paymentMethod = await this.paymentMethodWhenDiscounted({
        requested: dto.payment_method,
        discountCodeId: dto.discount_code_id,
        serviceCode: booking.service_code,
        grossFare: fare.final_fare,
      });
      const distancePct = await this.incentives.distanceBonusPct(branch, dto.pickup);
      const bonus = await this.incentives.combinedRidePct({ rejection: null, distance: distancePct });
      const public_number = await this.nextPublicNumber();

      const ride = await this.prisma.goRide.create({
        data: {
          public_number,
          customer_id: customerId,
          branch_id: branch.id,
          ride_category_id: dto.ride_category_id,
          service_code: booking.service_code,
          passengers_count: booking.passengers_count,
          vehicles_count: booking.vehicles_count,
          random_vehicles: booking.random_vehicles,
          fleet_vehicles: booking.fleet_vehicles
            ? (booking.fleet_vehicles as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          type: dto.type,
          status: GoRideStatus.SEARCHING,
          payment_method: paymentMethod,
          payment_status: initialPaymentStatus(paymentMethod),
          booking_for: dto.booking_for ?? GoBookingFor.SELF,
          other_passenger_name: dto.other_passenger?.name ?? null,
          other_passenger_phone: dto.other_passenger?.phone ?? null,
          pickup_sign_name: dto.booking_for === GoBookingFor.OTHER ? (dto.pickup_sign_name ?? null) : null,
          share_tracking_link: dto.share_tracking_link ?? false,
          tracking_token: dto.share_tracking_link ? newTrackingToken() : null,
          customer_note: normalizeNote(dto.customer_note),
          preferred_driver_language,
          scheduled_at: dto.type === GoRideType.SCHEDULED ? new Date(dto.scheduled_at!) : null,
          pickup_lat: dto.pickup.lat,
          pickup_lng: dto.pickup.lng,
          pickup_address: dto.pickup.address,
          pickup_source: dto.pickup_source ?? null,
          pickup_h3: safeH3Index(dto.pickup.lat, dto.pickup.lng),
          original_destination_lat: dto.destination!.lat,
          original_destination_lng: dto.destination!.lng,
          original_destination_address: dto.destination!.address,
          estimated_distance_m: chosen.distance_m,
          estimated_duration_sec: chosen.duration_sec,
          estimated_fare: fare.final_fare,
          estimated_route_polyline: chosen.encoded_polyline,
          estimated_route_source: chosen.source,
          estimated_route_summary: chosen.summary || null,
          pricing_snapshot: snapshot as unknown as Prisma.InputJsonValue,
          incentive_distance_pct: distancePct,
          incentive_percentage: bonus.percentage,
          incentive_reason: bonus.reason,
          stops: {
            create: (dto.stops ?? []).map((s, i) => ({
              sequence: i + 1,
              latitude: s.lat,
              longitude: s.lng,
              address: s.address,
            })),
          },
          requirements: {
            create: requirements.map((type) => ({ type })),
          },
        },
        include: rideInclude,
      });

      if (dto.discount_code_id) {
        try {
          await this.discounts.reserveForRide({
            customerId,
            rideId: ride.id,
            discountCodeId: dto.discount_code_id,
            rideCategoryId: dto.ride_category_id,
            rideType: dto.type,
            serviceCode: booking.service_code,
            area: { pickup: dto.pickup, destination: dto.destination },
          });
        } catch (err) {
          await this.prisma.goRide.delete({ where: { id: ride.id } });
          throw err;
        }
      }

      if (ride.payment_method === GoPaymentMethod.WALLET) {
        try {
          const discount = await this.discounts.preview(ride.id, fare.final_fare);
          ride.wallet_paid_amount = await this.customerWallets.holdForRide({
            customerId,
            rideId: ride.id,
            amount: new Prisma.Decimal(fare.final_fare).minus(discount.amount),
          });
        } catch (err) {
          await this.prisma.goRide.delete({ where: { id: ride.id } });
          throw err;
        }
      }

      await this.passport.ensurePassport(customerId);

      this.realtime.emitToCustomer(user.id, 'ride.created', { ride_id: ride.id, status: ride.status });
      this.realtime.emitToCustomer(user.id, 'ride.searching', { ride_id: ride.id });
      this.realtime.emitToStaff(branch.id, 'ride.created', { ride_id: ride.id, public_number: ride.public_number });
      // Ticket §8 — scheduled publishes immediately (no T-15 wait). Lifecycle jobs after reserve.
      await this.dispatch.enqueueSearch(ride.id);
      // No driver yet, so never a link; GET /customer/rides/:id has it after assignment.
      return { ...ride, tracking_url: null };
    });
  }

  private async createRental(user: AuthUser, dto: CreateRideDto) {
    if (dto.stops?.length) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'stops', messages: ['stops are not used for RENTAL in V1'] }],
      });
    }
    if (dto.selected_route) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'selected_route', messages: ['selected_route is not used for RENTAL — omit it'] }],
      });
    }
    if (dto.booking_for === GoBookingFor.OTHER) {
      if (!dto.other_passenger?.name) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
          errors: [{ field: 'other_passenger.name', messages: ['other_passenger.name is required for booking_for OTHER'] }],
        });
      }
    } else if (dto.pickup_sign_name) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'pickup_sign_name', messages: ['pickup_sign_name is only allowed with booking_for OTHER'] }],
      });
    }

    await this.assertServiceBookable(GoServiceCode.RENTAL);
    const window = resolveRentalWindow({
      scheduled_at: dto.scheduled_at,
      ends_at: dto.ends_at,
      duration_hours: dto.duration_hours,
    });

    const customerId = await this.customerProfileId(user.id);
    return this.locks.withLock(`customer-ride:${customerId}`, async () => {
      const active = await this.prisma.goRide.findMany({
        where: { customer_id: customerId, status: { in: [...ACTIVE_RIDE_STATUSES] } },
        select: slotSelect,
      });
      const category = await this.categoryFor(dto.ride_category_id);
      const nightPct = await this.incentives.nightFarePct(category.id, window.scheduled_at);
      const pricing = category.pricing;
      const requirements = requirementsForCategory(category.code, dto.requirements);
      const branch = await this.branches.resolveFromPickup(dto.pickup.lat, dto.pickup.lng);
      const chosen = rentalSyntheticRoute(window.duration_sec);
      this.assertSlotFree(active, {
        type: GoRideType.SCHEDULED,
        scheduled_at: window.scheduled_at,
        estimated_duration_sec: window.duration_sec,
      });
      const snapshot = {
        ...pricingSnapshot(pricing, nightPct),
        rental: true,
        rental_duration_sec: window.duration_sec,
      };
      const fare = calculateRentalFare({ ...pricing, night_pct: nightPct }, window.duration_sec);
      const paymentMethod = await this.paymentMethodWhenDiscounted({
        requested: dto.payment_method,
        discountCodeId: dto.discount_code_id,
        serviceCode: GoServiceCode.RENTAL,
        grossFare: fare.final_fare,
      });
      const distancePct = await this.incentives.distanceBonusPct(branch, dto.pickup);
      const bonus = await this.incentives.combinedRidePct({ rejection: null, distance: distancePct });
      const public_number = await this.nextPublicNumber();

      const ride = await this.prisma.goRide.create({
        data: {
          public_number,
          customer_id: customerId,
          branch_id: branch.id,
          ride_category_id: dto.ride_category_id,
          service_code: GoServiceCode.RENTAL,
          passengers_count: null,
          vehicles_count: 1,
          random_vehicles: false,
          fleet_vehicles: Prisma.DbNull,
          type: GoRideType.SCHEDULED,
          status: GoRideStatus.SEARCHING,
          payment_method: paymentMethod,
          payment_status: initialPaymentStatus(paymentMethod),
          booking_for: dto.booking_for ?? GoBookingFor.SELF,
          other_passenger_name: dto.other_passenger?.name ?? null,
          other_passenger_phone: dto.other_passenger?.phone ?? null,
          pickup_sign_name: dto.booking_for === GoBookingFor.OTHER ? (dto.pickup_sign_name ?? null) : null,
          share_tracking_link: dto.share_tracking_link ?? false,
          tracking_token: dto.share_tracking_link ? newTrackingToken() : null,
          customer_note: normalizeNote(dto.customer_note),
          preferred_driver_language: this.resolvePreferredDriverLanguage(dto.preferred_driver_language, {
            categoryCode: category.code,
            serviceCode: GoServiceCode.RENTAL,
          }),
          scheduled_at: window.scheduled_at,
          rental_ends_at: window.ends_at,
          pickup_lat: dto.pickup.lat,
          pickup_lng: dto.pickup.lng,
          pickup_address: dto.pickup.address,
          pickup_source: dto.pickup_source ?? null,
          pickup_h3: safeH3Index(dto.pickup.lat, dto.pickup.lng),
          // Schema requires destination coords; RENTAL is pickup-only — mirror pickup as placeholder.
          original_destination_lat: dto.pickup.lat,
          original_destination_lng: dto.pickup.lng,
          original_destination_address: dto.pickup.address ?? null,
          estimated_distance_m: 0,
          estimated_duration_sec: window.duration_sec,
          estimated_fare: fare.final_fare,
          estimated_route_polyline: null,
          estimated_route_source: 'RENTAL',
          estimated_route_summary: 'RENTAL',
          pricing_snapshot: snapshot as unknown as Prisma.InputJsonValue,
          incentive_distance_pct: distancePct,
          incentive_percentage: bonus.percentage,
          incentive_reason: bonus.reason,
          requirements: {
            create: requirements.map((type) => ({ type })),
          },
        },
        include: rideInclude,
      });

      if (dto.discount_code_id) {
        try {
          await this.discounts.reserveForRide({
            customerId,
            rideId: ride.id,
            discountCodeId: dto.discount_code_id,
            rideCategoryId: dto.ride_category_id,
            rideType: GoRideType.SCHEDULED,
            serviceCode: GoServiceCode.RENTAL,
            area: { pickup: dto.pickup, destination: dto.pickup },
          });
        } catch (err) {
          await this.prisma.goRide.delete({ where: { id: ride.id } });
          throw err;
        }
      }

      if (ride.payment_method === GoPaymentMethod.WALLET) {
        try {
          const discount = await this.discounts.preview(ride.id, fare.final_fare);
          ride.wallet_paid_amount = await this.customerWallets.holdForRide({
            customerId,
            rideId: ride.id,
            amount: new Prisma.Decimal(fare.final_fare).minus(discount.amount),
          });
        } catch (err) {
          await this.prisma.goRide.delete({ where: { id: ride.id } });
          throw err;
        }
      }

      await this.passport.ensurePassport(customerId);
      this.realtime.emitToCustomer(user.id, 'ride.created', { ride_id: ride.id, status: ride.status });
      this.realtime.emitToCustomer(user.id, 'ride.searching', { ride_id: ride.id });
      this.realtime.emitToStaff(branch.id, 'ride.created', { ride_id: ride.id, public_number: ride.public_number });
      await this.dispatch.enqueueSearch(ride.id);
      return { ...ride, tracking_url: null };
    });
  }

  async listScheduledForDriver(userId: string) {
    const driver = await this.driverProfileByUser(userId);
    const [rows, onlineBeforeMinutes] = await Promise.all([
      this.prisma.goRide.findMany({
        where: {
          driver_id: driver.id,
          type: GoRideType.SCHEDULED,
          status: {
            in: [GoRideStatus.DRIVER_ASSIGNED, GoRideStatus.DRIVER_EN_ROUTE, GoRideStatus.ARRIVED],
          },
          scheduled_at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        include: rideInclude,
        orderBy: { scheduled_at: 'asc' },
      }),
      this.onlineBeforeMinutes(),
    ]);
    return Promise.all(rows.map((ride) => this.withDriverRideExtras(ride, driver.id, { onlineBeforeMinutes })));
  }

  /** Driver activity / history: same paging contract as GET /customer/rides. */
  async historyForDriver(userId: string, q: RideHistoryQueryDto) {
    const driver = await this.driverProfileByUser(userId);
    const where: Prisma.GoRideWhereInput = {
      driver_id: driver.id,
      status: historyStatusFilter(q),
      created_at: {
        gte: q.from ? new Date(q.from) : undefined,
        lte: q.to ? new Date(q.to) : undefined,
      },
    };
    const orderBy: Prisma.GoRideOrderByWithRelationInput[] =
      q.scope === RideHistoryScope.CURRENT
        ? [{ type: 'asc' }, { scheduled_at: 'asc' }, { created_at: 'asc' }]
        : [{ created_at: 'desc' }];
    const { skip, take } = pageSkip(q.page, q.limit);
    const [rows, total, onlineBeforeMinutes] = await Promise.all([
      this.prisma.goRide.findMany({ where, include: rideInclude, orderBy, skip, take }),
      this.prisma.goRide.count({ where }),
      this.onlineBeforeMinutes(),
    ]);
    const items = await Promise.all(
      rows.map((ride) => this.withDriverRideExtras(ride, driver.id, { onlineBeforeMinutes })),
    );
    return { items, page: skip / take + 1, limit: take, total, has_more: skip + rows.length < total };
  }

  /** The live ride, else the next scheduled one (a customer may hold several scheduled rides). */
  async activeForCustomer(userId: string) {
    const customerId = await this.customerProfileId(userId);
    const rides = await this.prisma.goRide.findMany({
      where: { customer_id: customerId, status: { in: [...ACTIVE_RIDE_STATUSES] } },
      include: customerRideInclude,
    });
    const ride = pickActiveRide(rides);
    return ride ? this.customerView.view(ride) : null;
  }

  /** GET /customer/rides/:id — ride plus vehicle, driver rating/photo and live tracking. */
  async detailForCustomer(userId: string, rideId: string) {
    const customerId = await this.customerProfileId(userId);
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, customer_id: customerId },
      include: customerRideInclude,
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    // Ticket §11.3 — own rating only; never counterparty rating/reasons/notes
    const [my_rating, complaints] = await Promise.all([
      this.ratings.myRatingFor(userId, rideId, 'customer'),
      this.customerView.myComplaints(customerId, [rideId]),
    ]);
    return { ...(await this.customerView.view(ride)), my_rating, my_complaint: complaints.get(rideId) ?? null };
  }

  async driverAvatarForCustomer(userId: string, rideId: string) {
    const customerId = await this.customerProfileId(userId);
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, customer_id: customerId },
      select: { driver: { select: { avatar_key: true } } },
    });
    const key = ride?.driver?.avatar_key;
    const data = key ? await this.driverAvatars.read(key) : null;
    if (!key || !data) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver photo not found');
    return { data, mime: passportIconMime(key) };
  }

  /** Customer photo for the assigned driver or a driver with a live pending offer. */
  async customerAvatarForDriver(userId: string, rideId: string) {
    const driver = await this.driverProfileByUser(userId);
    const ride = await this.prisma.goRide.findFirst({
      where: {
        id: rideId,
        OR: [
          { driver_id: driver.id },
          {
            offers: {
              some: {
                driver_id: driver.id,
                status: GoRideOfferStatus.PENDING,
                expires_at: { gt: new Date() },
              },
            },
          },
        ],
      },
      select: { customer: { select: { avatar_key: true } } },
    });
    const key = ride?.customer?.avatar_key;
    const data = key ? await this.customerAvatars.read(key) : null;
    if (!key || !data) throw new GoException(GoErrorCode.NOT_FOUND, 'Customer photo not found');
    return { data, mime: passportIconMime(key) };
  }

  async getForCustomer(userId: string, rideId: string) {
    const customerId = await this.customerProfileId(userId);
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, customer_id: customerId },
      include: rideInclude,
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    // Ticket §11.3 — own rating only; never counterparty rating/reasons/notes
    const my_rating = await this.ratings.myRatingFor(userId, rideId, 'customer');
    return { ...ride, my_rating };
  }

  /** Activity screen: every row is the same customer view as GET /customer/rides/:id. */
  async historyForCustomer(userId: string, q: RideHistoryQueryDto) {
    const customerId = await this.customerProfileId(userId);
    const where: Prisma.GoRideWhereInput = {
      customer_id: customerId,
      status: historyStatusFilter(q),
      created_at: {
        gte: q.from ? new Date(q.from) : undefined,
        lte: q.to ? new Date(q.to) : undefined,
      },
    };
    const orderBy: Prisma.GoRideOrderByWithRelationInput[] =
      q.scope === RideHistoryScope.CURRENT
        ? [{ type: 'asc' }, { scheduled_at: 'asc' }, { created_at: 'asc' }]
        : [{ created_at: 'desc' }];
    const { skip, take } = pageSkip(q.page, q.limit);
    const [rows, total] = await Promise.all([
      this.prisma.goRide.findMany({ where, include: customerRideInclude, orderBy, skip, take }),
      this.prisma.goRide.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const [ratings, complaints] = await Promise.all([
      this.customerView.myRatingStars(userId, ids),
      this.customerView.myComplaints(customerId, ids),
    ]);
    const items = await Promise.all(
      rows.map(async (ride) => ({
        ...(await this.customerView.view(ride)),
        my_rating: ratings.get(ride.id) ?? null,
        my_complaint: complaints.get(ride.id) ?? null,
      })),
    );
    return { items, page: skip / take + 1, limit: take, total, has_more: skip + rows.length < total };
  }

  /** What cancelling now would count as, without cancelling. */
  async cancelPreview(userId: string, rideId: string) {
    const ride = await this.getForCustomer(userId, rideId);
    const outcome = cancelOutcome(ride);
    return {
      ride_id: ride.id,
      status: ride.status,
      can_cancel: canCustomerCancel(ride.status),
      late_cancel: outcome.late_cancel,
      en_route_cancel: outcome.en_route_cancel,
      free_cancel_until: outcome.free_cancel_until,
    };
  }

  async cancelByCustomer(userId: string, rideId: string) {
    const ride = await this.getForCustomer(userId, rideId);
    if (!canCustomerCancel(ride.status)) {
      throw new GoException(GoErrorCode.RIDE_NOT_ACTIVE, 'Ride cannot be cancelled in current status');
    }
    assertTransition(ride.status, GoRideStatus.CANCELLED_BY_CUSTOMER);

    const { late_cancel, en_route_cancel, scoreEvent } = cancelOutcome(ride);

    const updated = await this.prisma.goRide.update({
      where: { id: ride.id },
      data: {
        status: GoRideStatus.CANCELLED_BY_CUSTOMER,
        cancelled_at: new Date(),
        cancel_actor_role: GoCancelActorRole.CUSTOMER,
        cancel_score_event: scoreEvent,
      },
      include: rideInclude,
    });

    await this.releaseRideResources(ride.id, ride.driver_id);
    await this.audit.log({
      actor: { id: userId, role: GoRole.CUSTOMER },
      action: AuditAction.RIDE_CANCELLED_BY_CUSTOMER,
      entity_type: 'ride',
      entity_id: ride.id,
      branch_id: ride.branch_id,
      metadata: {
        late_cancel,
        en_route_cancel,
        status_before: ride.status,
        assigned_at: ride.assigned_at?.toISOString() ?? null,
        arrived_at: ride.arrived_at?.toISOString() ?? null,
        cancel_score_event: scoreEvent,
      },
    });
    const cancelPayload = {
      ride_id: ride.id,
      status: GoRideStatus.CANCELLED_BY_CUSTOMER,
      cancelled_at: updated.cancelled_at?.toISOString() ?? new Date().toISOString(),
      late_cancel,
      en_route_cancel,
      assigned_at: ride.assigned_at?.toISOString() ?? null,
      arrived_at: ride.arrived_at?.toISOString() ?? null,
      created_at: ride.created_at.toISOString(),
      /** Policy: points only — never a cash cancel fee on the customer. */
      cash_fee: false,
    };
    if (ride.driver_id) {
      const driver = await this.prisma.goDriverProfile.findUnique({ where: { id: ride.driver_id } });
      if (driver) this.realtime.emitToDriver(driver.user_id, 'ride.customer_cancelled', cancelPayload);
    }
    if (scoreEvent) {
      await this.passport.applyEvent({
        customerId: ride.customer_id,
        eventType: scoreEvent,
        rideId: ride.id,
        customerUserId: userId,
      });
    }
    // Ticket §23.9 — do not expose score deltas to customer
    this.realtime.emitToCustomer(userId, 'ride.cancelled', {
      ride_id: ride.id,
      late_cancel,
      en_route_cancel,
      cash_fee: false,
    });
    this.realtime.emitToStaff(ride.branch_id, 'ride.cancelled', {
      ride_id: ride.id,
      by: 'customer',
      late_cancel,
      en_route_cancel,
    });
    return { ...updated, late_cancel, en_route_cancel, cash_fee: false };
  }

  async cancelByDriver(
    userId: string,
    rideId: string,
    body: { reason_code?: string; reason_text?: string } = {},
  ) {
    const driver = await this.driverProfileByUser(userId);
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, driver_id: driver.id },
      include: { customer: true },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    if (!canDriverCancel(ride.status)) {
      throw new GoException(GoErrorCode.RIDE_NOT_ACTIVE, 'Driver cannot cancel in current status');
    }
    assertTransition(ride.status, GoRideStatus.CANCELLED_BY_DRIVER);

    const reasonCode = body.reason_code?.trim() || 'DRIVER_CANCEL';
    const reasonText = body.reason_text?.trim() || null;

    const updated = await this.prisma.goRide.update({
      where: { id: rideId },
      data: {
        status: GoRideStatus.CANCELLED_BY_DRIVER,
        cancelled_at: new Date(),
        cancel_actor_role: GoCancelActorRole.DRIVER,
        cancel_reason_code: reasonCode,
        cancel_reason_text: reasonText,
        cancel_score_event: GoDriverPassportScoreEventType.DRIVER_CANCELLED_RIDE,
      },
      include: rideInclude,
    });

    await this.releaseRideResources(rideId, driver.id);

    const walletConfig = await this.wallets.getConfig();
    const penalty = walletConfig.driver_cancel_penalty_amount ?? RideDefaults.DRIVER_CANCEL_WALLET_PENALTY;
    await this.wallets.debitPenaltyOrDue({
      driverId: driver.id,
      amount: penalty,
      type: GoWalletTransactionType.DRIVER_CANCEL_PENALTY,
      rideId,
      reason: `driver_cancel; reason=${reasonCode}`,
      driverUserId: userId,
    });

    await this.driverPassport.applyEvent({
      driverId: driver.id,
      eventType: GoDriverPassportScoreEventType.DRIVER_CANCELLED_RIDE,
      rideId,
      driverUserId: userId,
      metadata: { reason_code: reasonCode },
    });

    await this.audit.log({
      actor: { id: userId, role: GoRole.DRIVER, branch_id: driver.branch_id },
      action: AuditAction.RIDE_CANCELLED_BY_DRIVER,
      entity_type: 'GoRide',
      entity_id: rideId,
      branch_id: ride.branch_id,
      metadata: { reason_code: reasonCode, reason_text: reasonText },
    });

    this.realtime.emitToCustomer(ride.customer.user_id, 'ride.driver_cancelled', {
      ride_id: rideId,
      reason_code: reasonCode,
    });
    this.realtime.emitToStaff(ride.branch_id, 'ride.driver_cancelled', { ride_id: rideId });
    return updated;
  }

  async cancelByStaff(
    actor: AuthUser,
    rideId: string,
    body: {
      reason?: string;
      reason_code?: string;
      penalize_customer?: boolean;
      penalize_driver?: boolean;
      wallet_penalty?: boolean;
    },
  ) {
    if (
      actor.role !== GoRole.CUSTOMER_SERVICE_SUPERVISOR &&
      actor.role !== GoRole.ADMIN &&
      actor.role !== GoRole.SUPER_ADMIN
    ) {
      throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, 'Only supervisor or admin can cancel rides');
    }

    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      include: { customer: true, driver: true },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    this.branchScope.assertAccess(actor, ride.branch_id);
    if (!canStaffCancel(ride.status)) {
      throw new GoException(GoErrorCode.RIDE_NOT_ACTIVE, 'Ride cannot be cancelled in current status');
    }
    assertTransition(ride.status, GoRideStatus.CANCELLED_BY_STAFF);

    const reasonText = body.reason?.trim() || null;
    const reasonCode = body.reason_code?.trim() || 'STAFF_CANCEL';
    const penalizeCustomer = Boolean(body.penalize_customer);
    const penalizeDriver = Boolean(body.penalize_driver);
    const walletPenalty = body.wallet_penalty !== false && penalizeDriver;

    const updated = await this.prisma.goRide.update({
      where: { id: rideId },
      data: {
        status: GoRideStatus.CANCELLED_BY_STAFF,
        cancelled_at: new Date(),
        cancel_actor_role: GoCancelActorRole.STAFF,
        cancel_reason_code: reasonCode,
        cancel_reason_text: reasonText,
        cancel_score_event: penalizeCustomer
          ? GoPassportScoreEventType.LATE_CANCELLATION
          : penalizeDriver
            ? GoDriverPassportScoreEventType.DRIVER_CANCELLED_RIDE
            : null,
      },
      include: rideInclude,
    });

    await this.releaseRideResources(rideId, ride.driver_id);

    if (penalizeCustomer) {
      await this.passport.applyEvent({
        customerId: ride.customer_id,
        eventType: GoPassportScoreEventType.LATE_CANCELLATION,
        rideId,
        customerUserId: ride.customer.user_id,
      });
    }

    if (penalizeDriver && ride.driver_id && ride.driver) {
      await this.driverPassport.applyEvent({
        driverId: ride.driver_id,
        eventType: GoDriverPassportScoreEventType.DRIVER_CANCELLED_RIDE,
        rideId,
        driverUserId: ride.driver.user_id,
        metadata: { by: 'staff', reason_code: reasonCode },
      });
      if (walletPenalty) {
        const walletConfig = await this.wallets.getConfig();
        const penalty = walletConfig.driver_cancel_penalty_amount ?? RideDefaults.DRIVER_CANCEL_WALLET_PENALTY;
        await this.wallets.debitPenaltyOrDue({
          driverId: ride.driver_id,
          amount: penalty,
          type: GoWalletTransactionType.DRIVER_CANCEL_PENALTY,
          rideId,
          reason: `staff_cancel; reason=${reasonCode}`,
          driverUserId: ride.driver.user_id,
          createdById: actor.id,
        });
      }
    }

    await this.audit.log({
      actor,
      action: AuditAction.RIDE_CANCELLED_BY_STAFF,
      entity_type: 'GoRide',
      entity_id: rideId,
      branch_id: ride.branch_id,
      metadata: {
        reason_code: reasonCode,
        reason: reasonText,
        penalize_customer: penalizeCustomer,
        penalize_driver: penalizeDriver,
        wallet_penalty: walletPenalty,
      },
    });

    this.realtime.emitToCustomer(ride.customer.user_id, 'ride.cancelled', {
      ride_id: rideId,
      by: 'staff',
    });
    if (ride.driver) {
      this.realtime.emitToDriver(ride.driver.user_id, 'ride.staff_cancelled', { ride_id: rideId });
    }
    this.realtime.emitToStaff(ride.branch_id, 'ride.staff_cancelled', { ride_id: rideId });
    return updated;
  }

  private async releaseRideResources(rideId: string, driverId: string | null | undefined) {
    await this.wallets.releaseHold(rideId);
    await this.discounts.releaseForRide(rideId);
    await this.customerWallets.refundRide(rideId, 'ride_cancelled');
    if (driverId) {
      await this.prisma.goDriverState.updateMany({
        where: { driver_id: driverId, OR: [{ current_ride_id: rideId }, { next_ride_id: rideId }] },
        data: { current_ride_id: null, next_ride_id: null, availability: GoDriverAvailability.ONLINE },
      });
    }
  }

  private assertEditableRoute(status: GoRideStatus) {
    if (
      status === GoRideStatus.COMPLETED ||
      status === GoRideStatus.CANCELLED_BY_CUSTOMER ||
      status === GoRideStatus.CANCELLED_BY_DRIVER ||
      status === GoRideStatus.CANCELLED_BY_STAFF ||
      status === GoRideStatus.NO_SHOW ||
      status === GoRideStatus.FAILED_NO_DRIVER ||
      status === GoRideStatus.REPLACED
    ) {
      throw new GoException(GoErrorCode.RIDE_NOT_ACTIVE, 'Cannot modify route on this ride');
    }
  }

  async addStop(userId: string, rideId: string, dto: AddStopDto) {
    const ride = await this.getForCustomer(userId, rideId);
    this.assertEditableRoute(ride.status);
    const stops = [...ride.stops].sort((a, b) => a.sequence - b.sequence);
    const insertAt = dto.position ? Math.min(Math.max(dto.position, 1), stops.length + 1) : stops.length + 1;
    await this.prisma.$transaction(async (tx) => {
      for (const s of stops.filter((x) => x.sequence >= insertAt).reverse()) {
        await tx.goRideStop.update({ where: { id: s.id }, data: { sequence: s.sequence + 1 } });
      }
      await tx.goRideStop.create({
        data: {
          ride_id: rideId,
          sequence: insertAt,
          latitude: dto.lat,
          longitude: dto.lng,
          address: dto.address,
        },
      });
    });
    return this.reestimateAndNotify(rideId, userId);
  }

  async updateStop(userId: string, rideId: string, stopId: string, dto: LatLngDto) {
    const ride = await this.getForCustomer(userId, rideId);
    this.assertEditableRoute(ride.status);
    const stop = ride.stops.find((s) => s.id === stopId);
    if (!stop) throw new GoException(GoErrorCode.NOT_FOUND, 'Stop not found');
    await this.prisma.goRideStop.update({
      where: { id: stopId },
      data: { latitude: dto.lat, longitude: dto.lng, address: dto.address },
    });
    return this.reestimateAndNotify(rideId, userId);
  }

  async deleteStop(userId: string, rideId: string, stopId: string) {
    const ride = await this.getForCustomer(userId, rideId);
    this.assertEditableRoute(ride.status);
    if (!ride.stops.some((s) => s.id === stopId)) throw new GoException(GoErrorCode.NOT_FOUND, 'Stop not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.goRideStop.delete({ where: { id: stopId } });
      const remaining = await tx.goRideStop.findMany({ where: { ride_id: rideId }, orderBy: { sequence: 'asc' } });
      for (let i = 0; i < remaining.length; i++) {
        await tx.goRideStop.update({ where: { id: remaining[i].id }, data: { sequence: i + 1 } });
      }
    });
    return this.reestimateAndNotify(rideId, userId);
  }

  async reorderStops(userId: string, rideId: string, stopIds: string[]) {
    const ride = await this.getForCustomer(userId, rideId);
    this.assertEditableRoute(ride.status);
    if (stopIds.length !== ride.stops.length || new Set(stopIds).size !== stopIds.length) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'stop_ids must list every stop exactly once');
    }
    for (const id of stopIds) {
      if (!ride.stops.some((s) => s.id === id)) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Unknown stop id');
    }
    await this.prisma.$transaction(
      stopIds.map((id, i) => this.prisma.goRideStop.update({ where: { id }, data: { sequence: i + 1 } })),
    );
    return this.reestimateAndNotify(rideId, userId);
  }

  /** Editable only while no driver is attached to the ride. */
  async updateNote(userId: string, rideId: string, note: string | null | undefined) {
    const ride = await this.getForCustomer(userId, rideId);
    if (ride.status !== GoRideStatus.SEARCHING || ride.driver_id) {
      throw new GoException(GoErrorCode.RIDE_NOT_ACTIVE, 'Note can only be changed before a driver is assigned');
    }
    return this.prisma.goRide.update({
      where: { id: rideId },
      data: { customer_note: normalizeNote(note) },
      include: rideInclude,
    });
  }

  async changeDestination(userId: string, rideId: string, dto: LatLngDto) {
    const ride = await this.getForCustomer(userId, rideId);
    this.assertEditableRoute(ride.status);
    await this.prisma.goRide.update({
      where: { id: rideId },
      data: {
        original_destination_lat: dto.lat,
        original_destination_lng: dto.lng,
        original_destination_address: dto.address,
      },
    });
    return this.reestimateAndNotify(rideId, userId);
  }

  /**
   * Amend pickup before the driver marks ARRIVED.
   * Distinguishes pin vs GPS via `source`; every change is audited for disputes.
   */
  async changePickup(userId: string, rideId: string, dto: UpdatePickupDto) {
    const ride = await this.getForCustomer(userId, rideId);
    const editable =
      ride.status === GoRideStatus.SEARCHING ||
      ride.status === GoRideStatus.DRIVER_ASSIGNED ||
      ride.status === GoRideStatus.DRIVER_EN_ROUTE;
    if (!editable) {
      throw new GoException(
        GoErrorCode.RIDE_NOT_ACTIVE,
        'Pickup can only be changed before the driver arrives',
        { status: ride.status },
      );
    }
    const previous = {
      lat: Number(ride.pickup_lat),
      lng: Number(ride.pickup_lng),
      address: ride.pickup_address,
      source: ride.pickup_source,
    };
    await this.prisma.goRide.update({
      where: { id: rideId },
      data: {
        pickup_lat: dto.lat,
        pickup_lng: dto.lng,
        pickup_address: dto.address ?? null,
        pickup_source: dto.source ?? ride.pickup_source,
        pickup_updated_at: new Date(),
        pickup_h3: safeH3Index(dto.lat, dto.lng),
      },
    });
    await this.audit.log({
      actor: { id: userId, role: GoRole.CUSTOMER },
      action: AuditAction.RIDE_PICKUP_UPDATED,
      entity_type: 'ride',
      entity_id: rideId,
      branch_id: ride.branch_id,
      metadata: {
        previous,
        next: {
          lat: dto.lat,
          lng: dto.lng,
          address: dto.address ?? null,
          source: dto.source ?? ride.pickup_source,
        },
        ride_status: ride.status,
        had_driver: !!ride.driver_id,
      },
    });
    const updated = await this.reestimateAndNotify(rideId, userId);
    const pickupPayload = {
      ride_id: rideId,
      pickup: {
        lat: dto.lat,
        lng: dto.lng,
        address: dto.address ?? null,
        source: dto.source ?? updated.pickup_source,
      },
      pickup_updated_at: updated.pickup_updated_at?.toISOString() ?? new Date().toISOString(),
      estimated_distance_m: updated.estimated_distance_m,
      estimated_duration_sec: updated.estimated_duration_sec,
      estimated_fare: updated.estimated_fare != null ? decimalToNumber(updated.estimated_fare) : null,
    };
    this.realtime.emitToCustomer(userId, 'ride.pickup_updated', pickupPayload);
    if (ride.driver?.user_id) {
      this.realtime.emitToDriver(ride.driver.user_id, 'ride.pickup_updated', pickupPayload);
    }
    return updated;
  }

  /** Staff timeline for complaint / late-arrival disputes — derived timestamps, not a GPS verdict. */
  async timeline(actor: AuthUser, rideId: string) {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      include: {
        offers: { orderBy: { offered_at: 'asc' }, select: { id: true, driver_id: true, status: true, offered_at: true, expires_at: true, responded_at: true } },
      },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    this.branchScope.assertAccess(actor, ride.branch_id);

    const audits = await this.prisma.goAuditLog.findMany({
      where: { entity_type: 'ride', entity_id: rideId },
      orderBy: { created_at: 'asc' },
      select: { action: true, created_at: true, metadata: true, actor_role: true },
    });

    type TimelineEvent = {
      type: string;
      at: string;
      source: string;
      verification?: string;
      details?: Record<string, unknown>;
    };
    const events: TimelineEvent[] = [];
    const push = (type: string, at: Date | null | undefined, source: string, extra?: Partial<TimelineEvent>) => {
      if (!at) return;
      events.push({ type, at: at.toISOString(), source, ...extra });
    };

    push('CREATED', ride.created_at, 'ride.created_at');
    for (const offer of ride.offers) {
      push('OFFERED', offer.offered_at, 'offer.offered_at', {
        details: { offer_id: offer.id, driver_id: offer.driver_id, status: offer.status },
      });
    }
    push('ASSIGNED', ride.assigned_at, 'ride.assigned_at', {
      details: { driver_id: ride.driver_id },
      verification: 'SERVER',
    });
    // Immediate accepts often jump to DRIVER_EN_ROUTE at assignment; scheduled may stay ASSIGNED (reserved).
    const likelyEnRoute =
      !!ride.arrived_at ||
      !!ride.started_at ||
      ride.status === GoRideStatus.DRIVER_EN_ROUTE ||
      ride.status === GoRideStatus.ARRIVED ||
      ride.status === GoRideStatus.IN_PROGRESS ||
      ride.status === GoRideStatus.COMPLETED ||
      ride.status === GoRideStatus.NO_SHOW ||
      ride.cancel_score_event === GoPassportScoreEventType.EN_ROUTE_CANCELLATION;
    if (likelyEnRoute) {
      push('EN_ROUTE', ride.assigned_at, 'ride.assigned_at', {
        details: { note: 'No separate en_route_at column; timestamp inferred from assignment when the driver was moving' },
        verification: 'INFERRED',
      });
    }
    push('ARRIVED', ride.arrived_at, 'ride.arrived_at', {
      verification: 'DRIVER_MARKED',
      details: { caveat: 'GPS proximity alone is not stored as conclusive proof' },
    });
    push('STARTED', ride.started_at, 'ride.started_at', { verification: 'DRIVER_MARKED' });
    push('COMPLETED', ride.completed_at, 'ride.completed_at');
    push('NO_SHOW', ride.no_show_at, 'ride.no_show_at', { verification: 'DRIVER_MARKED_AFTER_WAIT' });
    push('CANCELLED', ride.cancelled_at, 'ride.cancelled_at', {
      details: {
        actor: ride.cancel_actor_role,
        reason_code: ride.cancel_reason_code,
        reason_text: ride.cancel_reason_text,
        score_event: ride.cancel_score_event,
        status: ride.status,
      },
    });

    for (const row of audits) {
      if (row.action === AuditAction.RIDE_PICKUP_UPDATED) {
        push('PICKUP_UPDATED', row.created_at, 'audit.ride.pickup_updated', {
          details: (row.metadata as Record<string, unknown>) ?? {},
          verification: 'CUSTOMER_REQUEST',
        });
      }
      if (row.action === AuditAction.RIDE_BREAKDOWN_REPORTED) {
        push('BREAKDOWN_REPORTED', row.created_at, 'audit.ride.breakdown_reported', {
          details: (row.metadata as Record<string, unknown>) ?? {},
          verification: 'DRIVER_MARKED',
        });
      }
    }

    events.sort((a, b) => a.at.localeCompare(b.at));

    return {
      ride_id: ride.id,
      public_number: ride.public_number,
      status: ride.status,
      pickup: {
        lat: Number(ride.pickup_lat),
        lng: Number(ride.pickup_lng),
        address: ride.pickup_address,
        source: ride.pickup_source,
        updated_at: ride.pickup_updated_at?.toISOString() ?? null,
      },
      caveats: [
        'GPS_NOT_CONCLUSIVE',
        'NETWORK_MAY_DELAY_EVENTS',
        'ARRIVED_IS_DRIVER_MARKED',
        'EN_ROUTE_TIME_INFERRED_FROM_ASSIGNED',
      ],
      events,
    };
  }

  private async reestimateAndNotify(rideId: string, customerUserId: string) {
    const ride = await this.prisma.goRide.findUniqueOrThrow({
      where: { id: rideId },
      include: { ...rideInclude, ride_category: { include: { pricing: true } } },
    });
    const points = [
      { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) },
      ...ride.stops.map((s) => ({ lat: Number(s.latitude), lng: Number(s.longitude) })),
      { lat: Number(ride.original_destination_lat), lng: Number(ride.original_destination_lng) },
    ];
    const chosen = await this.route.estimate(points);
    const fare = fareFromPricingSnapshot(
      ride.pricing_snapshot,
      ridePricing(ride.pricing_snapshot, ride.ride_category.pricing),
      chosen.distance_m,
      chosen.duration_sec,
      ride.vehicles_count,
    );
    const updated = await this.prisma.goRide.update({
      where: { id: rideId },
      data: {
        estimated_distance_m: chosen.distance_m,
        estimated_duration_sec: chosen.duration_sec,
        estimated_fare: fare.final_fare,
        estimated_route_polyline: chosen.encoded_polyline,
        estimated_route_source: chosen.source,
        estimated_route_summary: chosen.summary || null,
      },
      include: rideInclude,
    });
    const payload = {
      ride_id: rideId,
      estimated_distance_m: chosen.distance_m,
      estimated_duration_sec: chosen.duration_sec,
      estimated_fare: decimalToNumber(fare.final_fare),
      encoded_polyline: chosen.encoded_polyline,
      source: chosen.source,
    };
    this.realtime.emitToCustomer(customerUserId, 'ride.route_updated', payload);
    this.realtime.emitToCustomer(customerUserId, 'ride.estimated_fare_updated', payload);
    if (ride.driver?.user_id) {
      this.realtime.emitToDriver(ride.driver.user_id, 'ride.route_updated', payload);
      this.realtime.emitToDriver(ride.driver.user_id, 'ride.stop_updated', payload);
    }
    return updated;
  }

  /**
   * Manual assign (ERP bridge). Immediate → EN_ROUTE; Scheduled → reserved ASSIGNED + lifecycle jobs.
   */
  async assignDriver(actor: AuthUser, rideId: string, dto: AssignDriverDto) {
    const ride = await this.prisma.goRide.findUnique({ where: { id: rideId }, include: rideInclude });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    this.branchScope.assertAccess(actor, ride.branch_id);

    return this.locks.withLock(`ride-assign:${rideId}`, async () => {
      const fresh = await this.prisma.goRide.findUniqueOrThrow({ where: { id: rideId } });
      if (fresh.status !== GoRideStatus.SEARCHING) {
        throw new GoException(GoErrorCode.RIDE_ALREADY_TAKEN, 'Ride is not searching');
      }
      const driver = await this.prisma.goDriverProfile.findUnique({
        where: { id: dto.driver_id },
        include: { state: true, user: true },
      });
      if (!driver || !driver.user.is_active || driver.is_suspended) {
        throw new GoException(GoErrorCode.DRIVER_NOT_ELIGIBLE, 'Driver not eligible', {
          reasons: ['ACCOUNT_SUSPENDED'],
        });
      }
      if (
        ride.requirements.some((r) => r.type === GoRideRequirementType.FEMALE_DRIVER) &&
        driver.gender !== GoDriverGender.FEMALE
      ) {
        throw new GoException(GoErrorCode.DRIVER_NOT_ELIGIBLE, 'Ride requires a female driver', {
          reasons: ['FEMALE_DRIVER_REQUIRED'],
        });
      }
      const isScheduled = fresh.type === GoRideType.SCHEDULED;
      assertTransition(GoRideStatus.SEARCHING, GoRideStatus.DRIVER_ASSIGNED);
      if (!isScheduled) {
        assertTransition(GoRideStatus.DRIVER_ASSIGNED, GoRideStatus.DRIVER_EN_ROUTE);
      }

      const from =
        driver.state?.last_lat != null && driver.state.last_lng != null
          ? { lat: Number(driver.state.last_lat), lng: Number(driver.state.last_lng) }
          : null;
      const toPickupDistanceM = toPickupHaversineM(from, {
        lat: fresh.pickup_lat,
        lng: fresh.pickup_lng,
      });

      const updated = await this.prisma.$transaction(async (tx) => {
        const r = await tx.goRide.update({
          where: { id: rideId },
          data: {
            driver_id: driver.id,
            status: isScheduled ? GoRideStatus.DRIVER_ASSIGNED : GoRideStatus.DRIVER_EN_ROUTE,
            assigned_at: new Date(),
            to_pickup_distance_m: toPickupDistanceM ?? undefined,
            ...(await assignedVehicleData(tx, driver.id)),
          },
          include: rideInclude,
        });
        if (isScheduled) {
          await tx.goDriverState.upsert({
            where: { driver_id: driver.id },
            create: {
              driver_id: driver.id,
              availability: GoDriverAvailability.ONLINE,
              next_ride_id: rideId,
            },
            update: { next_ride_id: rideId },
          });
        } else {
          await tx.goDriverState.upsert({
            where: { driver_id: driver.id },
            create: {
              driver_id: driver.id,
              availability: GoDriverAvailability.BUSY,
              current_ride_id: rideId,
            },
            update: {
              availability: GoDriverAvailability.BUSY,
              current_ride_id: rideId,
            },
          });
        }
        return r;
      });

      await this.dispatch.expireOffersForRide(rideId);
      if (isScheduled) await this.scheduled.scheduleLifecycle(rideId);
      const assignedDriver = await this.prisma.goDriverProfile.findUniqueOrThrow({
        where: { id: driver.id },
        select: customerDriverSelect,
      });
      this.realtime.emitToCustomer(ride.customer.user_id, 'ride.driver_assigned', {
        ride_id: rideId,
        driver_id: driver.id,
        status: updated.status,
        reserved: isScheduled,
        driver: await driverCard(this.prisma, rideId, assignedDriver),
        vehicle: rideVehicle(updated.vehicle_snapshot),
      });
      this.realtime.emitToDriver(driver.user_id, 'ride.assigned', { ride_id: rideId, reserved: isScheduled });
      return updated;
    });
  }

  async startByDriver(userId: string, rideId: string, loc?: { lat?: number; lng?: number }) {
    const driver = await this.driverProfileByUser(userId);
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, driver_id: driver.id },
      include: { customer: true },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    assertTransition(ride.status, GoRideStatus.IN_PROGRESS);
    const updated = await this.prisma.goRide.update({
      where: { id: rideId },
      data: {
        status: GoRideStatus.IN_PROGRESS,
        started_at: new Date(),
        actual_start_lat: loc?.lat ?? Number(ride.pickup_lat),
        actual_start_lng: loc?.lng ?? Number(ride.pickup_lng),
        // Reset so empty-leg GPS (to pickup) never enters fare / commission.
        actual_distance_m: 0,
        actual_duration_sec: 0,
      },
      include: rideInclude,
    });
    await this.redis.del(`ride:track:${rideId}`);
    this.realtime.emitToCustomer(ride.customer.user_id, 'ride.started', { ride_id: rideId });
    return this.withDriverRideExtras(updated, driver.id);
  }

  /** ARRIVE-001 — idempotent: already ARRIVED returns the current ride (auto-arrive race). */
  async markArrived(userId: string, rideId: string) {
    const driver = await this.driverProfileByUser(userId);
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, driver_id: driver.id },
      include: rideInclude,
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    if (ride.status === GoRideStatus.ARRIVED) {
      return this.withDriverRideExtras(ride, driver.id);
    }
    assertTransition(ride.status, GoRideStatus.ARRIVED);
    const updated = await this.prisma.goRide.update({
      where: { id: rideId },
      data: { status: GoRideStatus.ARRIVED, arrived_at: new Date() },
      include: rideInclude,
    });
    const payload = { ride_id: rideId, auto: false };
    this.realtime.emitToCustomer(ride.customer.user_id, 'ride.driver_arrived', payload);
    this.realtime.emitToDriver(userId, 'ride.driver_arrived', payload);
    return this.withDriverRideExtras(updated, driver.id);
  }

  async noShow(userId: string, rideId: string) {
    const driver = await this.driverProfileByUser(userId);
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, driver_id: driver.id },
      include: { customer: true },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    if (ride.status !== GoRideStatus.ARRIVED || !ride.arrived_at) {
      throw new GoException(GoErrorCode.INVALID_RIDE_TRANSITION, 'Ride must be ARRIVED');
    }
    const elapsed = (Date.now() - ride.arrived_at.getTime()) / 1000;
    if (elapsed < RideDefaults.NO_SHOW_AFTER_ARRIVED_SEC) {
      throw new GoException(GoErrorCode.ARRIVAL_WAIT_NOT_COMPLETE, 'No-show threshold not reached', {
        retry_after_sec: Math.ceil(RideDefaults.NO_SHOW_AFTER_ARRIVED_SEC - elapsed),
      });
    }
    assertTransition(ride.status, GoRideStatus.NO_SHOW);
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.goRide.update({
        where: { id: rideId },
        data: { status: GoRideStatus.NO_SHOW, no_show_at: new Date() },
        include: rideInclude,
      });
      await tx.goDriverState.updateMany({
        where: { driver_id: driver.id },
        data: { current_ride_id: null, availability: GoDriverAvailability.ONLINE },
      });
      return r;
    });
    await this.discounts.releaseForRide(rideId);
    await this.wallets.releaseHold(rideId);
    await this.customerWallets.refundRide(rideId, 'ride_no_show');
    await this.passport.applyEvent({
      customerId: ride.customer_id,
      eventType: GoPassportScoreEventType.NO_SHOW,
      rideId,
      customerUserId: ride.customer.user_id,
    });
    // Ticket §23.9 — do not expose score deltas to customer
    this.realtime.emitToCustomer(ride.customer.user_id, 'ride.no_show', {
      ride_id: rideId,
    });
    return updated;
  }

  async endByDriver(userId: string, rideId: string, dto: EndRideDto = {}) {
    const driver = await this.driverProfileByUser(userId);
    return this.locks.withLock(`ride-finalize:${rideId}`, async () => {
      const ride = await this.prisma.goRide.findFirst({
        where: { id: rideId, driver_id: driver.id },
        include: {
          customer: true,
          ride_category: { include: { pricing: true } },
          stops: true,
          replacement_of_ride: true,
        },
      });
      if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
      assertTransition(ride.status, GoRideStatus.COMPLETED);
      if (!ride.started_at) throw new GoException(GoErrorCode.INVALID_RIDE_TRANSITION, 'Ride not started');

      const dropLat = dto.lat ?? Number(ride.original_destination_lat);
      const dropLng = dto.lng ?? Number(ride.original_destination_lng);
      const points = [
        { lat: Number(ride.actual_start_lat ?? ride.pickup_lat), lng: Number(ride.actual_start_lng ?? ride.pickup_lng) },
        ...ride.stops.map((s) => ({ lat: Number(s.latitude), lng: Number(s.longitude) })),
        { lat: dropLat, lng: dropLng },
      ];
      const estimated = await this.route.estimate(points);
      // Ticket §9.5 / §6.5 — fare may fall back to route estimate; response actual_* never use estimated_*.
      const tracked = await this.distanceFromRideTrack(rideId);
      const wallDuration = Math.max(1, Math.round((Date.now() - ride.started_at.getTime()) / 1000));
      const trackDistance =
        tracked?.distance_m && tracked.distance_m > 0 ? tracked.distance_m : null;
      const trackDuration =
        tracked?.duration_sec && tracked.duration_sec > 0 ? tracked.duration_sec : null;
      const distance_m = trackDistance ?? estimated.distance_m;
      const duration_sec = Math.max(1, trackDuration ?? wallDuration);
      const actual_distance_m = trackDistance ?? 0;
      const actual_duration_sec = duration_sec;
      let billable_waiting_sec = 0;
      if (ride.arrived_at && ride.started_at) {
        const wait = Math.max(0, Math.round((ride.started_at.getTime() - ride.arrived_at.getTime()) / 1000));
        billable_waiting_sec = Math.max(0, wait - RideDefaults.FREE_WAITING_SEC);
      }
      const fare = fareFromPricingSnapshot(
        ride.pricing_snapshot,
        ridePricing(ride.pricing_snapshot, ride.ride_category.pricing),
        distance_m,
        duration_sec + billable_waiting_sec,
        ride.vehicles_count,
      );
      const segmentGross = fare.final_fare;
      const originalSegment = ride.replacement_of_ride?.gross_final_fare
        ? new Prisma.Decimal(ride.replacement_of_ride.gross_final_fare)
        : new Prisma.Decimal(0);
      // Ticket §17.2 — combined customer fare on replacement ride record.
      const combinedGross = originalSegment.plus(segmentGross);
      const persistedGross = ride.replacement_of_ride_id ? combinedGross : segmentGross;

      await this.prisma.$transaction(async (tx) => {
        await tx.goRide.update({
          where: { id: rideId },
          data: {
            status: GoRideStatus.COMPLETED,
            completed_at: new Date(),
            actual_dropoff_lat: dropLat,
            actual_dropoff_lng: dropLng,
            actual_distance_m,
            actual_duration_sec,
            billable_waiting_sec,
            gross_final_fare: persistedGross,
          },
        });
        await this.driverPassport.recordCompletedRide(driver.id, tx);
      });
      const settled = await this.fareSettlement.settle(rideId, combinedGross);
      const payable = settled.payable;
      const discount = settled.discountTotal;
      const updated = await this.prisma.goRide.findUniqueOrThrow({ where: { id: rideId }, include: rideInclude });

      await this.passport.applyEvent({
        customerId: ride.customer_id,
        eventType: GoPassportScoreEventType.RIDE_COMPLETED,
        rideId,
        rideCategoryId: ride.ride_category_id,
        customerUserId: ride.customer.user_id,
      });

      // Ticket §20 — commission before promote so WALLET_DUE offline wins over next-ride promotion.
      // Discounts are platform-funded: driver commission always uses gross when discount_total > 0.
      const walletConfig = await this.wallets.getConfig();
      const commissionBaseFare =
        discount.gt(0) || walletConfig.commission_base !== GoCommissionBase.CUSTOMER_PAYABLE
          ? segmentGross
          : payable;
      const expectedCommission = this.wallets.expectedCommission(
        commissionBaseFare,
        walletConfig.commission_percentage,
      );

      let commission: {
        deducted: Prisma.Decimal;
        commission: Prisma.Decimal;
        shortfall: Prisma.Decimal;
        discountSubsidy: Prisma.Decimal;
      } | null = null;
      let finalizeFailed = false;
      try {
        commission = await this.wallets.finalizeRideCommission({
          driverId: driver.id,
          rideId,
          grossFinalFare: segmentGross,
          customerPayable: payable,
          discountTotal: discount,
          driverUserId: userId,
        });
      } catch (err) {
        finalizeFailed = true;
        // Completion already committed; log via realtime only.
        this.realtime.emitToDriver(userId, 'wallet.updated', {
          error: (err as Error).message,
          ride_id: rideId,
        });
      }

      const commissionAmount = commission?.commission ?? expectedCommission;
      const commissionDeducted = commission?.deducted ?? new Prisma.Decimal(0);
      const discountSubsidy = commission?.discountSubsidy ?? (discount.gt(0) ? discount : new Prisma.Decimal(0));
      const commissionStatus = resolveCommissionStatus({
        expected: commissionAmount,
        deducted: commissionDeducted,
        finalizeFailed,
      });

      try {
        await this.incentives.grantRideBonus({ rideId, driverId: driver.id, gross: segmentGross, distanceM: distance_m });
      } catch (err) {
        this.logger.warn(`Ride bonus for ${rideId} failed: ${(err as Error).message}`);
      }

      const forcedOffline = commission?.shortfall != null && commission.shortfall.gt(0);
      if (forcedOffline) {
        // Ensure idle + offline after shortfall (promote would re-busy the driver).
        await this.prisma.goDriverState.updateMany({
          where: { driver_id: driver.id },
          data: {
            availability: GoDriverAvailability.OFFLINE,
            current_ride_id: null,
            next_ride_id: null,
          },
        });
        await this.sessions.close(driver.id, GoOnlineSessionEnd.FORCED_OFFLINE);
      } else {
        await this.dispatch.promoteNextRide(driver.id);
      }

      const changeReturned = await this.customerWallets.findChangeReturn(rideId, RIDE_CHANGE_RETURN_REASON);
      const invoice = buildDriverInvoice({
        grossFare: persistedGross,
        customerPayable: payable,
        discountTotal: discount,
        discountSubsidy,
        segmentGross,
        originalSegment,
        combinedGross,
        commissionBase: walletConfig.commission_base,
        commissionPercentage: walletConfig.commission_percentage,
        commissionAmount,
        commissionDeducted,
        commissionStatus,
        paymentMethod: updated.payment_method,
        walletPaidAmount: updated.wallet_paid_amount,
        changeReturnedAmount: changeReturned?.amount ?? 0,
        canReturnChange: !changeReturned,
        actualDistanceM: actual_distance_m,
        actualDurationSec: actual_duration_sec,
        completedAt: updated.completed_at,
        pickupAddress: updated.pickup_address,
        destinationAddress: updated.original_destination_address,
        serviceCode: updated.service_code,
        billableWaitingSec: billable_waiting_sec,
      });

      const myRating = await this.ratings.myRatingFor(userId, rideId, 'driver');
      const rating = {
        can_rate: myRating == null,
        my_rating: myRating ? { stars: myRating.stars } : null,
        submit_path: `/api/v1/go/driver/rides/${rideId}/rating`,
      };
      const customer = invoiceCustomerCard(rideId, updated.customer);
      const wallet = {
        forced_offline: !!forcedOffline,
        commission_shortfall: commission?.shortfall != null ? decimalToNumber(commission.shortfall) : null,
        commission_status: invoice.commission_status,
      };

      this.realtime.emitToCustomer(ride.customer.user_id, 'ride.completed', {
        ride_id: rideId,
        customer_payable: decimalToNumber(payable),
        combined_gross_fare: decimalToNumber(combinedGross),
        original_segment_fare: decimalToNumber(originalSegment),
        replacement_segment_fare: decimalToNumber(segmentGross),
        discount_total: decimalToNumber(discount),
        compensation_total: decimalToNumber(settled.compensationTotal),
        fare_stack_decision: settled.decision,
        payment_method: updated.payment_method,
        payment_status: updated.payment_status,
        wallet_paid_amount: decimalToNumber(updated.wallet_paid_amount),
        cash_due: invoice.cash_due,
      });
      return {
        ...updated,
        customer,
        combined_gross_fare: invoice.combined_gross_fare,
        original_segment_fare: invoice.original_segment_fare,
        replacement_segment_fare: invoice.replacement_segment_fare,
        commission_deducted: invoice.commission_deducted,
        commission_amount: invoice.commission_amount,
        commission_status: invoice.commission_status,
        driver_earnings: invoice.driver_earnings,
        invoice,
        rating,
        wallet,
      };
    });
  }

  /** Rebuild the driver invoice for a COMPLETED ride (re-open after crash / leave). */
  async getInvoiceForDriver(userId: string, rideId: string) {
    const driver = await this.driverProfileByUser(userId);
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, driver_id: driver.id },
      include: {
        replacement_of_ride: { select: { gross_final_fare: true } },
        customer: { select: driverRideCustomerSelect },
      },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    if (ride.status !== GoRideStatus.COMPLETED) {
      throw new GoException(GoErrorCode.INVALID_RIDE_TRANSITION, 'Invoice is available after the ride is completed');
    }
    if (ride.gross_final_fare == null || ride.completed_at == null) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Ride fare is not finalized');
    }

    const originalSegment = ride.replacement_of_ride?.gross_final_fare
      ? new Prisma.Decimal(ride.replacement_of_ride.gross_final_fare)
      : new Prisma.Decimal(0);
    const combinedGross = new Prisma.Decimal(ride.gross_final_fare);
    const segmentGross = ride.replacement_of_ride_id
      ? combinedGross.minus(originalSegment)
      : combinedGross;

    const walletConfig = await this.wallets.getConfig();
    const discountTotal = new Prisma.Decimal(ride.discount_total ?? 0);
    const commissionBaseFare =
      discountTotal.gt(0) || walletConfig.commission_base !== GoCommissionBase.CUSTOMER_PAYABLE
        ? segmentGross
        : new Prisma.Decimal(ride.customer_payable ?? 0);
    const expected = this.wallets.expectedCommission(commissionBaseFare, walletConfig.commission_percentage);

    const [tx, subsidyTx] = await Promise.all([
      this.prisma.goDriverWalletTransaction.findFirst({
        where: {
          ride_id: rideId,
          driver_id: driver.id,
          type: GoWalletTransactionType.COMMISSION_DEDUCTION,
        },
        orderBy: { created_at: 'desc' },
        select: { amount: true, reason: true, type: true },
      }),
      this.prisma.goDriverWalletTransaction.findFirst({
        where: {
          ride_id: rideId,
          driver_id: driver.id,
          type: GoWalletTransactionType.DISCOUNT_SUBSIDY,
        },
        select: { amount: true },
      }),
    ]);
    const { amount, deducted, status } = commissionFromLedger(expected, tx);
    const changeReturned = await this.customerWallets.findChangeReturn(rideId, RIDE_CHANGE_RETURN_REASON);

    const invoice = buildDriverInvoice({
      grossFare: combinedGross,
      customerPayable: ride.customer_payable,
      discountTotal: ride.discount_total,
      discountSubsidy: subsidyTx?.amount ?? ride.discount_total,
      segmentGross,
      originalSegment,
      combinedGross,
      commissionBase: walletConfig.commission_base,
      commissionPercentage: walletConfig.commission_percentage,
      commissionAmount: amount,
      commissionDeducted: deducted,
      commissionStatus: status,
      paymentMethod: ride.payment_method,
      walletPaidAmount: ride.wallet_paid_amount,
      changeReturnedAmount: changeReturned?.amount ?? 0,
      canReturnChange: !changeReturned,
      actualDistanceM: ride.actual_distance_m,
      actualDurationSec: ride.actual_duration_sec,
      completedAt: ride.completed_at,
      pickupAddress: ride.pickup_address,
      destinationAddress: ride.original_destination_address,
      serviceCode: ride.service_code,
      billableWaitingSec: ride.billable_waiting_sec,
    });

    const myRating = await this.ratings.myRatingFor(userId, rideId, 'driver');
    return {
      id: ride.id,
      status: ride.status,
      customer: invoiceCustomerCard(rideId, ride.customer),
      invoice,
      rating: {
        can_rate: myRating == null,
        my_rating: myRating ? { stars: myRating.stars } : null,
        submit_path: `/api/v1/go/driver/rides/${rideId}/rating`,
      },
    };
  }

  /**
   * After COMPLETED: driver enters cash received; excess (الباقي) is credited to the customer wallet
   * and debited from the driver wallet. Idempotent per ride.
   */
  async returnChangeByDriver(userId: string, rideId: string, dto: ReturnChangeDto) {
    const driver = await this.driverProfileByUser(userId);
    return this.locks.withLock(`ride-change:${rideId}`, async () => {
      const ride = await this.prisma.goRide.findFirst({
        where: { id: rideId, driver_id: driver.id },
        include: { customer: { select: { id: true, user_id: true } } },
      });
      if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
      if (ride.status !== GoRideStatus.COMPLETED) {
        throw new GoException(GoErrorCode.INVALID_RIDE_TRANSITION, 'Change return is only allowed after the ride is completed');
      }

      const existing = await this.customerWallets.findChangeReturn(rideId, RIDE_CHANGE_RETURN_REASON);
      if (existing) {
        throw new GoException(GoErrorCode.CONFLICT, 'Change already returned for this ride', {
          change_returned_amount: decimalToNumber(existing.amount),
        });
      }

      const cashDue = cashDueAmount(ride.customer_payable, ride.wallet_paid_amount);
      const change = changeReturnAmount(dto.cash_received, cashDue);
      if (change.lte(0)) {
        throw new GoException(
          GoErrorCode.VALIDATION_ERROR,
          'cash_received must be greater than cash_due to return change',
          {
            cash_received: dto.cash_received,
            cash_due: decimalToNumber(cashDue),
            customer_payable: decimalToNumber(ride.customer_payable ?? 0),
            wallet_paid_amount: decimalToNumber(ride.wallet_paid_amount),
          },
        );
      }

      // Debit driver first so we never credit the customer without funding.
      await this.wallets.debitChangeReturn({
        driverId: driver.id,
        rideId,
        amount: change,
        reason: RIDE_CHANGE_RETURN_REASON,
        driverUserId: userId,
      });
      const credited = await this.customerWallets.creditChangeReturn({
        customerId: ride.customer_id,
        rideId,
        amount: change,
        reason: RIDE_CHANGE_RETURN_REASON,
      });

      const cashReceived = new Prisma.Decimal(dto.cash_received);
      if (cashReceived.gte(cashDue) && ride.payment_status === GoPaymentStatus.CASH_EXPECTED) {
        await this.prisma.goRide.update({
          where: { id: rideId },
          data: { payment_status: GoPaymentStatus.COLLECTED },
        });
      }

      const payload = {
        ride_id: rideId,
        cash_received: decimalToNumber(cashReceived),
        cash_due: decimalToNumber(cashDue),
        change_returned_amount: decimalToNumber(change),
        already: credited.already,
        payment_status:
          cashReceived.gte(cashDue) && ride.payment_status === GoPaymentStatus.CASH_EXPECTED
            ? GoPaymentStatus.COLLECTED
            : ride.payment_status,
      };

      this.realtime.emitToCustomer(ride.customer.user_id, 'wallet.change_returned', {
        ride_id: rideId,
        amount: decimalToNumber(change),
        currency: 'SYP',
      });

      return payload;
    });
  }

  /**
   * Driver «تعطّل السيارة»: open case + notify CS. Does NOT cancel the ride or zero the fare.
   * - Before pickup (EN_ROUTE / ARRIVED): unassign → SEARCHING again for another driver (no segment fare).
   * - During trip (IN_PROGRESS): INTERRUPTED; staff creates replacement + assigns (segment fare at replacement).
   */
  async reportBreakdown(userId: string, rideId: string, dto: DriverBreakdownDto) {
    const driver = await this.driverProfileByUser(userId);
    return this.locks.withLock(`ride-breakdown:${rideId}`, async () => {
      const ride = await this.prisma.goRide.findFirst({
        where: { id: rideId, driver_id: driver.id },
        include: { customer: true, driver: { include: { state: true, user: true } } },
      });
      if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);

      const allowed =
        ride.status === GoRideStatus.DRIVER_EN_ROUTE ||
        ride.status === GoRideStatus.ARRIVED ||
        ride.status === GoRideStatus.IN_PROGRESS;
      if (!allowed) {
        throw new GoException(GoErrorCode.RIDE_NOT_ACTIVE, 'Breakdown report not allowed in this status', {
          status: ride.status,
        });
      }

      const lat =
        dto.lat ??
        (ride.driver?.state?.last_lat != null ? Number(ride.driver.state.last_lat) : Number(ride.pickup_lat));
      const lng =
        dto.lng ??
        (ride.driver?.state?.last_lng != null ? Number(ride.driver.state.last_lng) : Number(ride.pickup_lng));
      const caseType = dto.subtype === 'ACCIDENT' ? ('ACCIDENT' as const) : ('BREAKDOWN' as const);
      const beforePickup =
        ride.status === GoRideStatus.DRIVER_EN_ROUTE || ride.status === GoRideStatus.ARRIVED;

      const rideCase = await this.cases.ensureForReplacement(ride.id, caseType, {
        reason_code: dto.subtype,
        lat,
        lng,
        source: 'driver_breakdown',
      });

      if (beforePickup) {
        assertTransition(ride.status, GoRideStatus.SEARCHING);
        await this.prisma.$transaction(async (tx) => {
          await tx.goRide.update({
            where: { id: ride.id },
            data: {
              status: GoRideStatus.SEARCHING,
              driver_id: null,
              vehicle_id: null,
              vehicle_snapshot: Prisma.DbNull,
              assigned_at: null,
              // New search clock for min_search_seconds window.
              search_started_at: new Date(),
            },
          });
          await tx.goDriverState.updateMany({
            where: { driver_id: driver.id },
            data: {
              current_ride_id: null,
              next_ride_id: null,
              availability: GoDriverAvailability.OFFLINE,
            },
          });
        });
        await this.dispatch.expireOffersForRide(ride.id);
        await this.sessions.close(driver.id, GoOnlineSessionEnd.FORCED_OFFLINE);
        await this.dispatch.enqueueSearch(ride.id);
      } else {
        assertTransition(GoRideStatus.IN_PROGRESS, GoRideStatus.INTERRUPTED);
        await this.prisma.$transaction(async (tx) => {
          await tx.goRide.update({
            where: { id: ride.id },
            data: {
              status: GoRideStatus.INTERRUPTED,
              actual_dropoff_lat: lat,
              actual_dropoff_lng: lng,
            },
          });
          await tx.goDriverState.updateMany({
            where: { driver_id: driver.id },
            data: {
              current_ride_id: null,
              next_ride_id: null,
              availability: GoDriverAvailability.OFFLINE,
            },
          });
        });
        await this.sessions.close(driver.id, GoOnlineSessionEnd.FORCED_OFFLINE);
      }

      await this.audit.log({
        actor: { id: userId, role: GoRole.DRIVER },
        action: AuditAction.RIDE_BREAKDOWN_REPORTED,
        entity_type: 'ride',
        entity_id: ride.id,
        branch_id: ride.branch_id,
        metadata: {
          subtype: dto.subtype,
          note: dto.note ?? null,
          lat,
          lng,
          status_before: ride.status,
          phase: beforePickup ? 'before_pickup' : 'in_progress',
          cash_fare_unchanged: true,
        },
      });

      const payload = {
        ride_id: ride.id,
        public_number: ride.public_number,
        subtype: dto.subtype,
        case_type: caseType,
        case_id: rideCase.id,
        note: dto.note ?? null,
        lat,
        lng,
        phase: beforePickup ? 'before_pickup' : 'in_progress',
        status: beforePickup ? GoRideStatus.SEARCHING : GoRideStatus.INTERRUPTED,
        action_required: beforePickup ? 'REDISPATCH' : 'ASSIGN_REPLACEMENT_DRIVER',
        /** Fare is NOT zeroed here; segment commission is set when staff creates a replacement. */
        fare_unchanged: true,
      };
      const locationLabel = await reverseAreaLabel(lat, lng);
      await this.alerts.raise({
        ride_id: ride.id,
        branch_id: ride.branch_id,
        type: GoOperationalAlertType.REPLACEMENT_NEEDED,
        severity: GoAlertSeverity.CRITICAL,
        metadata: {
          action_required: payload.action_required,
          phase: payload.phase,
          case_type: caseType,
          subtype: dto.subtype,
          note: dto.note ?? null,
          case_id: rideCase.id,
          public_number: ride.public_number,
          lat,
          lng,
          location_label: locationLabel,
        },
      });
      this.realtime.emitToStaff(ride.branch_id, 'ride.breakdown_reported', payload);
      this.realtime.emitToCustomer(ride.customer.user_id, 'ride.breakdown_reported', {
        ride_id: ride.id,
        phase: payload.phase,
        status: payload.status,
      });
      this.realtime.emitToDriver(userId, 'ride.interrupted', {
        ride_id: ride.id,
        reason: caseType,
        subtype: dto.subtype,
        phase: payload.phase,
      });

      return payload;
    });
  }

  /**
   * Ticket §17 — interrupt original IN_PROGRESS (or already INTERRUPTED) ride and create replacement into dispatch.
   * First driver receives segment entitlement (start → breakdown); second ride is priced breakdown → destination.
   */
  async createReplacement(
    actor: AuthUser,
    rideId: string,
    body: { reason: 'ACCIDENT' | 'BREAKDOWN'; lat?: number; lng?: number; driver_id?: string },
  ) {
    return this.locks.withLock(`ride-replacement:${rideId}`, async () => {
      const original = await this.prisma.goRide.findUnique({
        where: { id: rideId },
        omit: { tracking_token: false },
        include: {
          customer: true,
          stops: { orderBy: { sequence: 'asc' } },
          requirements: true,
          ride_category: { include: { pricing: true } },
          replacement_rides: true,
          driver: { include: { state: true, user: true } },
        },
      });
      if (!original) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
      this.branchScope.assertAccess(actor, original.branch_id);

      if (original.status === GoRideStatus.REPLACED || original.replacement_rides.length > 0) {
        throw new GoException(GoErrorCode.REPLACEMENT_ALREADY_CREATED, 'Replacement already exists');
      }
      if (original.status !== GoRideStatus.IN_PROGRESS && original.status !== GoRideStatus.INTERRUPTED) {
        throw new GoException(GoErrorCode.RIDE_NOT_ACTIVE, 'Replacement requires IN_PROGRESS ride');
      }

      // Prefer staff override → dropoff saved at breakdown → open case GPS → last driver GPS → pickup.
      const openCase = await this.prisma.goRideCase.findFirst({
        where: {
          ride_id: original.id,
          type: { in: ['ACCIDENT', 'BREAKDOWN'] as const },
          status: { in: ['OPEN', 'IN_REVIEW'] as const },
        },
        orderBy: { created_at: 'desc' },
        select: { latitude: true, longitude: true },
      });
      const interruptLat =
        body.lat ??
        (original.actual_dropoff_lat != null ? Number(original.actual_dropoff_lat) : null) ??
        (openCase?.latitude != null ? Number(openCase.latitude) : null) ??
        (original.driver?.state?.last_lat != null ? Number(original.driver.state.last_lat) : null) ??
        Number(original.pickup_lat);
      const interruptLng =
        body.lng ??
        (original.actual_dropoff_lng != null ? Number(original.actual_dropoff_lng) : null) ??
        (openCase?.longitude != null ? Number(openCase.longitude) : null) ??
        (original.driver?.state?.last_lng != null ? Number(original.driver.state.last_lng) : null) ??
        Number(original.pickup_lng);

      const pricing = ridePricing(original.pricing_snapshot, original.ride_category.pricing);

      const segmentPoints = [
        {
          lat: Number(original.actual_start_lat ?? original.pickup_lat),
          lng: Number(original.actual_start_lng ?? original.pickup_lng),
        },
        { lat: interruptLat, lng: interruptLng },
      ];
      // Ticket §18.1 — prefer GPS track actuals for interrupted original segment.
      const estimated = await this.route.estimate(segmentPoints);
      const tracked = await this.distanceFromRideTrack(original.id);
      const distance_m =
        tracked?.distance_m && tracked.distance_m > 0 ? tracked.distance_m : estimated.distance_m;
      const startedAt = original.started_at ?? new Date();
      const duration_sec = Math.max(
        1,
        tracked?.duration_sec && tracked.duration_sec > 0
          ? tracked.duration_sec
          : Math.round((Date.now() - startedAt.getTime()) / 1000),
      );
      const segmentFare = fareFromPricingSnapshot(
        original.pricing_snapshot,
        pricing,
        distance_m,
        duration_sec,
        original.vehicles_count,
      );

      const destPoints = [
        { lat: interruptLat, lng: interruptLng },
        ...original.stops.map((s) => ({ lat: Number(s.latitude), lng: Number(s.longitude) })),
        {
          lat: Number(original.original_destination_lat),
          lng: Number(original.original_destination_lng),
        },
      ];
      const remaining = await this.route.estimate(destPoints);
      const remainingFare = fareFromPricingSnapshot(
        original.pricing_snapshot,
        pricing,
        remaining.distance_m,
        remaining.duration_sec,
        original.vehicles_count,
      );

      await this.cases.ensureForReplacement(original.id, body.reason, {
        lat: interruptLat,
        lng: interruptLng,
        source: 'staff_replacement',
      });

      if (original.status === GoRideStatus.IN_PROGRESS) {
        assertTransition(GoRideStatus.IN_PROGRESS, GoRideStatus.INTERRUPTED);
      }
      assertTransition(GoRideStatus.INTERRUPTED, GoRideStatus.REPLACED);

      const public_number = await this.nextPublicNumber();

      const result = await this.prisma.$transaction(async (tx) => {
        await tx.goRide.update({
          where: { id: original.id },
          data: {
            status: GoRideStatus.INTERRUPTED,
            actual_dropoff_lat: interruptLat,
            actual_dropoff_lng: interruptLng,
            actual_distance_m: distance_m,
            actual_duration_sec: duration_sec,
            gross_final_fare: segmentFare.final_fare,
            customer_payable: new Prisma.Decimal(0),
            // Moves to the replacement so the link the passenger already has keeps working.
            tracking_token: null,
          },
        });

        if (original.driver_id) {
          await tx.goDriverState.updateMany({
            where: { driver_id: original.driver_id },
            data: {
              current_ride_id: null,
              next_ride_id: null,
              availability: GoDriverAvailability.OFFLINE,
            },
          });
        }

        const replacement = await tx.goRide.create({
          data: {
            public_number,
            customer_id: original.customer_id,
            branch_id: original.branch_id,
            ride_category_id: original.ride_category_id,
            service_code: original.service_code,
            passengers_count: original.passengers_count,
            vehicles_count: original.vehicles_count,
            random_vehicles: original.random_vehicles,
            fleet_vehicles: original.fleet_vehicles ?? Prisma.DbNull,
            type: GoRideType.IMMEDIATE,
            status: GoRideStatus.SEARCHING,
            payment_method: original.payment_method,
            booking_for: original.booking_for,
            other_passenger_name: original.other_passenger_name,
            other_passenger_phone: original.other_passenger_phone,
            pickup_sign_name: original.pickup_sign_name,
            share_tracking_link: original.share_tracking_link,
            tracking_token: original.tracking_token,
            customer_note: original.customer_note,
            preferred_driver_language: original.preferred_driver_language,
            pickup_lat: interruptLat,
            pickup_lng: interruptLng,
            pickup_address: original.pickup_address,
            original_destination_lat: original.original_destination_lat,
            original_destination_lng: original.original_destination_lng,
            original_destination_address: original.original_destination_address,
            estimated_distance_m: remaining.distance_m,
            estimated_duration_sec: remaining.duration_sec,
            estimated_fare: remainingFare.final_fare,
            estimated_route_polyline: remaining.encoded_polyline,
            estimated_route_source: remaining.source,
            estimated_route_summary: remaining.summary || null,
            pricing_snapshot: original.pricing_snapshot ?? Prisma.DbNull,
            incentive_percentage: original.incentive_percentage,
            incentive_reason: original.incentive_reason,
            incentive_rejection_pct: original.incentive_rejection_pct,
            incentive_distance_pct: original.incentive_distance_pct,
            replacement_of_ride_id: original.id,
            stops: {
              create: original.stops.map((s, i) => ({
                sequence: i + 1,
                latitude: s.latitude,
                longitude: s.longitude,
                address: s.address,
              })),
            },
            requirements: {
              create: original.requirements.map((r) => ({ type: r.type })),
            },
          },
          include: rideInclude,
        });

        await tx.goRide.update({
          where: { id: original.id },
          data: { status: GoRideStatus.REPLACED },
        });

        // Ticket §25.3 — keep reserved discount on the live replacement ride.
        await this.discounts.transferReservation(original.id, replacement.id, tx);
        await this.customerWallets.transferRideHold(original.id, replacement.id, tx);

        return replacement;
      });

      if (original.driver_id) {
        await this.entitlements.upsertCalculated({
          ride_id: original.id,
          driver_id: original.driver_id,
          calculated_amount: segmentFare.final_fare,
        });
        await this.sessions.close(original.driver_id, GoOnlineSessionEnd.FORCED_OFFLINE).catch(() => undefined);
      }

      await this.cases.linkReplacement(original.id, result.id);
      await this.alerts.autoResolve(original.id, GoOperationalAlertType.REPLACEMENT_NEEDED);

      let assigned = result;
      if (body.driver_id) {
        assigned = await this.assignDriver(actor, result.id, { driver_id: body.driver_id });
      } else {
        await this.dispatch.enqueueSearch(result.id);
      }

      const payload = {
        original_ride_id: original.id,
        replacement_ride_id: result.id,
        reason: body.reason,
        original_segment_fare: decimalToNumber(segmentFare.final_fare),
        assigned_driver_id: body.driver_id ?? null,
      };
      this.realtime.emitToCustomer(original.customer.user_id, 'ride.replacement_created', payload);
      this.realtime.emitToStaff(original.branch_id, 'replacement_ride.created', payload);
      if (original.driver?.user_id) {
        this.realtime.emitToDriver(original.driver.user_id, 'ride.interrupted', {
          ride_id: original.id,
          reason: body.reason,
        });
      }

      await this.audit.log({
        actor,
        action: 'ride.replacement_created',
        entity_type: 'GoRide',
        entity_id: result.id,
        branch_id: original.branch_id,
        metadata: {
          original_ride_id: original.id,
          reason: body.reason,
          original_segment_fare: decimalToNumber(segmentFare.final_fare),
          assigned_driver_id: body.driver_id ?? null,
        },
      });

      return {
        original_ride_id: original.id,
        original_status: GoRideStatus.REPLACED,
        original_segment_fare: decimalToNumber(segmentFare.final_fare),
        replacement: assigned,
      };
    });
  }

  async getForDriver(userId: string, rideId: string) {
    const driver = await this.driverProfileByUser(userId);
    const ride = await this.prisma.goRide.findFirst({
      where: { id: rideId, driver_id: driver.id },
      include: rideInclude,
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    if (ride.status === GoRideStatus.COMPLETED && ride.gross_final_fare != null) {
      const billed = await this.getInvoiceForDriver(userId, rideId);
      const enriched = await this.withDriverRideExtras(ride, driver.id);
      return {
        ...enriched,
        customer: billed.customer,
        combined_gross_fare: billed.invoice.combined_gross_fare,
        original_segment_fare: billed.invoice.original_segment_fare,
        replacement_segment_fare: billed.invoice.replacement_segment_fare,
        commission_deducted: billed.invoice.commission_deducted,
        commission_amount: billed.invoice.commission_amount,
        commission_status: billed.invoice.commission_status,
        driver_earnings: billed.invoice.driver_earnings,
        invoice: billed.invoice,
        rating: billed.rating,
      };
    }
    return this.withDriverRideExtras(ride, driver.id);
  }

  async activeForDriver(userId: string) {
    const driver = await this.driverProfileByUser(userId);
    // Home active = live immediate, or scheduled only after EN_ROUTE promotion (not reserved DRIVER_ASSIGNED).
    const ride = await this.prisma.goRide.findFirst({
      where: {
        driver_id: driver.id,
        OR: [
          {
            type: GoRideType.IMMEDIATE,
            status: {
              in: [
                GoRideStatus.DRIVER_ASSIGNED,
                GoRideStatus.DRIVER_EN_ROUTE,
                GoRideStatus.ARRIVED,
                GoRideStatus.IN_PROGRESS,
              ],
            },
          },
          {
            type: GoRideType.SCHEDULED,
            status: {
              in: [GoRideStatus.DRIVER_EN_ROUTE, GoRideStatus.ARRIVED, GoRideStatus.IN_PROGRESS],
            },
          },
        ],
      },
      include: rideInclude,
      orderBy: { assigned_at: 'desc' },
    });
    if (!ride) return null;
    return this.withDriverRideExtras(ride, driver.id);
  }

  async listErp(
    actor: AuthUser,
    q: {
      page?: number;
      limit?: number;
      status?: GoRideStatus;
      type?: GoRideType;
      customer_id?: string;
      driver_id?: string;
      branch_id?: string;
      q?: string;
      from?: string;
      to?: string;
    },
  ) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    const needle = q.q?.trim();
    const rides = await this.prisma.goRide.findMany({
      where: {
        branch_id: branchId,
        status: q.status,
        type: q.type,
        customer_id: q.customer_id,
        driver_id: q.driver_id,
        ...(needle
          ? { public_number: { contains: needle, mode: 'insensitive' as const } }
          : {}),
        created_at:
          q.from || q.to
            ? {
                gte: q.from ? new Date(q.from) : undefined,
                lte: q.to ? new Date(q.to) : undefined,
              }
            : undefined,
      },
      include: erpRideInclude,
      orderBy: { created_at: 'desc' },
      ...pageSkip(q.page, q.limit),
    });
    return rides.map(withDeletedCustomerLabel);
  }

  async listOpenOffers(actor: AuthUser, requestedBranch?: string) {
    const branchId = this.branchScope.resolveFilter(actor, requestedBranch);
    return this.prisma.goRideOffer.findMany({
      where: { status: 'PENDING', ride: { branch_id: branchId } },
      include: {
        ride: { select: { id: true, public_number: true, status: true, type: true } },
        driver: { select: { id: true, user: { select: { full_name: true } } } },
      },
      orderBy: { offered_at: 'desc' },
      take: 100,
    });
  }

  async getErp(actor: AuthUser, rideId: string) {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      include: {
        ...erpRideInclude,
        driver: {
          select: {
            id: true,
            user_id: true,
            user: { select: { full_name: true } },
            state: {
              select: {
                availability: true,
                last_lat: true,
                last_lng: true,
                last_location_at: true,
              },
            },
          },
        },
        ratings: {
          include: {
            reasons: { select: { reason_code: true } },
            from_user: { select: { full_name: true, role: true } },
          },
        },
        offers: {
          orderBy: { offered_at: 'desc' },
          take: 30,
          include: { driver: { select: { id: true, user: { select: { full_name: true } } } } },
        },
        compensations: { orderBy: { created_at: 'desc' } },
        incentive_grants: { select: { id: true, kind: true, amount: true, created_at: true } },
        complaints: { select: { id: true, status: true, priority: true, created_at: true } },
        cases: {
          select: {
            id: true,
            type: true,
            status: true,
            reason_code: true,
            driver_statement: true,
            customer_statement: true,
            latitude: true,
            longitude: true,
            replacement_ride_id: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
        },
        alerts: {
          where: {
            type: GoOperationalAlertType.REPLACEMENT_NEEDED,
            status: { in: [GoOperationalAlertStatus.OPEN, GoOperationalAlertStatus.CLAIMED] },
          },
          select: { id: true, type: true, metadata: true },
          take: 1,
          orderBy: { created_at: 'desc' },
        },
        emergencies: { select: { id: true, status: true, started_at: true, recording_status: true } },
        entitlements: {
          select: { id: true, status: true, calculated_amount: true, approved_amount: true },
        },
        discount_reservation: {
          include: { discount_code: { select: { id: true, code: true, name: true, percentage: true } } },
        },
        replacement_of_ride: { select: { id: true, public_number: true, status: true } },
        replacement_rides: {
          select: { id: true, public_number: true, status: true },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    this.branchScope.assertAccess(actor, ride.branch_id);

    let livePickupDistanceM: number | null = null;
    if (ride.driver_id) {
      const nav = await resolvePickupNavigation({
        redis: this.redis,
        prisma: this.prisma,
        route: this.route,
        driverId: ride.driver_id,
        ride: {
          id: ride.id,
          status: ride.status,
          pickup_lat: ride.pickup_lat,
          pickup_lng: ride.pickup_lng,
        },
      });
      livePickupDistanceM = nav.pickup_distance_m;
    }

    const to_customer_distance_m = resolveToCustomerDistanceM({
      status: ride.status,
      storedToPickupM: ride.to_pickup_distance_m,
      livePickupDistanceM,
    });
    // Prefer live Redis track while the trip is running (covers destination changes / stops).
    let with_customer_distance_m = withCustomerDistanceM(ride);
    if (ride.status === GoRideStatus.IN_PROGRESS) {
      const tracked = await this.distanceFromRideTrack(ride.id);
      if (tracked?.distance_m && tracked.distance_m > 0) {
        with_customer_distance_m = tracked.distance_m;
      }
    }
    const planned_trip_distance_m = plannedTripDistanceM(ride);
    const destination_changed = destinationChanged(ride);
    const stops = Array.isArray(ride.stops) ? ride.stops : [];
    const driver_total_distance_m =
      to_customer_distance_m != null || with_customer_distance_m != null
        ? (to_customer_distance_m ?? 0) + (with_customer_distance_m ?? 0)
        : null;
    const pickup_wait = pickupWaitBreakdown(ride);

    return withDeletedCustomerLabel({
      ...ride,
      to_customer_distance_m,
      /** @deprecated alias — same as with_customer when available, else planned */
      to_destination_distance_m: with_customer_distance_m ?? planned_trip_distance_m,
      planned_trip_distance_m,
      with_customer_distance_m,
      driver_total_distance_m,
      destination_changed,
      stops_count: stops.length,
      pickup_wait,
    });
  }

  /** Live monitoring board (Ticket §13) — active rides + driver GPS + open alerts. */
  async listLive(actor: AuthUser, requestedBranch?: string) {
    const branchId = this.branchScope.resolveFilter(actor, requestedBranch);
    const rides = await this.prisma.goRide.findMany({
      where: {
        branch_id: branchId,
        status: {
          in: [
            GoRideStatus.SEARCHING,
            GoRideStatus.DRIVER_ASSIGNED,
            GoRideStatus.DRIVER_EN_ROUTE,
            GoRideStatus.ARRIVED,
            GoRideStatus.IN_PROGRESS,
            // Breakdown / accident waiting for replacement driver assignment.
            GoRideStatus.INTERRUPTED,
          ],
        },
      },
      include: {
        ...erpRideInclude,
        driver: {
          select: {
            id: true,
            user_id: true,
            user: { select: { full_name: true } },
            state: {
              select: {
                availability: true,
                last_lat: true,
                last_lng: true,
                last_location_at: true,
                h3_index: true,
              },
            },
          },
        },
        alerts: {
          where: {
            status: { in: [GoOperationalAlertStatus.OPEN, GoOperationalAlertStatus.CLAIMED] },
          },
          select: { id: true, type: true, status: true, started_at: true, occurrence_no: true },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return rides.map(withDeletedCustomerLabel);
  }

  /** GPS track while passenger is aboard (IN_PROGRESS only). Excludes empty leg to pickup. */
  private async distanceFromRideTrack(rideId: string): Promise<{ distance_m: number; duration_sec: number } | null> {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      select: { started_at: true },
    });
    const raw = await this.redis.get(`ride:track:${rideId}`);
    if (!raw) return null;
    try {
      const points = JSON.parse(raw) as { lat: number; lng: number; recorded_at: string }[];
      if (!Array.isArray(points) || points.length < 2) return null;
      const startMs = ride?.started_at?.getTime();
      const usable =
        startMs != null && Number.isFinite(startMs)
          ? points.filter((p) => {
              const t = new Date(p.recorded_at).getTime();
              return Number.isFinite(t) && t >= startMs;
            })
          : points;
      if (usable.length < 2) return null;
      let distance_m = 0;
      for (let i = 1; i < usable.length; i++) {
        distance_m += haversineM(
          { lat: usable[i - 1].lat, lng: usable[i - 1].lng },
          { lat: usable[i].lat, lng: usable[i].lng },
        );
      }
      const t0 = new Date(usable[0].recorded_at).getTime();
      const t1 = new Date(usable[usable.length - 1].recorded_at).getTime();
      if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
      return {
        distance_m: Math.round(distance_m),
        duration_sec: Math.max(0, Math.round((t1 - t0) / 1000)),
      };
    } catch {
      return null;
    }
  }

  /**
   * Phone access for CS of the owning branch only (Ticket §13.1). Audited.
   */
  async contactInfo(actor: AuthUser, rideId: string) {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      include: {
        customer: { include: { user: { select: { full_name: true, phone: true, deleted_at: true } } } },
        driver: { include: { user: { select: { full_name: true, phone: true } } } },
      },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND);
    this.branchScope.assertAccess(actor, ride.branch_id);

    await this.audit.log({
      actor,
      action: AuditAction.CONTACT_INFO_VIEWED,
      entity_type: 'go_ride',
      entity_id: rideId,
      branch_id: ride.branch_id,
      metadata: { viewer_role: actor.role },
    });

    const deleted = !!ride.customer.user.deleted_at;
    return {
      customer_name: erpCustomerDisplayName(ride.customer.user),
      customer_phone: deleted ? '' : (ride.customer.user.phone ?? ''),
      driver_name: ride.driver?.user.full_name ?? '',
      driver_phone: ride.driver?.user.phone ?? '',
    };
  }
}
