import { Injectable } from '@nestjs/common';
import {
  GoCommissionBase,
  GoRatingDirection,
  GoRideOfferStatus,
  GoRideStatus,
  GoWalletTransactionType,
  Prisma,
} from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { IncentivesService } from '../incentives/incentives.service';
import { dayKey, minutesOfDay } from '../incentives/time.util';
import { decimalToNumber } from '../pricing/fare.calculator';
import { WalletService } from '../wallets/wallet.service';
import {
  hourSeriesTemplate,
  monthSeriesTemplate,
  previousPeriodWindow,
  resolvePeriodWindow,
  type StatsPeriod,
  weekSeriesTemplate,
  type PeriodWindow,
} from './driver-statistics.periods';

const DEFAULT_TZ = 'Asia/Damascus';
const CURRENCY = 'SYP';

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, total: number) => (total > 0 ? round1((part / total) * 100) : 0);

/**
 * Driver home «إحصائيات» aggregates for day / week / month.
 *
 * Definitions (documented for Flutter):
 * - Earnings gross = sum of commission base (gross_final_fare or customer_payable per wallet config)
 * - fees = expected platform commission on that base (same % as invoice)
 * - net = gross − fees (= invoice driver_earnings sum)
 * - Acceptance = ACCEPTED / (ACCEPTED + DECLINED + EXPIRED); timeouts count against the rate
 * - customer_rating (0–100) = rating_avg / 5 × 100
 * - score = weighted avg of customer_rating + acceptance_rate using incentive weight_rating / weight_acceptance
 *   (no peer hours/earnings ranking — those stay ERP-only)
 */
