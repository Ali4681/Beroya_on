import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { GoDriverAvailability, GoOnlineSessionEnd, GoRideStatus } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { DriverEligibilityService } from '../drivers/eligibility.service';
import { haversineM, toH3Index } from '../dispatch/h3.util';
import { DriverSessionsService } from '../driver-sessions/driver-sessions.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { clampRecordedAt, isNotOlder } from './location-guard';
import type {
  DriverLocationBatchDto,
  DriverLocationBatchPointDto,
  DriverLocationDto,
} from '../rides/dto/rides.dto';

type TrackPoint = { lat: number; lng: number; recorded_at: string; heading?: number | null; speed?: number | null };

const TRACK_TTL_SEC = 86_400;
const BATCH_MAX_FUTURE_MS = 5 * 60 * 1000;
const BATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DriverStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: DriverEligibilityService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly sessions: DriverSessionsService,
    @Inject(forwardRef(() => MonitoringService)) private readonly monitoring: MonitoringService,
  ) {}

  private async profileId(userId: string) {
    const d = await this.prisma.goDriverProfile.findUnique({ where: { user_id: userId } });
    if (!d) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    return d.id;
  }

  /** Redis-first live coords; null if missing/unparseable (caller falls back to DB). */
  async getLiveLocation(driverId: string): Promise<{ lat: number; lng: number; h3_index?: string } | null> {
    const raw = await this.redis.get(`driver:loc:${driverId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { lat?: number; lng?: number; h3_index?: string };
      if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
      return { lat: Number(parsed.lat), lng: Number(parsed.lng), h3_index: parsed.h3_index };
    } catch {
      return null;
    }
  }

  async getState(userId: string) {
    const driverId = await this.profileId(userId);
    return this.prisma.goDriverState.upsert({
      where: { driver_id: driverId },
      create: { driver_id: driverId },
      update: {},
    });
  }

  async goOnline(user: AuthUser) {
    const check = await this.eligibility.evaluate(user.id);
    if (!check.eligible) {
      throw new GoException(GoErrorCode.DRIVER_NOT_ELIGIBLE, 'Driver is not eligible', { reasons: check.reasons });
    }
    const driverId = await this.profileId(user.id);
    const state = await this.prisma.goDriverState.upsert({
      where: { driver_id: driverId },
      create: { driver_id: driverId, availability: GoDriverAvailability.ONLINE },
      update: { availability: GoDriverAvailability.ONLINE },
    });
    await this.sessions.open(driverId);
    this.realtime.emitToDriver(user.id, 'eligibility.updated', check);
    return state;
  }

  async goOffline(user: AuthUser) {
    const driverId = await this.profileId(user.id);
    const state = await this.prisma.goDriverState.findUnique({ where: { driver_id: driverId } });
    if (state?.current_ride_id) {
      throw new GoException(GoErrorCode.CONFLICT, 'Cannot go offline during an active immediate ride');
    }
    const offline = await this.prisma.goDriverState.upsert({
      where: { driver_id: driverId },
      create: { driver_id: driverId, availability: GoDriverAvailability.OFFLINE },
      update: { availability: GoDriverAvailability.OFFLINE },
    });
    await this.sessions.close(driverId, GoOnlineSessionEnd.DRIVER_OFFLINE);
    return offline;
  }

  async updateLocation(user: AuthUser, dto: DriverLocationDto) {
    const driverId = await this.profileId(user.id);
    const sent = dto.recorded_at ? new Date(dto.recorded_at) : new Date();
    if (Number.isNaN(sent.getTime())) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Invalid recorded_at');
    }
    const { recorded, clamped } = clampRecordedAt(sent, new Date());
    const payload = {
      lat: dto.lat,
      lng: dto.lng,
      heading: dto.heading ?? null,
      speed: dto.speed ?? null,
      accuracy: dto.accuracy ?? null,
      recorded_at: recorded.toISOString(),
    };
    const h3_index = toH3Index(dto.lat, dto.lng);
    const live = { last_lat: dto.lat, last_lng: dto.lng, h3_index, last_location_at: recorded };
    const moved = await this.prisma.goDriverState.updateMany({
      where: { driver_id: driverId, OR: [{ last_location_at: null }, { last_location_at: { lte: recorded } }] },
      data: live,
    });
    let applied = moved.count > 0;
    let state = await this.prisma.goDriverState.findUnique({ where: { driver_id: driverId } });
    if (!state) {
      state = await this.prisma.goDriverState.upsert({
        where: { driver_id: driverId },
        create: { driver_id: driverId, ...live },
        update: {},
      });
      applied = true;
    }
    if (applied) await this.setLiveIfNotOlder(driverId, { ...payload, h3_index }, recorded.getTime());
    await this.sessions.touch(driverId, state.availability);

    if (state.current_ride_id) {
      const ride = await this.prisma.goRide.findUnique({
        where: { id: state.current_ride_id },
        include: { customer: true },
      });
      // Billable GPS track = passenger aboard only (no empty leg to pickup / commission base).
      if (ride?.status === GoRideStatus.IN_PROGRESS) {
        const merged = await this.mergeRideTrack(state.current_ride_id, [
          {
            lat: dto.lat,
            lng: dto.lng,
            heading: dto.heading ?? null,
            speed: dto.speed ?? null,
            recorded_at: payload.recorded_at,
          },
        ]);
        const progress = await this.recalcActualsFromTrack(state.current_ride_id, merged, ride.started_at);
        if (progress) {
          this.realtime.emitToDriver(user.id, 'ride.progress', {
            ride_id: state.current_ride_id,
            actual_distance_m: progress.distance_m,
            actual_duration_sec: progress.duration_sec,
          });
        }
      }
      if (applied && ride) {
        this.realtime.emitToCustomer(ride.customer.user_id, 'ride.driver_location', {
          ride_id: ride.id,
          ...payload,
        });
        await this.monitoring.onDriverLocation(driverId, dto.lat, dto.lng);
      }
    }
    return { ok: true, ...payload, applied, ...(clamped ? { clock_adjusted: true } : {}) };
  }

  /** Redis mirror of the live point; a concurrent newer write is never replaced by an older one. */
  private async setLiveIfNotOlder(driverId: string, value: Record<string, unknown>, recordedMs: number) {
    const key = `driver:loc:${driverId}`;
    const raw = await this.redis.get(key);
    if (raw) {
      try {
        const current = JSON.parse(raw) as { recorded_at?: string };
        if (!isNotOlder(recordedMs, current.recorded_at)) return;
      } catch {
        // unreadable value: overwrite
      }
    }
    await this.redis.set(key, JSON.stringify(value), 120);
  }

  /** Ticket §6.5 — offline sync: validate timestamps, dedupe, merge track, recalc actuals. */
  async updateLocationBatch(user: AuthUser, dto: DriverLocationBatchDto) {
    if (!dto.points?.length) return { ok: true, accepted: 0, rejected: 0, duplicates_removed: 0 };

    const now = Date.now();
    const valid: DriverLocationBatchPointDto[] = [];
    let rejected = 0;
    for (const p of dto.points) {
      const t = new Date(p.recorded_at).getTime();
      if (!Number.isFinite(t) || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
        rejected += 1;
        continue;
      }
      if (t > now + BATCH_MAX_FUTURE_MS || t < now - BATCH_MAX_AGE_MS) {
        rejected += 1;
        continue;
      }
      valid.push(p);
    }

    valid.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    const seen = new Set<string>();
    const unique: DriverLocationBatchPointDto[] = [];
    for (const p of valid) {
      const key = `${p.recorded_at}:${p.lat}:${p.lng}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
    }
    const duplicates_removed = valid.length - unique.length;
    if (!unique.length) return { ok: true, accepted: 0, rejected, duplicates_removed };

    const driverId = await this.profileId(user.id);
    const state = await this.prisma.goDriverState.findUnique({ where: { driver_id: driverId } });

    if (state?.current_ride_id) {
      const ride = await this.prisma.goRide.findUnique({
        where: { id: state.current_ride_id },
        select: { status: true, started_at: true },
      });
      if (ride?.status === GoRideStatus.IN_PROGRESS) {
        const trackPoints: TrackPoint[] = unique.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          heading: p.heading ?? null,
          speed: p.speed ?? null,
          recorded_at: new Date(p.recorded_at).toISOString(),
        }));
        const merged = await this.mergeRideTrack(state.current_ride_id, trackPoints);
        const progress = await this.recalcActualsFromTrack(state.current_ride_id, merged, ride.started_at);
        if (progress) {
          this.realtime.emitToDriver(user.id, 'ride.progress', {
            ride_id: state.current_ride_id,
            actual_distance_m: progress.distance_m,
            actual_duration_sec: progress.duration_sec,
          });
        }
      }
    }

    // Live snapshot + monitoring from the newest accepted point
    const last = unique[unique.length - 1];
    const live = await this.updateLocation(user, last);

    return { ok: true, accepted: unique.length, rejected, duplicates_removed, live_applied: live.applied };
  }

  private async mergeRideTrack(rideId: string, points: TrackPoint[]): Promise<TrackPoint[]> {
    const key = `ride:track:${rideId}`;
    let existing: TrackPoint[] = [];
    const raw = await this.redis.get(key);
    if (raw) {
      try {
        existing = JSON.parse(raw) as TrackPoint[];
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }
    }
    const seen = new Set(existing.map((p) => `${p.recorded_at}:${p.lat}:${p.lng}`));
    const merged = [...existing];
    for (const p of points) {
      const k = `${p.recorded_at}:${p.lat}:${p.lng}`;
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(p);
    }
    merged.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    await this.redis.set(key, JSON.stringify(merged), TRACK_TTL_SEC);
    return merged;
  }

  private metricsFromTrack(points: TrackPoint[], startedAt?: Date | null) {
    const startMs = startedAt?.getTime();
    const usable =
      startMs != null && Number.isFinite(startMs)
        ? points.filter((p) => {
            const t = new Date(p.recorded_at).getTime();
            return Number.isFinite(t) && t >= startMs;
          })
        : points;
    let distance_m = 0;
    let trackDuration = 0;
    if (usable.length >= 2) {
      for (let i = 1; i < usable.length; i++) {
        distance_m += haversineM(
          { lat: usable[i - 1].lat, lng: usable[i - 1].lng },
          { lat: usable[i].lat, lng: usable[i].lng },
        );
      }
      const t0 = new Date(usable[0].recorded_at).getTime();
      const t1 = new Date(usable[usable.length - 1].recorded_at).getTime();
      if (Number.isFinite(t0) && Number.isFinite(t1)) {
        trackDuration = Math.max(0, Math.round((t1 - t0) / 1000));
      }
    }
    const wallDuration =
      startMs != null && Number.isFinite(startMs)
        ? Math.max(0, Math.round((Date.now() - startMs) / 1000))
        : 0;
    return {
      distance_m: Math.round(distance_m),
      duration_sec: Math.max(trackDuration, wallDuration),
    };
  }

  private async recalcActualsFromTrack(
    rideId: string,
    points: TrackPoint[],
    startedAt?: Date | null,
  ): Promise<{ distance_m: number; duration_sec: number } | null> {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      select: { status: true, started_at: true },
    });
    if (!ride || ride.status !== GoRideStatus.IN_PROGRESS) return null;
    const metrics = this.metricsFromTrack(points, startedAt ?? ride.started_at);
    await this.prisma.goRide.update({
      where: { id: rideId },
      data: { actual_distance_m: metrics.distance_m, actual_duration_sec: metrics.duration_sec },
    });
    return metrics;
  }
}
