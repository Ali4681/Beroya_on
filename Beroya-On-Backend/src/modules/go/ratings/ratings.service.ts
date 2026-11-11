import { Injectable } from '@nestjs/common';
import {
  GoPassportScoreEventType,
  GoRatingDirection,
  GoRideStatus,
  Prisma,
} from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { PassportService } from '../passport/passport.service';
import type { SubmitRideRatingDto } from './dto/ratings.dto';

const ratingInclude = {
  reasons: { select: { reason_code: true } },
} satisfies Prisma.GoRideRatingInclude;

@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passport: PassportService,
  ) {}

  /** Ticket §11.1 — customer rates driver. */
  async rateByCustomer(customerUserId: string, rideId: string, dto: SubmitRideRatingDto) {
    const ride = await this.prisma.goRide.findFirst({
      where: {
        id: rideId,
        status: GoRideStatus.COMPLETED,
        customer: { user_id: customerUserId },
      },
      include: {
        customer: { select: { user_id: true } },
        driver: { select: { user_id: true } },
      },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND, 'Completed ride not found');
    if (!ride.driver_id || !ride.driver) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Ride has no driver to rate');
    }

    return this.persistRating({
      rideId,
      direction: GoRatingDirection.CUSTOMER_TO_DRIVER,
      fromUserId: customerUserId,
      toUserId: ride.driver.user_id,
      dto,
    });
  }

  /** Ticket §11.2 + §23.5 — driver rates customer (stars → passport). */
  async rateByDriver(driverUserId: string, rideId: string, dto: SubmitRideRatingDto) {
    const ride = await this.prisma.goRide.findFirst({
      where: {
        id: rideId,
        status: GoRideStatus.COMPLETED,
        driver: { user_id: driverUserId },
      },
      include: {
        customer: { select: { id: true, user_id: true } },
        driver: { select: { user_id: true } },
      },
    });
    if (!ride) throw new GoException(GoErrorCode.RIDE_NOT_FOUND, 'Completed ride not found');

    const rating = await this.persistRating({
      rideId,
      direction: GoRatingDirection.DRIVER_TO_CUSTOMER,
      fromUserId: driverUserId,
      toUserId: ride.customer.user_id,
      dto,
    });

    const eventType = {
      1: GoPassportScoreEventType.DRIVER_RATING_1,
      2: GoPassportScoreEventType.DRIVER_RATING_2,
      3: GoPassportScoreEventType.DRIVER_RATING_3,
      4: GoPassportScoreEventType.DRIVER_RATING_4,
      5: GoPassportScoreEventType.DRIVER_RATING_5,
    }[dto.stars]!;

    await this.passport.applyEvent({
      customerId: ride.customer.id,
      eventType,
      rideId,
      customerUserId: ride.customer.user_id,
      metadata: { stars: dto.stars },
    });

    return rating;
  }

  /**
   * Ticket §11.3 — own rating only (never the counterparty's).
   * Used when attaching optional `my_rating` to ride detail.
   */
  async myRatingFor(userId: string, rideId: string, as: 'customer' | 'driver') {
    const direction =
      as === 'customer' ? GoRatingDirection.CUSTOMER_TO_DRIVER : GoRatingDirection.DRIVER_TO_CUSTOMER;
    const row = await this.prisma.goRideRating.findUnique({
      where: { ride_id_direction: { ride_id: rideId, direction } },
      include: ratingInclude,
    });
    if (!row || row.from_user_id !== userId) return null;
    return this.toPublic(row);
  }

  private async persistRating(input: {
    rideId: string;
    direction: GoRatingDirection;
    fromUserId: string;
    toUserId: string;
    dto: SubmitRideRatingDto;
  }) {
    const existing = await this.prisma.goRideRating.findUnique({
      where: { ride_id_direction: { ride_id: input.rideId, direction: input.direction } },
    });
    if (existing) {
      throw new GoException(GoErrorCode.CONFLICT, 'Ride already rated in this direction');
    }

    try {
      const created = await this.prisma.goRideRating.create({
        data: {
          ride_id: input.rideId,
          direction: input.direction,
          from_user_id: input.fromUserId,
          to_user_id: input.toUserId,
          stars: input.dto.stars,
          notes: input.dto.notes?.trim() ? input.dto.notes.trim() : null,
          reasons: input.dto.reasons?.length
            ? { create: input.dto.reasons.map((reason_code) => ({ reason_code })) }
            : undefined,
        },
        include: ratingInclude,
      });
      return this.toPublic(created);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new GoException(GoErrorCode.CONFLICT, 'Ride already rated in this direction');
      }
      throw e;
    }
  }

  private toPublic(row: {
    id: string;
    ride_id: string;
    direction: GoRatingDirection;
    stars: number;
    notes: string | null;
    created_at: Date;
    reasons: { reason_code: string }[];
  }) {
    return {
      id: row.id,
      ride_id: row.ride_id,
      direction: row.direction,
      stars: row.stars,
      notes: row.notes,
      reasons: row.reasons.map((r) => r.reason_code),
      created_at: row.created_at,
    };
  }
}
