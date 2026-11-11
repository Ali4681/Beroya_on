import {
  GoIncentiveKind,
  GoPaymentMethod,
  GoPaymentStatus,
  GoPerKmMode,
  GoRideOfferStatus,
  GoRideStatus,
  GoRideType,
  GoWalletTransactionType,
  Prisma,
  PrismaClient,
} from '../src/generated/prisma/client';
import { addDays, dayKey, zonedInstant } from '../src/modules/go/incentives/time.util';
import { seedBookedRoute } from './seed-google-route';

const TZ = 'Asia/Damascus';

type Party = { id: string; userId: string };

export type IncentiveSeedInput = {
  now: Date;
  adminId: string;
  damascusId: string;
  aleppoId: string;
  categoryId: string;
  customerId: string;
  drivers: { rana: Party; sara: Party; mazen: Party; fadi: Party; kanan: Party; demo: Party };
};

type Point = { lat: number; lng: number };

/**
 * Yesterday's incentive day (Damascus): a streak achieved (رنا) and one broken by a decline (مازن),
 * a ride refused by five drivers, a pickup far from Aleppo's centre, a night goal with one achiever
 * (سارة) and one who fell short (مازن), a fuel price change, and online sessions for the driver score.
 * Idempotent: rides by public number, grants by (driver, kind, period).
 */
