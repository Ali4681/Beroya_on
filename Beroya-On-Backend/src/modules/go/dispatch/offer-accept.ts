import { GoRideOfferStatus, GoRideStatus } from '@/generated/prisma/client';

/** First pending, unexpired offer on a still-searching ride wins the lock. */
export function offerCanBeAccepted(input: {
  status: GoRideOfferStatus;
  expiresAt: Date;
  now: Date;
  rideStatus: GoRideStatus;
}): boolean {
  return (
    input.status === GoRideOfferStatus.PENDING &&
    input.expiresAt > input.now &&
    input.rideStatus === GoRideStatus.SEARCHING
  );
}
