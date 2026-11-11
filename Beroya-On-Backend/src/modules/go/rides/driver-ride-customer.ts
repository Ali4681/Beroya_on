import { GoPaymentMethod, GoRatingDirection, Prisma } from '@/generated/prisma/client';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { paymentMethodLabelAr } from './driver-invoice';
import { RideDefaults } from './ride-rules';

type Db = PrismaService | Prisma.TransactionClient;

export const driverRideCustomerSelect = {
  id: true,
  user_id: true,
  avatar_key: true,
  updated_at: true,
  user: { select: { full_name: true, phone: true } },
} satisfies Prisma.GoCustomerProfileSelect;

export type DriverRideCustomerRow = Prisma.GoCustomerProfileGetPayload<{ select: typeof driverRideCustomerSelect }>;

/** Average of driver → customer stars; null avg when none. */
export async function customerRating(db: Db, customerUserId: string) {
  const agg = await db.goRideRating.aggregate({
    where: { to_user_id: customerUserId, direction: GoRatingDirection.DRIVER_TO_CUSTOMER },
    _avg: { stars: true },
    _count: { _all: true },
  });
  const avg = agg._avg.stars;
  return {
    rating_avg: avg == null ? null : Math.round(avg * 10) / 10,
    rating_count: agg._count._all,
  };
}

/** Ride-scoped; driver must be assigned or hold a pending offer. */
export function customerAvatarUrl(rideId: string, customer: { avatar_key: string | null; updated_at: Date }) {
  if (!customer.avatar_key) return null;
  return `/api/v1/go/driver/rides/${rideId}/customer-avatar?v=${customer.updated_at.getTime()}`;
}

export type OfferCustomerCard = {
  full_name: string | null;
  avatar_url: string | null;
  rating_avg: number | null;
  rating_count: number;
};

/** Pre-accept card — name + rating + photo; phone only after assignment. */
export async function offerCustomerCard(
  db: Db,
  rideId: string,
  customer: DriverRideCustomerRow | null | undefined,
): Promise<OfferCustomerCard | null> {
  if (!customer) return null;
  return {
    full_name: customer.user.full_name,
    avatar_url: customerAvatarUrl(rideId, customer),
    ...(await customerRating(db, customer.user_id)),
  };
}

export type ActiveCustomerCard = {
  full_name: string | null;
  phone: string | null;
  call_url: string | null;
  avatar_url: string | null;
  rating_avg: number | null;
  rating_count: number;
};

/** Post-accept card for active / arrive / start. */
export async function activeCustomerCard(
  db: Db,
  rideId: string,
  customer: DriverRideCustomerRow | null | undefined,
): Promise<ActiveCustomerCard | null> {
  if (!customer) return null;
  const phone = customer.user.phone?.trim() || null;
  return {
    full_name: customer.user.full_name,
    phone,
    call_url: phone ? `tel:${phone}` : null,
    avatar_url: customerAvatarUrl(rideId, customer),
    ...(await customerRating(db, customer.user_id)),
  };
}

/** Invoice / rate-sheet header — name + photo only (Figma تقييم الزبون). */
export function invoiceCustomerCard(
  rideId: string,
  customer: DriverRideCustomerRow | null | undefined,
): { full_name: string | null; avatar_url: string | null } | null {
  if (!customer) return null;
  return {
    full_name: customer.user.full_name,
    avatar_url: customerAvatarUrl(rideId, customer),
  };
}

export function waitingFields(arrivedAt: Date | null | undefined) {
  const free = RideDefaults.FREE_WAITING_SEC;
  const noShowAfter = RideDefaults.NO_SHOW_AFTER_ARRIVED_SEC;
  return {
    free_waiting_sec: free,
    no_show_after_arrived_sec: noShowAfter,
    /** ISO when no-show becomes allowed; null until ARRIVED. Timer starts at arrived_at. */
    no_show_eligible_at: arrivedAt
      ? new Date(arrivedAt.getTime() + noShowAfter * 1000).toISOString()
      : null,
    /** After this instant, waiting beyond free window is billable (fare / driver earnings). */
    billable_waiting_starts_at: arrivedAt
      ? new Date(arrivedAt.getTime() + free * 1000).toISOString()
      : null,
  };
}

/** Pickup wait breakdown for ERP / invoices (free 2 min, then billable). */
export function pickupWaitBreakdown(ride: {
  arrived_at?: Date | null;
  started_at?: Date | null;
  billable_waiting_sec?: number | null;
  status?: string;
}) {
  const free = RideDefaults.FREE_WAITING_SEC;
  const arrivedAt = ride.arrived_at ?? null;
  const startedAt = ride.started_at ?? null;
  let total_wait_sec: number | null = null;
  if (arrivedAt && startedAt) {
    total_wait_sec = Math.max(0, Math.round((startedAt.getTime() - arrivedAt.getTime()) / 1000));
  } else if (arrivedAt && !startedAt) {
    total_wait_sec = Math.max(0, Math.round((Date.now() - arrivedAt.getTime()) / 1000));
  }
  const billable =
    ride.billable_waiting_sec != null && ride.billable_waiting_sec > 0
      ? ride.billable_waiting_sec
      : total_wait_sec != null
        ? Math.max(0, total_wait_sec - free)
        : null;
  return {
    free_waiting_sec: free,
    total_wait_sec,
    billable_waiting_sec: billable,
    billable_waiting_starts_at: arrivedAt
      ? new Date(arrivedAt.getTime() + free * 1000).toISOString()
      : null,
  };
}

export function paymentFields(method: GoPaymentMethod) {
  return {
    payment_method: method,
    payment_method_label_ar: paymentMethodLabelAr(method),
  };
}
