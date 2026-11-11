import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  GoDriverAvailability,
  GoDriverGender,
  GoRideOfferStatus,
  GoRideRequirementType,
  GoRideStatus,
  GoRideType,
  GoServiceCode,
  type GoDispatchConfig,
  type GoRide,
} from '@/generated/prisma/client';
import { Queue } from 'bullmq';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import {
  DISPATCH_JOBS,
  QUEUES,
  type DispatchOfferTimeoutJob,
  type DispatchSearchJob,
} from '../../../infra/queue/queue.constants';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { LockService } from '../../../infra/redis/lock.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { GoConfigService } from '../config/config.service';
import { DiscountsService } from '../discounts/discounts.service';
import { DriverEligibilityService } from '../drivers/eligibility.service';
import { IncentivesService } from '../incentives/incentives.service';
import { RouteEstimateService } from '../rides/route-estimate.service';
import { assignedVehicleData, customerDriverSelect, driverCard, rideVehicle } from '../rides/ride-driver-card';
import {
  driverRideCustomerSelect,
  offerCustomerCard,
  paymentFields,
} from '../rides/driver-ride-customer';
import { toPickupHaversineM } from '../rides/ride-distances';
import { offerCanBeAccepted } from './offer-accept';
import { offerServiceAndCategoryFields } from './offer-display';
import { vehicleCategoryIds, vehicleMatchesRideCategory } from '../rides/ride-rules';
import { assertTransition } from '../rides/ride-state-machine';
import { ScheduledService } from '../scheduled/scheduled.service';
import { CustomerWalletService } from '../wallets/customer-wallet.service';
import {
  compareCandidates,
  driverSpeaksLanguage,
  rideRequiresLanguageMatch,
  type RankedCandidate,
} from './candidate-ranking';
import { WalletService } from '../wallets/wallet.service';
import { cellsForRadius, haversineM } from './h3.util';
import {
  emptySearchRetryDelayMs,
  stillWithinMinSearchWindow,
} from './min-search-window';
import { driverOfferSearchRadii } from './offer-radius';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GoConfigService,
    private readonly route: RouteEstimateService,
    private readonly eligibility: DriverEligibilityService,
    private readonly wallets: WalletService,
    private readonly discounts: DiscountsService,
    private readonly customerWallets: CustomerWalletService,
    private readonly realtime: RealtimeService,
    private readonly locks: LockService,
    private readonly redis: RedisService,
    private readonly scheduled: ScheduledService,
    private readonly incentives: IncentivesService,
    @InjectQueue(QUEUES.DISPATCH) private readonly dispatchQueue: Queue,
  ) {}

  async enqueueSearch(
    rideId: string,
    delayMs = 0,
    opts?: { radiusStepIndex?: number; batchNumber?: number },
  ) {
    // Stamp search clock once (IMMEDIATE create / first scheduled send). Re-SEARCHING paths set it explicitly.
    await this.prisma.goRide.updateMany({
      where: { id: rideId, status: GoRideStatus.SEARCHING, search_started_at: null },
      data: { search_started_at: new Date() },
    });
    const job: DispatchSearchJob = {
      rideId,
      radiusStepIndex: opts?.radiusStepIndex ?? 0,
      batchNumber: opts?.batchNumber ?? 1,
    };
    await this.dispatchQueue.add(DISPATCH_JOBS.SEARCH_TICK, job, {
      jobId: `search-${rideId}-${Date.now()}`,
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  async processSearchTick(data: DispatchSearchJob): Promise<void> {
    const ride = await this.prisma.goRide.findUnique({
      where: { id: data.rideId },
      include: {
        requirements: true,
        customer: { select: driverRideCustomerSelect },
        ride_category: { select: { id: true, code: true, name_ar: true, name_en: true } },
        service: { select: { code: true, name_ar: true, name_en: true } },
      },
    });
    if (!ride || ride.status !== GoRideStatus.SEARCHING) return;

    const cfg = await this.config.getDispatch();
    // Option A: fixed driver_offer_radius_m only — map circle = max offer distance; no expand beyond.
    const radii = driverOfferSearchRadii(cfg.driver_offer_radius_m);
    let step = data.radiusStepIndex ?? 0;
    if (step >= radii.length) {
      await this.continueEmptySearchOrFail(ride, cfg, data);
      return;
    }

    const already = await this.prisma.goRideOffer.findMany({
      where: { ride_id: ride.id },
      select: { driver_id: true },
    });
    const offered = new Set(already.map((o) => o.driver_id));

    // Skip empty radii immediately (Ticket §7.4) — under min_search_seconds we re-tick instead of fail.
    while (step < radii.length) {
      const radiusM = radii[step];
      const candidates = await this.findCandidates(ride, cfg, radiusM, offered);
      if (candidates.length === 0) {
        step += 1;
        continue;
      }

      const batchNumber = data.batchNumber ?? 1;
      const batch = candidates.slice(0, cfg.batch_size);
      const expiresAt = new Date(Date.now() + cfg.batch_timeout_seconds * 1000);

      await this.prisma.goRideOffer.createMany({
        data: batch.map((c) => ({
          ride_id: ride.id,
          driver_id: c.driver_id,
          batch_number: batchNumber,
          radius_m: radiusM,
          status: GoRideOfferStatus.PENDING,
          expires_at: expiresAt,
          effective_eta_sec: c.effective_eta_sec,
        })),
        skipDuplicates: true,
      });

      const createdOffers = await this.prisma.goRideOffer.findMany({
        where: {
          ride_id: ride.id,
          batch_number: batchNumber,
          driver_id: { in: batch.map((c) => c.driver_id) },
          status: GoRideOfferStatus.PENDING,
        },
        include: { driver: { select: { user_id: true } } },
      });
      const etaByDriver = new Map(batch.map((c) => [c.driver_id, c.effective_eta_sec]));
      const bonus = await this.incentives.offerBonus(ride).catch(() => null);
      const customer = await offerCustomerCard(this.prisma, ride.id, ride.customer);
      const showDestination = ride.service_code !== GoServiceCode.RENTAL;

      for (const offer of createdOffers) {
        offered.add(offer.driver_id);
        const payload = {
          offer_id: offer.id,
          ride_id: ride.id,
          public_number: ride.public_number,
          type: ride.type,
          ...offerServiceAndCategoryFields({
            service_code: ride.service_code,
            service: ride.service,
            ride_category: ride.ride_category,
          }),
          ...paymentFields(ride.payment_method),
          scheduled_at: ride.scheduled_at,
          pickup: { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng), address: ride.pickup_address },
          destination: showDestination
            ? {
                lat: Number(ride.original_destination_lat),
                lng: Number(ride.original_destination_lng),
                address: ride.original_destination_address,
              }
            : null,
          estimated_fare: ride.estimated_fare,
          estimated_distance_m: ride.estimated_distance_m,
          estimated_duration_sec: ride.estimated_duration_sec,
          estimated_route_polyline: ride.estimated_route_polyline,
          bonus,
          has_bonus: bonus != null,
          customer,
          customer_note: ride.customer_note,
          booking_for: ride.booking_for,
          other_passenger_name: ride.other_passenger_name,
          pickup_sign_name: ride.pickup_sign_name,
          preferred_driver_language: ride.preferred_driver_language,
          effective_eta_sec: etaByDriver.get(offer.driver_id) ?? offer.effective_eta_sec,
          expires_at: expiresAt.toISOString(),
          batch_number: batchNumber,
          radius_m: radiusM,
        };
        // Keep `ride.offer` for existing clients; ticket §28.2 name is `ride_offer.created`.
        this.realtime.emitToDriver(offer.driver.user_id, 'ride.offer', payload);
        this.realtime.emitToDriver(offer.driver.user_id, 'ride_offer.created', payload);
      }

      this.realtime.emitToCustomer(ride.customer.user_id, 'ride.searching', {
        ride_id: ride.id,
        batch_number: batchNumber,
        radius_m: radiusM,
        offers_sent: batch.length,
      });

      const timeoutJob: DispatchOfferTimeoutJob = { rideId: ride.id, batchNumber };
      await this.dispatchQueue.add(DISPATCH_JOBS.OFFER_TIMEOUT, timeoutJob, {
        jobId: `timeout-${ride.id}-${batchNumber}`,
        delay: cfg.batch_timeout_seconds * 1000,
        removeOnComplete: true,
        removeOnFail: 100,
      });
      return;
    }

    await this.continueEmptySearchOrFail(ride, cfg, data);
  }

  /**
   * No candidates at the fixed offer radius: keep SEARCHING and re-tick until min_search_seconds,
   * then FAILED_NO_DRIVER. Wallet/discount stay held during the wait.
   */
  private async continueEmptySearchOrFail(
    ride: GoRide & { customer: { user_id: string }; created_at: Date; search_started_at?: Date | null },
    cfg: GoDispatchConfig,
    data: DispatchSearchJob,
  ): Promise<void> {
    if (stillWithinMinSearchWindow(ride, cfg.min_search_seconds)) {
      const delayMs = emptySearchRetryDelayMs(cfg.empty_search_retry_seconds);
      this.logger.debug(
        `Ride ${ride.id} empty candidates; retry SEARCH_TICK in ${delayMs}ms (min_search=${cfg.min_search_seconds}s)`,
      );
      await this.enqueueSearch(ride.id, delayMs, {
        radiusStepIndex: 0,
        batchNumber: (data.batchNumber ?? 1) + 1,
      });
      return;
    }
    await this.failNoDriver(ride);
  }

  async processOfferTimeout(data: DispatchOfferTimeoutJob): Promise<void> {
    const ride = await this.prisma.goRide.findUnique({ where: { id: data.rideId } });
    if (!ride || ride.status !== GoRideStatus.SEARCHING) return;

    const pending = await this.prisma.goRideOffer.findMany({
      where: {
        ride_id: data.rideId,
        batch_number: data.batchNumber,
        status: GoRideOfferStatus.PENDING,
      },
      include: { driver: { select: { user_id: true } } },
    });
    await this.prisma.goRideOffer.updateMany({
      where: {
        ride_id: data.rideId,
        batch_number: data.batchNumber,
        status: GoRideOfferStatus.PENDING,
      },
      data: { status: GoRideOfferStatus.EXPIRED, responded_at: new Date() },
    });
    for (const offer of pending) {
      this.realtime.emitToDriver(offer.driver.user_id, 'ride_offer.expired', {
        offer_id: offer.id,
        ride_id: data.rideId,
        batch_number: data.batchNumber,
      });
    }
    await this.recordRejection(data.rideId);

    const cfg = await this.config.getDispatch();
    const radii = driverOfferSearchRadii(cfg.driver_offer_radius_m);
    const lastOffer = await this.prisma.goRideOffer.findFirst({
      where: { ride_id: data.rideId },
      orderBy: [{ batch_number: 'desc' }, { offered_at: 'desc' }],
    });
    const currentRadius = lastOffer?.radius_m ?? radii[0];
    const step = Math.max(0, radii.indexOf(currentRadius));

    // Same fixed offer radius, next batch (Option A — no expansion beyond driver_offer_radius_m).
    await this.dispatchQueue.add(
      DISPATCH_JOBS.SEARCH_TICK,
      {
        rideId: data.rideId,
        radiusStepIndex: step,
        batchNumber: data.batchNumber + 1,
      } satisfies DispatchSearchJob,
      { jobId: `search-${data.rideId}-b${data.batchNumber + 1}-${Date.now()}`, removeOnComplete: true },
    );
  }

  async listOffersForDriver(userId: string) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { user_id: userId } });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    const now = new Date();
    const offers = await this.prisma.goRideOffer.findMany({
      where: {
        driver_id: driver.id,
        status: GoRideOfferStatus.PENDING,
        expires_at: { gt: now },
        ride: { status: GoRideStatus.SEARCHING },
      },
      include: {
        ride: {
          select: {
            id: true,
            public_number: true,
            type: true,
            service_code: true,
            payment_method: true,
            scheduled_at: true,
            pickup_lat: true,
            pickup_lng: true,
            pickup_address: true,
            original_destination_lat: true,
            original_destination_lng: true,
            original_destination_address: true,
            estimated_fare: true,
            estimated_distance_m: true,
            estimated_duration_sec: true,
            estimated_route_polyline: true,
            customer_note: true,
            booking_for: true,
            other_passenger_name: true,
            pickup_sign_name: true,
            preferred_driver_language: true,
            incentive_percentage: true,
            incentive_reason: true,
            incentive_rejection_pct: true,
            incentive_distance_pct: true,
            ride_category: { select: { id: true, code: true, name_en: true, name_ar: true } },
            service: { select: { code: true, name_ar: true, name_en: true } },
            customer: { select: driverRideCustomerSelect },
          },
        },
      },
      orderBy: { offered_at: 'desc' },
    });
    return Promise.all(
      offers.map(async (offer) => {
        const { customer: customerRow, ...rideRest } = offer.ride;
        const customer = await offerCustomerCard(this.prisma, offer.ride.id, customerRow);
        const showDestination = offer.ride.service_code !== GoServiceCode.RENTAL;
        const bonus = await this.incentives.offerBonus(offer.ride).catch(() => null);
        const display = offerServiceAndCategoryFields({
          service_code: offer.ride.service_code,
          service: offer.ride.service,
          ride_category: offer.ride.ride_category,
        });
        return {
          ...offer,
          ride: {
            ...rideRest,
            ...paymentFields(offer.ride.payment_method),
            destination: showDestination
              ? {
                  lat: Number(offer.ride.original_destination_lat),
                  lng: Number(offer.ride.original_destination_lng),
                  address: offer.ride.original_destination_address,
                }
              : null,
            customer,
          },
          customer,
          ...display,
          type: offer.ride.type,
          scheduled_at: offer.ride.scheduled_at,
          ...paymentFields(offer.ride.payment_method),
          estimated_route_polyline: offer.ride.estimated_route_polyline,
          estimated_distance_m: offer.ride.estimated_distance_m,
          estimated_duration_sec: offer.ride.estimated_duration_sec,
          bonus,
          has_bonus: bonus != null,
        };
      }),
    );
  }

  async acceptOffer(user: AuthUser, offerId: string) {
    const driver = await this.prisma.goDriverProfile.findUnique({
      where: { user_id: user.id },
      include: { state: true },
    });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');

    const offer = await this.prisma.goRideOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.driver_id !== driver.id) {
      throw new GoException(GoErrorCode.NOT_FOUND, 'Offer not found');
    }

    return this.locks.withLock(`ride-accept:${offer.ride_id}`, async () => {
      const freshOffer = await this.prisma.goRideOffer.findUnique({ where: { id: offerId } });
      const ride = await this.prisma.goRide.findUnique({
        where: { id: freshOffer?.ride_id ?? offer.ride_id },
        include: { customer: true },
      });
      if (
        !freshOffer ||
        !ride ||
        !offerCanBeAccepted({
          status: freshOffer.status,
          expiresAt: freshOffer.expires_at,
          now: new Date(),
          rideStatus: ride.status,
        })
      ) {
        throw new GoException(GoErrorCode.RIDE_ALREADY_TAKEN, 'Offer is no longer available');
      }

      await this.eligibility.assertEligible(user.id, {
        estimatedFare: ride.estimated_fare != null ? Number(ride.estimated_fare) : null,
      });
      await this.wallets.reserveForRide(driver.id, ride.id, ride.estimated_fare);

      const state = await this.prisma.goDriverState.findUnique({ where: { driver_id: driver.id } });
      const hasCurrent = !!state?.current_ride_id;
      const hasNext = !!state?.next_ride_id;
      if (hasCurrent && hasNext) {
        throw new GoException(GoErrorCode.DRIVER_ALREADY_HAS_NEXT_RIDE, 'Driver already has current + next ride');
      }
      // One reserved scheduled at a time (next slot or another reserved scheduled)
      if (ride.type === GoRideType.SCHEDULED && hasNext) {
        throw new GoException(GoErrorCode.DRIVER_ALREADY_HAS_NEXT_RIDE, 'Driver already has a reserved next ride');
      }

      const isScheduled = ride.type === GoRideType.SCHEDULED;
      const asNext = isScheduled || (hasCurrent && !hasNext);
      assertTransition(GoRideStatus.SEARCHING, GoRideStatus.DRIVER_ASSIGNED);
      if (!isScheduled && !asNext) {
        assertTransition(GoRideStatus.DRIVER_ASSIGNED, GoRideStatus.DRIVER_EN_ROUTE);
      }

      const targetStatus =
        isScheduled || asNext ? GoRideStatus.DRIVER_ASSIGNED : GoRideStatus.DRIVER_EN_ROUTE;

      const otherPending = await this.prisma.goRideOffer.findMany({
        where: {
          ride_id: ride.id,
          id: { not: offerId },
          status: GoRideOfferStatus.PENDING,
        },
        include: { driver: { select: { user_id: true } } },
      });

      const live = await this.readLiveLocation(driver.id);
      const from =
        live ??
        (driver.state?.last_lat != null && driver.state.last_lng != null
          ? { lat: Number(driver.state.last_lat), lng: Number(driver.state.last_lng) }
          : null);
      const toPickupDistanceM = toPickupHaversineM(from, {
        lat: ride.pickup_lat,
        lng: ride.pickup_lng,
      });

      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.goRideOffer.update({
          where: { id: offerId },
          data: { status: GoRideOfferStatus.ACCEPTED, responded_at: new Date() },
        });
        await tx.goRideOffer.updateMany({
          where: {
            ride_id: ride.id,
            id: { not: offerId },
            status: GoRideOfferStatus.PENDING,
          },
          data: { status: GoRideOfferStatus.TAKEN_BY_OTHER, responded_at: new Date() },
        });

        const r = await tx.goRide.update({
          where: { id: ride.id },
          data: {
            driver_id: driver.id,
            status: targetStatus,
            assigned_at: new Date(),
            to_pickup_distance_m: toPickupDistanceM ?? undefined,
            ...(await assignedVehicleData(tx, driver.id)),
          },
          include: {
            ride_category: { select: { id: true, code: true, name_ar: true, name_en: true } },
            branch: { select: { id: true, code: true, name_ar: true } },
            customer: { select: { id: true, user_id: true, user: { select: { full_name: true, phone: true } } } },
            driver: { select: { id: true, user_id: true, user: { select: { full_name: true, phone: true } } } },
            stops: true,
            requirements: true,
          },
        });

        if (isScheduled) {
          // Reserved: keep driver ONLINE if free; occupy next slot
          await tx.goDriverState.upsert({
            where: { driver_id: driver.id },
            create: {
              driver_id: driver.id,
              availability: hasCurrent ? GoDriverAvailability.BUSY : GoDriverAvailability.ONLINE,
              current_ride_id: state?.current_ride_id ?? null,
              next_ride_id: ride.id,
            },
            update: {
              next_ride_id: ride.id,
              availability: hasCurrent ? GoDriverAvailability.BUSY : (state?.availability ?? GoDriverAvailability.ONLINE),
            },
          });
        } else {
          await tx.goDriverState.upsert({
            where: { driver_id: driver.id },
            create: {
              driver_id: driver.id,
              availability: GoDriverAvailability.BUSY,
              current_ride_id: asNext ? state!.current_ride_id : ride.id,
              next_ride_id: asNext ? ride.id : null,
            },
            update: asNext
              ? { next_ride_id: ride.id, availability: GoDriverAvailability.BUSY }
              : {
                  current_ride_id: ride.id,
                  next_ride_id: null,
                  availability: GoDriverAvailability.BUSY,
                },
          });
        }
        return r;
      });

      if (isScheduled) {
        await this.scheduled.scheduleLifecycle(ride.id);
      }

      const assignedDriver = await this.prisma.goDriverProfile.findUniqueOrThrow({
        where: { id: driver.id },
        select: customerDriverSelect,
      });
      this.realtime.emitToCustomer(ride.customer.user_id, 'ride.driver_assigned', {
        ride_id: ride.id,
        driver_id: driver.id,
        status: updated.status,
        reserved: isScheduled,
        as_next: asNext,
        driver: await driverCard(this.prisma, ride.id, assignedDriver),
        vehicle: rideVehicle(updated.vehicle_snapshot),
      });
      this.realtime.emitToDriver(user.id, 'ride.assigned', {
        ride_id: ride.id,
        status: updated.status,
        reserved: isScheduled,
        as_next: asNext,
      });
      for (const other of otherPending) {
        this.realtime.emitToDriver(other.driver.user_id, 'ride_offer.taken', {
          offer_id: other.id,
          ride_id: ride.id,
          accepted_offer_id: offerId,
        });
      }
      return updated;
    });
  }

  async declineOffer(user: AuthUser, offerId: string) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { user_id: user.id } });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    const offer = await this.prisma.goRideOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.driver_id !== driver.id) {
      throw new GoException(GoErrorCode.NOT_FOUND, 'Offer not found');
    }
    if (offer.status !== GoRideOfferStatus.PENDING) {
      throw new GoException(GoErrorCode.CONFLICT, 'Offer is not pending');
    }
    const declined = await this.prisma.goRideOffer.update({
      where: { id: offerId },
      data: { status: GoRideOfferStatus.DECLINED, responded_at: new Date() },
    });
    await this.recordRejection(offer.ride_id);
    return declined;
  }

  /** Incentives must never break dispatch. */
  private async recordRejection(rideId: string) {
    try {
      await this.incentives.recordRejection(rideId);
    } catch (err) {
      this.logger.warn(`Rejection bonus for ${rideId} failed: ${(err as Error).message}`);
    }
  }

  /** Expire open offers when staff manually assigns (Phase 2 bridge). */
  async expireOffersForRide(rideId: string) {
    await this.prisma.goRideOffer.updateMany({
      where: { ride_id: rideId, status: GoRideOfferStatus.PENDING },
      data: { status: GoRideOfferStatus.TAKEN_BY_OTHER, responded_at: new Date() },
    });
  }

  /** After current ride completes, promote next → current and start en-route. */
  async promoteNextRide(driverId: string): Promise<void> {
    const state = await this.prisma.goDriverState.findUnique({ where: { driver_id: driverId } });
    if (!state?.next_ride_id) {
      await this.prisma.goDriverState.updateMany({
        where: { driver_id: driverId },
        data: { current_ride_id: null, availability: GoDriverAvailability.ONLINE },
      });
      return;
    }
    const nextId = state.next_ride_id;
    const next = await this.prisma.goRide.findUnique({
      where: { id: nextId },
      include: { customer: true, driver: true },
    });
    if (!next || next.status !== GoRideStatus.DRIVER_ASSIGNED) {
      await this.prisma.goDriverState.update({
        where: { driver_id: driverId },
        data: { current_ride_id: null, next_ride_id: null, availability: GoDriverAvailability.ONLINE },
      });
      return;
    }
    assertTransition(GoRideStatus.DRIVER_ASSIGNED, GoRideStatus.DRIVER_EN_ROUTE);
    await this.prisma.$transaction([
      this.prisma.goRide.update({
        where: { id: nextId },
        data: { status: GoRideStatus.DRIVER_EN_ROUTE },
      }),
      this.prisma.goDriverState.update({
        where: { driver_id: driverId },
        data: {
          current_ride_id: nextId,
          next_ride_id: null,
          availability: GoDriverAvailability.BUSY,
        },
      }),
    ]);
    if (next.customer && next.driver) {
      this.realtime.emitToCustomer(next.customer.user_id, 'ride.driver_en_route', { ride_id: nextId });
      this.realtime.emitToDriver(next.driver.user_id, 'ride.en_route', { ride_id: nextId });
    }
  }

  private async failNoDriver(ride: GoRide & { customer: { user_id: string } }) {
    assertTransition(GoRideStatus.SEARCHING, GoRideStatus.FAILED_NO_DRIVER);
    // Staff may assign a driver between the search tick's read and this write.
    const failed = await this.prisma.goRide.updateMany({
      where: { id: ride.id, status: GoRideStatus.SEARCHING },
      data: { status: GoRideStatus.FAILED_NO_DRIVER },
    });
    if (failed.count === 0) return;
    const pending = await this.prisma.goRideOffer.findMany({
      where: { ride_id: ride.id, status: GoRideOfferStatus.PENDING },
      include: { driver: { select: { user_id: true } } },
    });
    await this.prisma.goRideOffer.updateMany({
      where: { ride_id: ride.id, status: GoRideOfferStatus.PENDING },
      data: { status: GoRideOfferStatus.EXPIRED, responded_at: new Date() },
    });
    for (const offer of pending) {
      this.realtime.emitToDriver(offer.driver.user_id, 'ride_offer.expired', {
        offer_id: offer.id,
        ride_id: ride.id,
        reason: 'FAILED_NO_DRIVER',
      });
    }
    await this.discounts.releaseForRide(ride.id);
    await this.customerWallets.refundRide(ride.id, 'ride_failed_no_driver');
    this.realtime.emitToCustomer(ride.customer.user_id, 'ride.failed_no_driver', { ride_id: ride.id });
    this.logger.log(`Ride ${ride.id} FAILED_NO_DRIVER`);
  }

  private async findCandidates(
    ride: GoRide & {
      requirements: { type: string }[];
      ride_category?: { code: string } | null;
    },
    cfg: GoDispatchConfig,
    radiusM: number,
    exclude: Set<string>,
  ): Promise<RankedCandidate[]> {
    const pickup = { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) };
    const cells = cellsForRadius(pickup.lat, pickup.lng, radiusM);
    const staleBefore = new Date(Date.now() - cfg.stale_location_seconds * 1000);

    const states = await this.prisma.goDriverState.findMany({
      where: {
        h3_index: { in: cells },
        availability: { in: [GoDriverAvailability.ONLINE, GoDriverAvailability.BUSY] },
        last_location_at: { gte: staleBefore },
        last_lat: { not: null },
        last_lng: { not: null },
        driver: {
          is_suspended: false,
          operational_blocked: false,
          user: { is_active: true },
          ...(ride.branch_id ? {} : {}),
        },
      },
      include: {
        driver: {
          include: {
            user: { select: { id: true, is_active: true } },
            active_vehicle: {
              include: {
                capabilities: true,
                ride_categories: { select: { ride_category_id: true } },
              },
            },
            documents: true,
          },
        },
      },
    });

    const reqTypes = new Set(ride.requirements.map((r) => r.type));
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ranked: RankedCandidate[] = [];

    for (const st of states) {
      if (exclude.has(st.driver_id)) continue;
      if (!st.last_lat || !st.last_lng) continue;

      // Ticket §6 — live location primary in Redis; DB snapshot is fallback
      const live = await this.readLiveLocation(st.driver_id);
      const driverPos = {
        lat: live?.lat ?? Number(st.last_lat),
        lng: live?.lng ?? Number(st.last_lng),
      };

      const dist = haversineM(pickup, driverPos);
      if (dist > radiusM) continue;

      const elig = await this.eligibility.evaluate(st.driver.user_id, {
        estimatedFare: ride.estimated_fare != null ? Number(ride.estimated_fare) : null,
      });
      if (!elig.eligible) continue;

      // Strict category match — vehicle must list the ride's category (supports multi-category).
      if (!vehicleMatchesRideCategory(vehicleCategoryIds(st.driver.active_vehicle), ride.ride_category_id)) {
        continue;
      }

      const languageMatch = driverSpeaksLanguage(
        st.driver.languages,
        ride.preferred_driver_language,
        st.driver.mother_tongue,
      );
      // VIP + tourist: only drivers who speak the customer's chosen language.
      if (
        rideRequiresLanguageMatch({
          service_code: ride.service_code,
          category_code: ride.ride_category?.code,
        }) &&
        !languageMatch
      ) {
        continue;
      }

      if (reqTypes.size > 0) {
        const caps = new Set(st.driver.active_vehicle?.capabilities.map((c) => c.type) ?? []);
        let ok = true;
        for (const t of reqTypes) {
          if (t === GoRideRequirementType.FEMALE_DRIVER) {
            if (st.driver.gender !== GoDriverGender.FEMALE) {
              ok = false;
              break;
            }
          } else if (!caps.has(t as GoRideRequirementType)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }

      let effectiveEta: number;
      let isBusy = false;

      // Scheduled offers need a free next-slot (Ticket §7.7 current+next)
      if (ride.type === GoRideType.SCHEDULED && st.next_ride_id) continue;

      if (st.availability === GoDriverAvailability.ONLINE && !st.current_ride_id) {
        effectiveEta = (await this.route.estimate([driverPos, pickup])).duration_sec;
      } else if (st.availability === GoDriverAvailability.BUSY && st.current_ride_id && !st.next_ride_id) {
        isBusy = true;
        const current = await this.prisma.goRide.findUnique({ where: { id: st.current_ride_id } });
        if (!current) continue;
        const drop = {
          lat: Number(current.original_destination_lat),
          lng: Number(current.original_destination_lng),
        };
        const remain = (await this.route.estimate([driverPos, drop])).duration_sec;
        const toPickup = (await this.route.estimate([drop, pickup])).duration_sec;
        effectiveEta = remain + toPickup;
        const busyCap =
          ride.type === GoRideType.SCHEDULED
            ? cfg.scheduled_busy_to_pickup_max_eta_sec
            : cfg.busy_driver_max_eta_sec;
        if (effectiveEta > busyCap) continue;
      } else {
        continue; // already has next, or offline-ish
      }

      if (!(await this.passesScheduledConflictGuard(st.driver_id, ride, effectiveEta, cfg))) {
        continue;
      }

      const fairness = await this.prisma.goRide.count({
        where: {
          driver_id: st.driver_id,
          status: GoRideStatus.COMPLETED,
          completed_at: { gte: dayAgo },
        },
      });

      ranked.push({
        driver_id: st.driver_id,
        user_id: st.driver.user_id,
        effective_eta_sec: effectiveEta,
        distance_m: Math.round(dist),
        is_busy: isBusy,
        fairness_rides_24h: fairness,
        language_match: languageMatch,
      });
    }

    ranked.sort(compareCandidates);
    return ranked;
  }

  /** Ticket §6 — prefer Redis live location over DB snapshot. */
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

  /**
   * Ticket §7.6 — if driver holds a future scheduled ride, immediate completion
   * + travel to scheduled pickup must arrive by scheduled_at − early_arrival.
   */
  private async passesScheduledConflictGuard(
    driverId: string,
    immediate: GoRide,
    effectiveEtaToPickupSec: number,
    cfg: GoDispatchConfig,
  ): Promise<boolean> {
    const scheduled = await this.prisma.goRide.findFirst({
      where: {
        driver_id: driverId,
        type: GoRideType.SCHEDULED,
        status: { in: [GoRideStatus.DRIVER_ASSIGNED, GoRideStatus.DRIVER_EN_ROUTE] },
        scheduled_at: { gt: new Date() },
      },
      orderBy: { scheduled_at: 'asc' },
    });
    if (!scheduled?.scheduled_at) return true;

    const immDuration = immediate.estimated_duration_sec ?? 0;
    const immCompleteAt =
      Date.now() +
      (effectiveEtaToPickupSec + immDuration + (immediate.estimated_duration_sec ? 0 : 0)) * 1000;
    // completion of immediate then ETA to scheduled pickup
    const toScheduled = (await this.route.estimate([
      {
        lat: Number(immediate.original_destination_lat),
        lng: Number(immediate.original_destination_lng),
      },
      { lat: Number(scheduled.pickup_lat), lng: Number(scheduled.pickup_lng) },
    ])).duration_sec;
    const arriveScheduled = immCompleteAt + toScheduled * 1000;
    const deadline = scheduled.scheduled_at.getTime() - cfg.scheduled_required_early_arrival_sec * 1000;
    return arriveScheduled <= deadline;
  }
}
