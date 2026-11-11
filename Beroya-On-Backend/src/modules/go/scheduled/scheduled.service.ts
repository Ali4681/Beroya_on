import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  GoDriverAvailability,
  GoOperationalAlertType,
  GoRideStatus,
  GoRideType,
} from '@/generated/prisma/client';
import { Queue } from 'bullmq';
import { QUEUES, SCHEDULED_JOBS, type ScheduledRideJob } from '../../../infra/queue/queue.constants';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { AlertsService } from '../alerts/alerts.service';
import { GoConfigService } from '../config/config.service';
import { RouteEstimateService } from '../rides/route-estimate.service';
import { assertTransition } from '../rides/ride-state-machine';

const ETA_MONITOR_INTERVAL_MS = 30_000;

@Injectable()
export class ScheduledService {
  private readonly logger = new Logger(ScheduledService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GoConfigService,
    private readonly route: RouteEstimateService,
    private readonly alerts: AlertsService,
    private readonly realtime: RealtimeService,
    private readonly redis: RedisService,
    @InjectQueue(QUEUES.SCHEDULED) private readonly queue: Queue,
  ) {}

  /** Schedule T-60 / T-30 / ETA monitor after a scheduled ride is reserved. */
  async scheduleLifecycle(rideId: string) {
    const ride = await this.prisma.goRide.findUnique({ where: { id: rideId } });
    if (!ride || ride.type !== GoRideType.SCHEDULED || !ride.scheduled_at) return;
    if (
      ride.status !== GoRideStatus.DRIVER_ASSIGNED &&
      ride.status !== GoRideStatus.DRIVER_EN_ROUTE
    ) {
      return;
    }

    const cfg = await this.config.getDispatch();
    const pickupMs = ride.scheduled_at.getTime();
    const now = Date.now();

    const reminderDelay = Math.max(0, pickupMs - cfg.scheduled_reminder_seconds * 1000 - now);
    const onlineDelay = Math.max(0, pickupMs - cfg.scheduled_online_required_seconds * 1000 - now);

    await this.queue.add(SCHEDULED_JOBS.REMINDER, { rideId } satisfies ScheduledRideJob, {
      jobId: `sched-reminder-${rideId}`,
      delay: reminderDelay,
      removeOnComplete: true,
      removeOnFail: 50,
    });
    await this.queue.add(SCHEDULED_JOBS.ONLINE_CHECK, { rideId } satisfies ScheduledRideJob, {
      jobId: `sched-online-${rideId}`,
      delay: onlineDelay,
      removeOnComplete: true,
      removeOnFail: 50,
    });
    // ETA monitor starts at T-30 (same delay as online check)
    await this.queue.add(SCHEDULED_JOBS.ETA_MONITOR, { rideId } satisfies ScheduledRideJob, {
      jobId: `sched-eta-${rideId}-${Date.now()}`,
      delay: onlineDelay,
      removeOnComplete: true,
      removeOnFail: 50,
    });

    this.logger.log(
      `Scheduled lifecycle for ${rideId}: reminder in ${reminderDelay}ms, online/eta in ${onlineDelay}ms`,
    );
  }

