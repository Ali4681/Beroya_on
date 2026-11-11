import { GoRideStatus, Prisma } from '@/generated/prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import type { RouteEstimateService } from './route-estimate.service';

export type PickupNav = {
  pickup_eta_sec: number | null;
  pickup_distance_m: number | null;
  pickup_route_polyline: string | null;
};

export const EMPTY_PICKUP_NAV: PickupNav = {
  pickup_eta_sec: null,
  pickup_distance_m: null,
  pickup_route_polyline: null,
};

const PICKUP_NAV_CACHE_SEC = 15;

/**
 * ETA + polyline from the driver's live/last location to pickup.
 * Shared by driver active ride and customer ride view (same Redis cache key).
 * Only for DRIVER_ASSIGNED / DRIVER_EN_ROUTE.
 */
export async function resolvePickupNavigation(input: {
  redis: RedisService;
  prisma: PrismaService;
  route: RouteEstimateService;
  driverId: string;
  ride: {
    id: string;
    status: GoRideStatus;
    pickup_lat: Prisma.Decimal | number;
    pickup_lng: Prisma.Decimal | number;
  };
}): Promise<PickupNav> {
  if (input.ride.status !== GoRideStatus.DRIVER_ASSIGNED && input.ride.status !== GoRideStatus.DRIVER_EN_ROUTE) {
    return EMPTY_PICKUP_NAV;
  }

  const from = await driverFromPoint(input.redis, input.prisma, input.driverId);
  if (!from) return EMPTY_PICKUP_NAV;

  const cacheKey = `driver:pickup-nav:${input.ride.id}:${from.lat.toFixed(4)}:${from.lng.toFixed(4)}`;
  const hit = await input.redis.get(cacheKey);
  if (hit) {
    try {
      return JSON.parse(hit) as PickupNav;
    } catch {
      /* recompute */
    }
  }

  try {
    const est = await input.route.estimate([
      from,
      { lat: Number(input.ride.pickup_lat), lng: Number(input.ride.pickup_lng) },
    ]);
    const nav: PickupNav = {
      pickup_eta_sec: est.duration_sec,
      pickup_distance_m: est.distance_m,
      pickup_route_polyline: est.encoded_polyline || null,
    };
    await input.redis.set(cacheKey, JSON.stringify(nav), PICKUP_NAV_CACHE_SEC);
    return nav;
  } catch {
    return EMPTY_PICKUP_NAV;
  }
}

async function driverFromPoint(
  redis: RedisService,
  prisma: PrismaService,
  driverId: string,
): Promise<{ lat: number; lng: number } | null> {
  const cached = await redis.get(`driver:loc:${driverId}`);
  if (cached) {
    try {
      const p = JSON.parse(cached) as { lat?: number; lng?: number };
      if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) return { lat: Number(p.lat), lng: Number(p.lng) };
    } catch {
      /* fall through */
    }
  }
  const state = await prisma.goDriverState.findUnique({
    where: { driver_id: driverId },
    select: { last_lat: true, last_lng: true },
  });
  if (state?.last_lat != null && state.last_lng != null) {
    return { lat: Number(state.last_lat), lng: Number(state.last_lng) };
  }
  return null;
}
