import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoRatingDirection, GoRideStatus, GoRideType, GoServiceCode, Prisma } from '@/generated/prisma/client';
import type { AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { GoConfigService } from '../config/config.service';
import { customerEmergencySummary, OPEN_EMERGENCY_STATUSES } from '../emergency/emergency.view';
import { customerDriverSelect, driverCard, rideVehicle } from './ride-driver-card';
import { rideEndsAt } from './ride-ends-at';
import { parseFleetVehiclesJson, publicFleetVehicles } from './ride-fleet';
import { searchingUntilIso } from '../dispatch/min-search-window';
import { EMPTY_PICKUP_NAV, resolvePickupNavigation } from './pickup-navigation';
import { rideSharesTracking, trackingPageUrl } from './ride-tracking-link';
import { RouteEstimateService, type LatLng } from './route-estimate.service';

export const customerRideInclude = {
  stops: { orderBy: { sequence: 'asc' as const } },
  requirements: true,
  ride_category: { select: { id: true, code: true, name_ar: true, name_en: true } },
  branch: { select: { id: true, code: true, name_ar: true } },
  driver: { select: customerDriverSelect },
  customer: { select: { id: true, user_id: true, user: { select: { full_name: true, phone: true } } } },
} satisfies Prisma.GoRideInclude;

type CustomerRide = Prisma.GoRideGetPayload<{ include: typeof customerRideInclude }>;

export interface DriverLocation {
  lat: number;
  lng: number;
  heading: number | null;
  recorded_at: string;
}

const TRACKED_STATUSES = new Set<GoRideStatus>([
  GoRideStatus.DRIVER_ASSIGNED,
  GoRideStatus.DRIVER_EN_ROUTE,
  GoRideStatus.ARRIVED,
  GoRideStatus.IN_PROGRESS,
]);

const ETA_CACHE_SEC = 20;

/** Customer-only enrichment of a ride: vehicle, driver rating/photo, live location and ETA. */
@Injectable()
export class CustomerRideViewService {
  private readonly publicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: GoConfigService,
    private readonly route: RouteEstimateService,
    appConfig: ConfigService,
  ) {
    this.publicUrl = appConfig.getOrThrow<AppConfig>('app').publicUrl;
  }

  async view(ride: CustomerRide) {
    const { vehicle_snapshot, driver, ...rest } = ride;
    const [card, tracking, emergency, tracking_url, pickupNav, dispatchCfg] = await Promise.all([
      driver ? driverCard(this.prisma, ride.id, driver) : null,
      this.tracking(ride),
      this.latestEmergency(ride.id),
      this.trackingUrl(ride),
      this.pickupNav(ride),
      ride.status === GoRideStatus.SEARCHING ? this.config.getDispatch() : Promise.resolve(null),
    ]);
    const vehicles_count = ride.vehicles_count ?? 1;
    const ends_at = rideEndsAt(ride);
    const vehicles = await this.vehiclesBlock(ride, vehicles_count);
    const rental_ends_at = ride.rental_ends_at?.toISOString() ?? (ride.service_code === GoServiceCode.RENTAL ? ends_at : null);
    const searching_until = dispatchCfg
      ? searchingUntilIso(ride, dispatchCfg.min_search_seconds)
      : null;
    return {
      ...rest,
      service_type: ride.service_code ?? GoServiceCode.DAILY,
      vehicles_count,
      passengers_count: ride.passengers_count ?? null,
      random_vehicles: ride.service_code === GoServiceCode.FLEET ? !!ride.random_vehicles : undefined,
      vehicles,
      /** Expected end (ISO) for «ينتهي في …» on home / tracking. */
      ends_at,
      /** Booked RENTAL end (ISO); same as ends_at for chauffeur hire. */
      rental_ends_at,
      /** ISO when the server may transition SEARCHING → FAILED_NO_DRIVER (null if not searching). */
      searching_until,
      driver: card,
      vehicle: driver ? rideVehicle(vehicle_snapshot) : null,
      driver_location: tracking.location,
      driver_eta_sec: tracking.eta_sec,
      /** Same pickup-nav cache as GET /driver/rides/active — use instead of client Routes API. */
      pickup_eta_sec: pickupNav.pickup_eta_sec,
      pickup_distance_m: pickupNav.pickup_distance_m,
      pickup_route_polyline: pickupNav.pickup_route_polyline,
      active_emergency: customerEmergencySummary(emergency),
      tracking_url,
    };
  }

  /** DRIVER_ASSIGNED / DRIVER_EN_ROUTE only; shares Redis key with the driver app. */
  private async pickupNav(ride: CustomerRide) {
    if (!ride.driver_id) return EMPTY_PICKUP_NAV;
    if (ride.type === GoRideType.SCHEDULED && ride.status === GoRideStatus.DRIVER_ASSIGNED) {
      return EMPTY_PICKUP_NAV;
    }
    return resolvePickupNavigation({
      redis: this.redis,
      prisma: this.prisma,
      route: this.route,
      driverId: ride.driver_id,
      ride,
    });
  }

  private async vehiclesBlock(ride: CustomerRide, vehicles_count: number) {
    if (ride.service_code !== GoServiceCode.FLEET) {
      return [{ ride_category_id: ride.ride_category.id, count: vehicles_count, category: ride.ride_category, random: false }];
    }
    const lines = parseFleetVehiclesJson(ride.fleet_vehicles);
    const ids = lines?.map((l) => l.ride_category_id) ?? [];
    const rows = ids.length
      ? await this.prisma.goRideCategory.findMany({
          where: { id: { in: ids } },
          select: { id: true, code: true, name_ar: true, name_en: true },
        })
      : [];
    const map = new Map(rows.map((r) => [r.id, r]));
    map.set(ride.ride_category.id, ride.ride_category);
    return publicFleetVehicles(lines, map, ride.ride_category, vehicles_count, !!ride.random_vehicles);
  }

  /** `{ stars }` of the customer's own rating per ride. */
  async myRatingStars(customerUserId: string, rideIds: string[]) {
    const rows = rideIds.length
      ? await this.prisma.goRideRating.findMany({
          where: {
            ride_id: { in: rideIds },
            direction: GoRatingDirection.CUSTOMER_TO_DRIVER,
            from_user_id: customerUserId,
          },
          select: { ride_id: true, stars: true },
        })
      : [];
    return new Map(rows.map((r) => [r.ride_id, { stars: r.stars }]));
  }

  /** Latest complaint the customer filed per ride. */
  async myComplaints(customerId: string, rideIds: string[]) {
    const rows = rideIds.length
      ? await this.prisma.goComplaint.findMany({
          where: { ride_id: { in: rideIds }, customer_id: customerId },
          orderBy: { created_at: 'desc' },
          select: { id: true, ride_id: true, status: true, reason_code: true, created_at: true },
        })
      : [];
    const byRide = new Map<string, Omit<(typeof rows)[number], 'ride_id'>>();
    for (const { ride_id, ...complaint } of rows) {
      if (!byRide.has(ride_id)) byRide.set(ride_id, complaint);
    }
    return byRide;
  }

  private async trackingUrl(ride: CustomerRide) {
    if (!rideSharesTracking(ride)) return null;
    const row = await this.prisma.goRide.findUnique({ where: { id: ride.id }, select: { tracking_token: true } });
    return row?.tracking_token ? trackingPageUrl(this.publicUrl, row.tracking_token) : null;
  }

  /** The open session if any, otherwise the last closed one, so the app can show that it ended. */
  private async latestEmergency(rideId: string) {
    const select = { id: true, status: true, claimed_at: true, started_at: true } as const;
    const open = await this.prisma.goEmergencySession.findFirst({
      where: { ride_id: rideId, status: { in: OPEN_EMERGENCY_STATUSES } },
      orderBy: { started_at: 'desc' },
      select,
    });
    return (
      open ??
      this.prisma.goEmergencySession.findFirst({ where: { ride_id: rideId }, orderBy: { started_at: 'desc' }, select })
    );
  }

  /** Driver location + ETA for the ride owner and the public tracking page. */
  async tracking(ride: CustomerRide): Promise<{ location: DriverLocation | null; eta_sec: number | null }> {
    const none = { location: null, eta_sec: null };
    if (!ride.driver_id || !TRACKED_STATUSES.has(ride.status)) return none;
    // A reserved scheduled ride can be hours away; the driver may be serving other customers.
    if (ride.type === GoRideType.SCHEDULED && ride.status === GoRideStatus.DRIVER_ASSIGNED) return none;

    const state = await this.prisma.goDriverState.findUnique({ where: { driver_id: ride.driver_id } });
    const location = await this.freshLocation(ride.driver_id, state);
    if (!location) return none;
    const isCurrent = state?.current_ride_id === ride.id;
    return { location, eta_sec: await this.etaSec(ride, location, isCurrent) };
  }

  private async freshLocation(
    driverId: string,
    state: { last_lat: Prisma.Decimal | null; last_lng: Prisma.Decimal | null; last_location_at: Date | null } | null,
  ): Promise<DriverLocation | null> {
    const location = (await this.liveLocation(driverId)) ?? storedLocation(state);
    if (!location) return null;
    const cfg = await this.config.getDispatch();
    const age = Date.now() - new Date(location.recorded_at).getTime();
    return age <= cfg.stale_location_seconds * 1000 ? location : null;
  }

  private async liveLocation(driverId: string): Promise<DriverLocation | null> {
    const raw = await this.redis.get(`driver:loc:${driverId}`);
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as { lat?: number; lng?: number; heading?: number | null; recorded_at?: string };
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !p.recorded_at) return null;
      return {
        lat: Number(p.lat),
        lng: Number(p.lng),
        heading: Number.isFinite(p.heading) ? Number(p.heading) : null,
        recorded_at: p.recorded_at,
      };
    } catch {
      return null;
    }
  }

  /** To pickup while the driver heads there for this ride; to the end of the trip once it started. */
  private async etaSec(ride: CustomerRide, from: DriverLocation, isCurrent: boolean) {
    let points: LatLng[];
    if (ride.status === GoRideStatus.DRIVER_ASSIGNED || ride.status === GoRideStatus.DRIVER_EN_ROUTE) {
      if (!isCurrent) return null;
      points = [from, { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) }];
    } else if (ride.status === GoRideStatus.IN_PROGRESS) {
      points = [
        from,
        ...ride.stops
          .filter((s) => !s.departed_at)
          .map((s) => ({ lat: Number(s.latitude), lng: Number(s.longitude) })),
        { lat: Number(ride.original_destination_lat), lng: Number(ride.original_destination_lng) },
      ];
    } else {
      return null;
    }

    const key = `ride:eta:${ride.id}:${ride.status}`;
    const cached = await this.redis.get(key);
    if (cached != null && Number.isFinite(Number(cached))) return Number(cached);
    try {
      const eta = (await this.route.estimate(points.map(({ lat, lng }) => ({ lat, lng })))).duration_sec;
      await this.redis.set(key, String(eta), ETA_CACHE_SEC);
      return eta;
    } catch {
      return null;
    }
  }
}

function storedLocation(
  state: { last_lat: Prisma.Decimal | null; last_lng: Prisma.Decimal | null; last_location_at: Date | null } | null,
): DriverLocation | null {
  if (state?.last_lat == null || state.last_lng == null || !state.last_location_at) return null;
  return {
    lat: Number(state.last_lat),
    lng: Number(state.last_lng),
    heading: null,
    recorded_at: state.last_location_at.toISOString(),
  };
}