  async processReminder(rideId: string) {
    const ride = await this.loadActiveScheduled(rideId);
    if (!ride?.driver) return;

    this.realtime.emitToDriver(ride.driver.user_id, 'scheduled_ride.reminder', {
      ride_id: ride.id,
      scheduled_at: ride.scheduled_at,
      pickup: { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng), address: ride.pickup_address },
      public_number: ride.public_number,
    });
    this.realtime.emitToDriver(ride.driver.user_id, 'scheduled_ride.attention_required', {
      ride_id: ride.id,
      reason: 'T60_REMINDER',
    });
  }

  async processOnlineCheck(rideId: string) {
    const ride = await this.loadActiveScheduled(rideId);
    if (!ride?.driver) return;

    const state = await this.prisma.goDriverState.findUnique({ where: { driver_id: ride.driver_id! } });
    // Ticket §8.3 "Online": app-active (ONLINE or BUSY on current ride). OFFLINE → staff alert.
    const online =
      state?.availability === GoDriverAvailability.ONLINE ||
      state?.availability === GoDriverAvailability.BUSY;

    if (!online) {
      await this.alerts.raise({
        ride_id: ride.id,
        branch_id: ride.branch_id,
        type: GoOperationalAlertType.SCHEDULED_DRIVER_OFFLINE,
        metadata: { scheduled_at: ride.scheduled_at, availability: state?.availability ?? 'NONE' },
      });
      this.realtime.emitToDriver(ride.driver.user_id, 'scheduled_ride.attention_required', {
        ride_id: ride.id,
        reason: 'MUST_BE_ONLINE',
      });
      return;
    }

    // Promote reserved → en route at T-30 when online
    if (ride.status === GoRideStatus.DRIVER_ASSIGNED) {
      assertTransition(GoRideStatus.DRIVER_ASSIGNED, GoRideStatus.DRIVER_EN_ROUTE);
      await this.prisma.$transaction(async (tx) => {
        await tx.goRide.update({
          where: { id: ride.id },
          data: { status: GoRideStatus.DRIVER_EN_ROUTE },
        });
        const st = await tx.goDriverState.findUnique({ where: { driver_id: ride.driver_id! } });
        if (st && !st.current_ride_id) {
          await tx.goDriverState.update({
            where: { driver_id: ride.driver_id! },
            data: {
              current_ride_id: ride.id,
              next_ride_id: st.next_ride_id === ride.id ? null : st.next_ride_id,
              availability: GoDriverAvailability.BUSY,
            },
          });
        } else if (st && st.next_ride_id !== ride.id && st.current_ride_id !== ride.id) {
          await tx.goDriverState.update({
            where: { driver_id: ride.driver_id! },
            data: { next_ride_id: ride.id, availability: GoDriverAvailability.BUSY },
          });
        }
      });
      this.realtime.emitToCustomer(ride.customer.user_id, 'ride.driver_en_route', { ride_id: ride.id });
      this.realtime.emitToDriver(ride.driver.user_id, 'ride.en_route', { ride_id: ride.id });
    }
  }

  async processEtaMonitor(rideId: string) {
    const ride = await this.loadActiveScheduled(rideId);
    if (!ride?.driver || !ride.scheduled_at) return;

    // Stop monitoring once passenger trip started / terminal
    if (
      ride.status === GoRideStatus.IN_PROGRESS ||
      ride.status === GoRideStatus.COMPLETED ||
      ride.status === GoRideStatus.CANCELLED_BY_CUSTOMER ||
      ride.status === GoRideStatus.NO_SHOW ||
      ride.status === GoRideStatus.ARRIVED
    ) {
      return;
    }

    const cfg = await this.config.getDispatch();
    const state = await this.prisma.goDriverState.findUnique({ where: { driver_id: ride.driver_id! } });
    const live = await this.readLiveLocation(ride.driver_id!);
    const lat = live?.lat ?? (state?.last_lat != null ? Number(state.last_lat) : null);
    const lng = live?.lng ?? (state?.last_lng != null ? Number(state.last_lng) : null);
    if (lat == null || lng == null) {
      await this.requeueEta(rideId, ride.scheduled_at);
      return;
    }

    const etaSec = (await this.route.estimate([
      { lat, lng },
      { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) },
    ])).duration_sec;

    const arriveAt = Date.now() + etaSec * 1000;
    const deadline = ride.scheduled_at.getTime() + cfg.scheduled_late_tolerance_seconds * 1000;
    const delaySec = Math.round((arriveAt - ride.scheduled_at.getTime()) / 1000);

    if (arriveAt > deadline) {
      await this.alerts.raise({
        ride_id: ride.id,
        branch_id: ride.branch_id,
        type: GoOperationalAlertType.SCHEDULED_DRIVER_DELAY,
        metadata: {
          predicted_delay_sec: delaySec,
          eta_sec: etaSec,
          tolerance_sec: cfg.scheduled_late_tolerance_seconds,
          note: 'No auto-replacement — CS decides (Ticket §8.4)',
        },
      });
      this.realtime.emitToDriver(ride.driver.user_id, 'scheduled_ride.attention_required', {
        ride_id: ride.id,
        reason: 'PREDICTED_DELAY',
        predicted_delay_sec: delaySec,
      });
    }

    await this.requeueEta(rideId, ride.scheduled_at);
  }

  /** Same Redis-first path as dispatch (Ticket §6 / §8.4). */
  private async readLiveLocation(driverId: string): Promise<{ lat: number; lng: number } | null> {
    const raw = await this.redis.get(`driver:loc:${driverId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { lat?: number; lng?: number };
      if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
      return { lat: Number(parsed.lat), lng: Number(parsed.lng) };
    } catch {
      return null;
    }
  }

  private async requeueEta(rideId: string, scheduledAt: Date) {
    // Keep monitoring until a few minutes after scheduled pickup
    if (Date.now() > scheduledAt.getTime() + 15 * 60 * 1000) return;
    await this.queue.add(SCHEDULED_JOBS.ETA_MONITOR, { rideId } satisfies ScheduledRideJob, {
      jobId: `sched-eta-${rideId}-${Date.now()}`,
      delay: ETA_MONITOR_INTERVAL_MS,
      removeOnComplete: true,
      removeOnFail: 20,
    });
  }

  private async loadActiveScheduled(rideId: string) {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: rideId },
      include: {
        driver: { select: { id: true, user_id: true } },
        customer: { select: { user_id: true } },
      },
    });
    if (!ride || ride.type !== GoRideType.SCHEDULED || !ride.driver_id) return null;
    if (
      ride.status !== GoRideStatus.DRIVER_ASSIGNED &&
      ride.status !== GoRideStatus.DRIVER_EN_ROUTE &&
      ride.status !== GoRideStatus.ARRIVED
    ) {
      return null;
    }
    return ride;
  }
}
