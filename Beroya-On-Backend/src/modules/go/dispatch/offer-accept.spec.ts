import { GoRideOfferStatus, GoRideStatus } from '@/generated/prisma/client';
import { offerCanBeAccepted } from './offer-accept';

const now = new Date('2026-10-05T12:00:00Z');

describe('offer acceptance', () => {
  it('accepts a pending offer on a searching ride before expiry', () => {
    expect(
      offerCanBeAccepted({
        status: GoRideOfferStatus.PENDING,
        expiresAt: new Date('2026-10-05T12:00:05Z'),
        now,
        rideStatus: GoRideStatus.SEARCHING,
      }),
    ).toBe(true);
  });

  it('rejects expired, taken, or already-assigned offers', () => {
    expect(
      offerCanBeAccepted({
        status: GoRideOfferStatus.PENDING,
        expiresAt: now,
        now,
        rideStatus: GoRideStatus.SEARCHING,
      }),
    ).toBe(false);
    expect(
      offerCanBeAccepted({
        status: GoRideOfferStatus.ACCEPTED,
        expiresAt: new Date('2026-10-05T12:00:05Z'),
        now,
        rideStatus: GoRideStatus.SEARCHING,
      }),
    ).toBe(false);
    expect(
      offerCanBeAccepted({
        status: GoRideOfferStatus.PENDING,
        expiresAt: new Date('2026-10-05T12:00:05Z'),
        now,
        rideStatus: GoRideStatus.DRIVER_ASSIGNED,
      }),
    ).toBe(false);
  });
});