@Injectable()
export class DriverStatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly incentives: IncentivesService,
    private readonly wallets: WalletService,
  ) {}

  async getForDriver(userId: string, period: StatsPeriod, atIso?: string) {
    const profile = await this.prisma.goDriverProfile.findUnique({
      where: { user_id: userId },
      select: { id: true, user_id: true },
    });
    if (!profile) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');

    const config = await this.incentives.getConfig();
    const timezone = config.timezone?.trim() || DEFAULT_TZ;
    const at = atIso ? new Date(atIso) : new Date();
    if (Number.isNaN(at.getTime())) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [{ field: 'at', messages: ['at must be a valid ISO date'] }],
      });
    }

    const window = resolvePeriodWindow(period, at, timezone);
    const previous = previousPeriodWindow(window);
    const walletConfig = await this.wallets.getConfig();

    const [currentEarn, previousEarn, rating, acceptance] = await Promise.all([
      this.earningsIn(profile.id, window, walletConfig),
      this.earningsIn(profile.id, previous, walletConfig),
      this.ratingsIn(profile.user_id, window),
      this.acceptanceIn(profile.id, window),
    ]);

    const customerRating100 =
      rating.avg == null ? null : round1(Math.min(Math.max((rating.avg / 5) * 100, 0), 100));
    const acceptanceRate = acceptance.rate;
    const score = this.simpleScore(
      customerRating100,
      acceptance.offered > 0 ? acceptanceRate : null,
      decimalToNumber(config.weight_rating),
      decimalToNumber(config.weight_acceptance),
    );

    const changePct =
      previousEarn.net > 0 ? round1(((currentEarn.net - previousEarn.net) / previousEarn.net) * 100) : null;

    return {
      period,
      timezone,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      currency: CURRENCY,
      score: {
        value: score,
        max: 100,
        customer_rating: customerRating100 ?? 0,
        acceptance_rate: acceptanceRate,
      },
      earnings: {
        gross: round2(currentEarn.gross),
        net: round2(currentEarn.net),
        fees: round2(currentEarn.fees),
        change_pct: changePct,
        label_key: period === 'day' ? 'day_total' : period === 'week' ? 'week_total' : 'month_total',
        series: this.buildSeries(period, window, currentEarn.points),
      },
      rating: {
        avg: rating.avg == null ? 0 : round1(rating.avg),
        count: rating.count,
        breakdown: rating.breakdown,
      },
      acceptance: {
        rate: acceptanceRate,
        accepted: acceptance.accepted,
        offered: acceptance.offered,
      },
    };
  }

  /**
   * Figma score card: rating (0–100) + acceptance only.
   * Weights from incentive config; unused metrics are dropped (weights renormalised).
   */
  private simpleScore(
    customerRating100: number | null,
    acceptanceRate: number | null,
    weightRating: number,
    weightAcceptance: number,
  ): number | null {
    let weighted = 0;
    let weightSum = 0;
    if (customerRating100 != null && weightRating > 0) {
      weighted += customerRating100 * weightRating;
      weightSum += weightRating;
    }
    if (acceptanceRate != null && weightAcceptance > 0) {
      weighted += acceptanceRate * weightAcceptance;
      weightSum += weightAcceptance;
    }
    if (weightSum <= 0) return null;
    return round1(Math.min(Math.max(weighted / weightSum, 0), 100));
  }

  private async earningsIn(
    driverId: string,
    window: PeriodWindow,
    walletConfig: { commission_base: GoCommissionBase; commission_percentage: Prisma.Decimal },
  ) {
    const rides = await this.prisma.goRide.findMany({
      where: {
        driver_id: driverId,
        status: GoRideStatus.COMPLETED,
        completed_at: { gte: window.from, lt: window.to },
      },
      select: {
        id: true,
        completed_at: true,
        gross_final_fare: true,
        customer_payable: true,
        discount_total: true,
      },
    });

    // Prefer ledger commission when present (actual deducted); else expected % (invoice math).
    const txs = rides.length
      ? await this.prisma.goDriverWalletTransaction.findMany({
          where: {
            driver_id: driverId,
            type: GoWalletTransactionType.COMMISSION_DEDUCTION,
            ride_id: { in: rides.map((r) => r.id) },
          },
          select: { ride_id: true, amount: true },
        })
      : [];
    const feeByRide = new Map(txs.map((t) => [t.ride_id!, decimalToNumber(t.amount)]));

    let gross = 0;
    let fees = 0;
    const points: { at: Date; net: number }[] = [];
    for (const ride of rides) {
      if (!ride.completed_at) continue;
      const discount = new Prisma.Decimal(ride.discount_total ?? 0);
      const base =
        discount.gt(0) || walletConfig.commission_base !== GoCommissionBase.CUSTOMER_PAYABLE
          ? new Prisma.Decimal(ride.gross_final_fare ?? 0)
          : new Prisma.Decimal(ride.customer_payable ?? 0);
      const baseN = decimalToNumber(base);
      const expected = decimalToNumber(
        this.wallets.expectedCommission(base, walletConfig.commission_percentage),
      );
      const fee = feeByRide.has(ride.id) ? feeByRide.get(ride.id)! : expected;
      const net = Math.max(0, baseN - fee);
      gross += baseN;
      fees += fee;
      points.push({ at: ride.completed_at, net });
    }
    return { gross, fees, net: Math.max(0, gross - fees), points };
  }

  private async ratingsIn(driverUserId: string, window: PeriodWindow) {
    const rows = await this.prisma.goRideRating.findMany({
      where: {
        to_user_id: driverUserId,
        direction: GoRatingDirection.CUSTOMER_TO_DRIVER,
        created_at: { gte: window.from, lt: window.to },
      },
      select: { stars: true },
    });
    const breakdown = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    let sum = 0;
    for (const r of rows) {
      const s = Math.min(5, Math.max(1, r.stars));
      breakdown[String(s) as keyof typeof breakdown] += 1;
      sum += s;
    }
    return {
      avg: rows.length ? sum / rows.length : null,
      count: rows.length,
      breakdown,
    };
  }

  private async acceptanceIn(driverId: string, window: PeriodWindow) {
    const rows = await this.prisma.goRideOffer.groupBy({
      by: ['status'],
      where: {
        driver_id: driverId,
        status: {
          in: [GoRideOfferStatus.ACCEPTED, GoRideOfferStatus.DECLINED, GoRideOfferStatus.EXPIRED],
        },
        offered_at: { gte: window.from, lt: window.to },
      },
      _count: { _all: true },
    });
    let accepted = 0;
    let offered = 0;
    for (const r of rows) {
      offered += r._count._all;
      if (r.status === GoRideOfferStatus.ACCEPTED) accepted += r._count._all;
    }
    return { accepted, offered, rate: pct(accepted, offered) };
  }

  private buildSeries(
    period: StatsPeriod,
    window: PeriodWindow,
    points: { at: Date; net: number }[],
  ) {
    if (period === 'day') {
      const buckets = hourSeriesTemplate().map((h) => ({ ...h, amount: 0 }));
      for (const p of points) {
        const hour = Math.floor(minutesOfDay(p.at, window.timezone) / 60);
        if (hour >= 0 && hour < 24) buckets[hour].amount = round2(buckets[hour].amount + p.net);
      }
      return buckets.map(({ key, label_ar, label_en, amount }) => ({ key, label_ar, label_en, amount }));
    }
    if (period === 'week') {
      const template = weekSeriesTemplate(window.from, window.timezone);
      const byDay = new Map(template.map((t) => [t.day, { ...t, amount: 0 }]));
      for (const p of points) {
        const d = dayKey(p.at, window.timezone);
        const row = byDay.get(d);
        if (row) row.amount = round2(row.amount + p.net);
      }
      return template.map((t) => {
        const row = byDay.get(t.day)!;
        return { key: t.key, label_ar: t.label_ar, label_en: t.label_en, amount: row.amount };
      });
    }
    const template = monthSeriesTemplate(window.from, window.to, window.timezone);
    const byDay = new Map(template.map((t) => [t.day, { ...t, amount: 0 }]));
    for (const p of points) {
      const d = dayKey(p.at, window.timezone);
      const row = byDay.get(d);
      if (row) row.amount = round2(row.amount + p.net);
    }
    return template.map((t) => {
      const row = byDay.get(t.day)!;
      return { key: t.key, label_ar: t.label_ar, label_en: t.label_en, amount: row.amount };
    });
  }
}