export async function seedIncentives(prisma: PrismaClient, input: IncentiveSeedInput) {
  const day = addDays(dayKey(input.now, TZ), -1);
  const at = (time: string) => zonedInstant(day, time, TZ);
  const minutes = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);
  const { rana, sara, mazen, fadi, kanan, demo } = input.drivers;
  const damascus: Point = { lat: 33.5138, lng: 36.2765 };

  let seq = 0;
  async function ride(opts: {
    driver: Party;
    branchId?: string;
    completedAt: Date;
    distanceM?: number;
    fare?: number;
    pickup?: Point;
    dropoff?: Point;
  }) {
    seq += 1;
    const publicNumber = `SEED-INC-${day.replace(/-/g, '')}-${String(seq).padStart(2, '0')}`;
    const pickup = opts.pickup ?? damascus;
    const dropoff = opts.dropoff ?? { lat: pickup.lat + 0.02, lng: pickup.lng + 0.02 };
    const fare = opts.fare ?? 6000;
    const route = await seedBookedRoute(pickup, dropoff);
    const duration = opts.distanceM ? 900 : route.duration_sec;
    const distanceM = opts.distanceM ?? route.distance_m;
    const startedAt = new Date(opts.completedAt.getTime() - duration * 1000);
    const data = {
      customer_id: input.customerId,
      driver_id: opts.driver.id,
      branch_id: opts.branchId ?? input.damascusId,
      ride_category_id: input.categoryId,
      type: GoRideType.IMMEDIATE,
      status: GoRideStatus.COMPLETED,
      payment_method: GoPaymentMethod.CASH,
      payment_status: GoPaymentStatus.COLLECTED,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      pickup_address: 'رحلة حوافز تجريبية',
      original_destination_lat: dropoff.lat,
      original_destination_lng: dropoff.lng,
      original_destination_address: 'وجهة تجريبية',
      actual_dropoff_lat: dropoff.lat,
      actual_dropoff_lng: dropoff.lng,
      estimated_distance_m: distanceM,
      estimated_duration_sec: duration,
      estimated_fare: fare,
      estimated_route_polyline: route.encoded_polyline,
      estimated_route_source: route.source,
      estimated_route_summary: route.summary || 'رحلة حوافز تجريبية → وجهة تجريبية',
      actual_distance_m: distanceM,
      actual_duration_sec: duration,
      gross_final_fare: fare,
      customer_payable: fare,
      created_at: minutes(startedAt, -10),
      assigned_at: minutes(startedAt, -8),
      arrived_at: minutes(startedAt, -2),
      started_at: startedAt,
      completed_at: opts.completedAt,
    };
    return prisma.goRide.upsert({
      where: { public_number: publicNumber },
      update: data,
      create: { public_number: publicNumber, ...data },
    });
  }

  async function offer(rideId: string, driver: Party, status: GoRideOfferStatus, respondedAt: Date) {
    const data = {
      batch_number: 1,
      radius_m: 3000,
      status,
      offered_at: minutes(respondedAt, -0.25),
      expires_at: minutes(respondedAt, 0.25),
      responded_at: respondedAt,
    };
    await prisma.goRideOffer.upsert({
      where: { ride_id_driver_id: { ride_id: rideId, driver_id: driver.id } },
      update: data,
      create: { ride_id: rideId, driver_id: driver.id, ...data },
    });
  }

  async function grant(driver: Party, kind: GoIncentiveKind, periodKey: string, amount: number, extra: { rideId?: string; campaignId?: string; label: string; metadata: Record<string, unknown>; createdAt: Date }) {
    const found = await prisma.goDriverIncentiveGrant.findUnique({
      where: { driver_id_kind_period_key: { driver_id: driver.id, kind, period_key: periodKey } },
    });
    if (found) return found;
    const wallet = await prisma.goDriverWallet.upsert({
      where: { driver_id: driver.id },
      update: {},
      create: { driver_id: driver.id, balance: 0 },
    });
    const before = new Prisma.Decimal(wallet.balance);
    const after = before.plus(amount);
    return prisma.$transaction(async (tx) => {
      await tx.goDriverWallet.update({ where: { id: wallet.id }, data: { balance: after } });
      const walletTx = await tx.goDriverWalletTransaction.create({
        data: {
          wallet_id: wallet.id,
          driver_id: driver.id,
          type: GoWalletTransactionType.INCENTIVE_BONUS,
          amount,
          balance_before: before,
          balance_after: after,
          ride_id: extra.rideId ?? null,
          reason: `incentive:${kind}; ${extra.label}`,
          created_at: extra.createdAt,
        },
      });
      return tx.goDriverIncentiveGrant.create({
        data: {
          driver_id: driver.id,
          kind,
          period_key: periodKey,
          amount,
          ride_id: extra.rideId ?? null,
          campaign_id: extra.campaignId ?? null,
          wallet_transaction_id: walletTx.id,
          metadata: extra.metadata as Prisma.InputJsonValue,
          created_at: extra.createdAt,
        },
      });
    });
  }

  async function run(kind: GoIncentiveKind, periodKey: string, settledAt: Date, stats: Record<string, unknown>, notifiedAt?: Date) {
    await prisma.goIncentiveRun.upsert({
      where: { kind_period_key: { kind, period_key: periodKey } },
      update: {},
      create: { kind, period_key: periodKey, notified_at: notifiedAt ?? null, settled_at: settledAt, stats: stats as Prisma.InputJsonValue },
    });
  }

  const config = await prisma.goIncentiveConfig.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  const endOfDay = zonedInstant(addDays(day, 1), '00:00', TZ);

  // Streak: رنا completes three in a row → paid. مازن: two, a decline, then one → not paid.
  for (const time of ['10:00', '10:40', '11:20']) await ride({ driver: rana, completedAt: at(time) });
  const mazen1 = await ride({ driver: mazen, completedAt: at('12:00') });
  await ride({ driver: mazen, completedAt: at('12:30') });
  await ride({ driver: mazen, completedAt: at('13:15') });

  // Refused by five drivers (مازن's decline at 12:45 is the one that breaks his streak), then سارة accepts.
  const refused = await ride({ driver: sara, completedAt: at('13:30'), fare: 12000, distanceM: 6200 });
  const decliners: [Party, string][] = [[rana, '12:41'], [demo, '12:42'], [fadi, '12:43'], [kanan, '12:44'], [mazen, '12:45']];
  for (const [driver, time] of decliners) await offer(refused.id, driver, GoRideOfferStatus.DECLINED, at(time));
  await offer(refused.id, sara, GoRideOfferStatus.ACCEPTED, at('12:52'));
  await prisma.goRide.update({
    where: { id: refused.id },
    data: { incentive_rejection_pct: 15, incentive_percentage: 15, incentive_reason: 'REJECTION' },
  });
  await grant(sara, GoIncentiveKind.RIDE_REJECTION, refused.id, 1800, {
    rideId: refused.id,
    label: `مكافأة طلب رفضه سائقون آخرون (${refused.public_number})`,
    metadata: { percentage: 15, gross_fare: 12000, stack: 'MAX' },
    createdAt: at('13:30'),
  });
  void mazen1;

  // Far pickup: 22 km from Aleppo's centre.
  const far = await ride({
    driver: fadi,
    branchId: input.aleppoId,
    completedAt: at('16:00'),
    fare: 9000,
    distanceM: 8000,
    pickup: { lat: 36.38, lng: 37.0 },
    dropoff: { lat: 36.25, lng: 37.12 },
  });
  await offer(far.id, fadi, GoRideOfferStatus.ACCEPTED, at('15:35'));
  await prisma.goRide.update({
    where: { id: far.id },
    data: { incentive_distance_pct: 10, incentive_percentage: 10, incentive_reason: 'DISTANCE' },
  });
  await grant(fadi, GoIncentiveKind.RIDE_DISTANCE, far.id, 900, {
    rideId: far.id,
    label: `مكافأة طلب بعيد عن المركز (${far.public_number})`,
    metadata: { percentage: 10, gross_fare: 9000, stack: 'MAX' },
    createdAt: at('16:00'),
  });

  // Streak settlement for the day.
  await grant(rana, GoIncentiveKind.STREAK_DAILY, day, Number(config.streak_amount), {
    label: 'مكافأة الرحلات المتتالية',
    metadata: { day, longest: 3, streak_rides: 3 },
    createdAt: minutes(endOfDay, 1),
  });
  await run(GoIncentiveKind.STREAK_DAILY, day, minutes(endOfDay, 1), {
    day, drivers_checked: 3, qualified: 1, GRANTED: 1, DUPLICATE: 0, CAP_REACHED: 0, SKIPPED: 0,
  });

  // Night goal 22:00–00:00, 3 rides → 50,000. سارة: 3 rides (paid). مازن: 1 ride (not paid).
  const campaignName = 'هدف الليل (تجريبي)';
  const campaign =
    (await prisma.goGoalCampaign.findFirst({ where: { name: campaignName } })) ??
    (await prisma.goGoalCampaign.create({
      data: {
        name: campaignName,
        start_time: '22:00',
        end_time: '00:00',
        days_of_week: [],
        rides_required: 3,
        reward_amount: 50000,
        branch_id: input.damascusId,
        created_by_id: input.adminId,
        created_at: zonedInstant(addDays(day, -7), '12:00', TZ),
      },
    }));
  for (const time of ['22:20', '22:55', '23:35']) await ride({ driver: sara, completedAt: at(time) });
  const lateMazen = await ride({ driver: mazen, completedAt: at('22:40') });
  // سارة let this one expire first, so her four rides that day are not one streak.
  await offer(lateMazen.id, sara, GoRideOfferStatus.EXPIRED, at('22:24'));
  await offer(lateMazen.id, mazen, GoRideOfferStatus.ACCEPTED, at('22:25'));
  const campaignKey = `${campaign.id}:${day}`;
  await grant(sara, GoIncentiveKind.GOAL_CAMPAIGN, campaignKey, 50000, {
    campaignId: campaign.id,
    label: `مكافأة حملة الهدف: ${campaignName}`,
    metadata: { day, rides: 3, rides_required: 3 },
    createdAt: minutes(endOfDay, 1),
  });
  await run(
    GoIncentiveKind.GOAL_CAMPAIGN,
    campaignKey,
    minutes(endOfDay, 1),
    { campaign_id: campaign.id, name: campaignName, day, participants: 2, achieved: 1, GRANTED: 1, DUPLICATE: 0, CAP_REACHED: 0, SKIPPED: 0 },
    at('22:00'),
  );

  // Online sessions on that day (driver score: online hours).
  const sessions: [Party, string, string][] = [
    [rana, '09:30', '18:00'],
    [sara, '12:30', '23:59'],
    [mazen, '11:45', '14:00'],
    [mazen, '22:15', '23:00'],
    [fadi, '15:00', '20:00'],
  ];
  for (const [driver, from, to] of sessions) {
    const startedAt = at(from);
    const exists = await prisma.goDriverOnlineSession.findFirst({ where: { driver_id: driver.id, started_at: startedAt } });
    if (!exists) {
      await prisma.goDriverOnlineSession.create({
        data: { driver_id: driver.id, started_at: startedAt, ended_at: at(to), end_reason: 'DRIVER_OFFLINE' },
      });
    }
  }

  // Fuel: one change in history (10,000 → 11,000, +10%) when no price was ever entered.
  const fuel = await prisma.goFuelPricing.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  if (fuel.current_price == null && (await prisma.goFuelPriceChange.count()) === 0) {
    const pricing = await prisma.goRidePricing.findMany({
      where: { per_km_mode: GoPerKmMode.AUTO },
      include: { ride_category: { select: { code: true, name_ar: true } } },
    });
    const step = Number(fuel.rounding_step) || 1;
    await prisma.goFuelPriceChange.create({
      data: {
        old_price: 10000,
        new_price: 11000,
        fuel_share_pct: fuel.fuel_share_pct,
        rounding_step: fuel.rounding_step,
        changed_by_id: input.adminId,
        affected: pricing.map((p) => ({
          ride_category_id: p.ride_category_id,
          code: p.ride_category.code,
          name_ar: p.ride_category.name_ar,
          old_per_km: Math.round(Number(p.price_per_km) / 1.1 / step) * step,
          new_per_km: Number(p.price_per_km),
        })),
        created_at: zonedInstant(addDays(day, -3), '09:00', TZ),
      },
    });
    await prisma.goFuelPricing.update({ where: { id: 'default' }, data: { current_price: 11000 } });
  }
}
