import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { GoOperationalAlertType, GoRideStatus } from '@/generated/prisma/client';
import { Queue } from 'bullmq';
import { MONITORING_JOBS, QUEUES } from '../../../infra/queue/queue.constants';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AlertsService } from '../alerts/alerts.service';
import { GoConfigService } from '../config/config.service';
import { haversineM } from '../dispatch/h3.util';
import { decodePolyline, subsamplePath } from '../rides/polyline';
import { assertTransition } from '../rides/ride-state-machine';

const MOVE_RESET_M = 40;
const ACTIVE_MONITOR_STATUSES: GoRideStatus[] = [
  GoRideStatus.DRIVER_EN_ROUTE,
  GoRideStatus.ARRIVED,
  GoRideStatus.IN_PROGRESS,
];

type StopTrack = { lat: number; lng: number; since: string; alerted: boolean };

@Injectable()
export class MonitoringService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: GoConfigService,
    private readonly alerts: AlertsService,
    private readonly realtime: RealtimeService,
    @InjectQueue(QUEUES.MONITORING) private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap() {
    const schedule = this.queue.upsertJobScheduler(
      'monitoring-tick',
      { every: 15_000 },
      { name: MONITORING_JOBS.TICK },
    );
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([schedule, timeout]).catch((err: Error) =>
      this.logger.warn(`Could not register monitoring scheduler (${err.message})`),
    );
  }

  /** Called on every driver location ping for the current ride. */
  async onDriverLocation(driverId: string, lat: number, lng: number) {
    const state = await this.prisma.goDriverState.findUnique({ where: { driver_id: driverId } });
    if (!state?.current_ride_id) return;
    const ride = await this.prisma.goRide.findUnique({
      where: { id: state.current_ride_id },
      include: {
        customer: true,
        driver: { select: { user_id: true } },
        stops: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!ride || !ACTIVE_MONITOR_STATUSES.includes(ride.status)) return;

    const cfg = await this.config.getDispatch();

    // Stale GPS auto-resolve when a fresh ping arrives
    await this.alerts.autoResolve(ride.id, GoOperationalAlertType.LOCATION_STALE);

    await this.maybeAutoArrive(ride, lat, lng, cfg.pickup_arrival_radius_m);
    await this.trackLongStop(ride.id, ride.branch_id, lat, lng, cfg.long_stop_seconds);
    // Ticket §29 — Route Deviation Watcher only while IN_PROGRESS
    if (ride.status === GoRideStatus.IN_PROGRESS) {
      await this.trackRouteDeviation(ride, lat, lng, cfg.route_deviation_max_m);
    }
  }

  async processTick() {
    const cfg = await this.config.getDispatch();
    const rides = await this.prisma.goRide.findMany({
      where: { status: { in: ACTIVE_MONITOR_STATUSES }, driver_id: { not: null } },
      include: { driver: { include: { state: true } } },
      take: 200,
    });
    const staleBefore = Date.now() - cfg.stale_location_seconds * 1000;

    for (const ride of rides) {
      const lastAt = ride.driver?.state?.last_location_at?.getTime() ?? 0;
      if (!lastAt || lastAt < staleBefore) {
        await this.alerts.raise({
          ride_id: ride.id,
          branch_id: ride.branch_id,
          type: GoOperationalAlertType.LOCATION_STALE,
          metadata: {
            stale_location_seconds: cfg.stale_location_seconds,
            last_location_at: ride.driver?.state?.last_location_at ?? null,
          },
        });
      }

      // Long-stop check also from tick (covers no further pings while stopped)
      const lat = ride.driver?.state?.last_lat;
      const lng = ride.driver?.state?.last_lng;
      if (lat != null && lng != null) {
        await this.trackLongStop(ride.id, ride.branch_id, Number(lat), Number(lng), cfg.long_stop_seconds);
      }
    }
  }

  /**
   * GPS within pickup_arrival_radius_m → ARRIVED.
   * ARRIVE-001: also notify the driver (customer was already notified).
   * Product: auto-arrive remains enabled; set pickup_arrival_radius_m very small/0 to effectively disable.
   */
  private async maybeAutoArrive(
    ride: {
      id: string;
      status: GoRideStatus;
      pickup_lat: { toString(): string } | number;
      pickup_lng: { toString(): string } | number;
      customer: { user_id: string };
      driver: { user_id: string } | null;
    },
    lat: number,
    lng: number,
    radiusM: number,
  ) {
    if (ride.status !== GoRideStatus.DRIVER_EN_ROUTE) return;
    if (!(radiusM > 0)) return;
    const dist = haversineM(
      { lat, lng },
      { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) },
    );
    if (dist > radiusM) return;
    assertTransition(GoRideStatus.DRIVER_EN_ROUTE, GoRideStatus.ARRIVED);
    await this.prisma.goRide.update({
      where: { id: ride.id },
      data: { status: GoRideStatus.ARRIVED, arrived_at: new Date() },
    });
    const payload = {
      ride_id: ride.id,
      auto: true,
      distance_m: Math.round(dist),
    };
    this.realtime.emitToCustomer(ride.customer.user_id, 'ride.driver_arrived', payload);
    if (ride.driver?.user_id) {
      this.realtime.emitToDriver(ride.driver.user_id, 'ride.driver_arrived', payload);
    }
  }

  private async trackLongStop(
    rideId: string,
    branchId: string,
    lat: number,
    lng: number,
    longStopSec: number,
  ) {
    const key = `ride:stop:${rideId}`;
    const raw = await this.redis.get(key);
    let track: StopTrack | null = raw ? (JSON.parse(raw) as StopTrack) : null;

    if (!track) {
      track = { lat, lng, since: new Date().toISOString(), alerted: false };
      await this.redis.set(key, JSON.stringify(track), longStopSec * 4);
      return;
    }

    const moved = haversineM({ lat, lng }, { lat: track.lat, lng: track.lng });
    if (moved > MOVE_RESET_M) {
      // New stop period — do not auto-resolve prior LONG_STOP (Ticket §12.2)
      track = { lat, lng, since: new Date().toISOString(), alerted: false };
      await this.redis.set(key, JSON.stringify(track), longStopSec * 4);
      return;
    }

    const elapsed = (Date.now() - new Date(track.since).getTime()) / 1000;
    if (elapsed >= longStopSec && !track.alerted) {
      const prevCount = await this.prisma.goOperationalAlert.count({
        where: { ride_id: rideId, type: GoOperationalAlertType.LONG_STOP },
      });
      await this.alerts.raise({
        ride_id: rideId,
        branch_id: branchId,
        type: GoOperationalAlertType.LONG_STOP,
        allowMultiple: true,
        occurrence_no: prevCount + 1,
        metadata: {
          stopped_sec: Math.round(elapsed),
          lat,
          lng,
          long_stop_seconds: longStopSec,
        },
      });
      track.alerted = true;
      await this.redis.set(key, JSON.stringify(track), longStopSec * 4);
    }
  }

  private async trackRouteDeviation(
    ride: {
      id: string;
      branch_id: string;
      pickup_lat: { toString(): string } | number;
      pickup_lng: { toString(): string } | number;
      original_destination_lat: { toString(): string } | number;
      original_destination_lng: { toString(): string } | number;
      estimated_route_polyline?: string | null;
      stops: { latitude: { toString(): string } | number; longitude: { toString(): string } | number }[];
    },
    lat: number,
    lng: number,
    maxDeviationM: number,
  ) {
    const decoded = ride.estimated_route_polyline ? decodePolyline(ride.estimated_route_polyline) : [];
    const path =
      decoded.length >= 2
        ? subsamplePath(decoded)
        : [
            { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) },
            ...ride.stops.map((s) => ({ lat: Number(s.latitude), lng: Number(s.longitude) })),
            { lat: Number(ride.original_destination_lat), lng: Number(ride.original_destination_lng) },
          ];
    const dist = distanceToPolylineM({ lat, lng }, path);
    if (dist > maxDeviationM) {
      await this.alerts.raise({
        ride_id: ride.id,
        branch_id: ride.branch_id,
        type: GoOperationalAlertType.MAJOR_ROUTE_DEVIATION,
        metadata: { distance_m: Math.round(dist), max_m: maxDeviationM },
      });
    } else {
      await this.alerts.autoResolve(ride.id, GoOperationalAlertType.MAJOR_ROUTE_DEVIATION);
    }
  }
}

/** Minimum distance from point to any segment of the polyline (meters). */
export function distanceToPolylineM(
  point: { lat: number; lng: number },
  path: { lat: number; lng: number }[],
): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return haversineM(point, path[0]);
  let min = Infinity;
  for (let i = 1; i < path.length; i++) {
    min = Math.min(min, distanceToSegmentM(point, path[i - 1], path[i]));
  }
  return min;
}

function distanceToSegmentM(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  // Equirectangular projection around segment midpoint for local geometry
  const midLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const toXY = (c: { lat: number; lng: number }) => ({
    x: c.lng * Math.cos(midLat) * 111_320,
    y: c.lat * 110_540,
  });
  const P = toXY(p);
  const A = toXY(a);
  const B = toXY(b);
  const abx = B.x - A.x;
  const aby = B.y - A.y;
  const apx = P.x - A.x;
  const apy = P.y - A.y;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: A.x + t * abx, y: A.y + t * aby };
  return Math.hypot(P.x - proj.x, P.y - proj.y);
}
