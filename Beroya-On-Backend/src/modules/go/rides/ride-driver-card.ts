import { GoRatingDirection, Prisma } from '@/generated/prisma/client';
import type { PrismaService } from '../../../infra/prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface VehicleSnapshot {
  plate_number: string;
  make: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
}

export function vehicleSnapshotOf(vehicle: VehicleSnapshot): VehicleSnapshot {
  return {
    plate_number: vehicle.plate_number,
    make: vehicle.make,
    model: vehicle.model,
    color: vehicle.color,
    year: vehicle.year,
  };
}

/** Ride columns to set at assignment; empty when the driver has no active vehicle. */
export async function assignedVehicleData(db: Db, driverId: string) {
  const driver = await db.goDriverProfile.findUnique({
    where: { id: driverId },
    select: { active_vehicle: true },
  });
  const vehicle = driver?.active_vehicle;
  if (!vehicle) return {};
  return {
    vehicle_id: vehicle.id,
    vehicle_snapshot: vehicleSnapshotOf(vehicle) as unknown as Prisma.InputJsonValue,
  };
}

export function rideVehicle(snapshot: Prisma.JsonValue | null): VehicleSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const s = snapshot as Record<string, unknown>;
  if (typeof s.plate_number !== 'string') return null;
  return {
    plate_number: s.plate_number,
    make: typeof s.make === 'string' ? s.make : null,
    model: typeof s.model === 'string' ? s.model : null,
    color: typeof s.color === 'string' ? s.color : null,
    year: typeof s.year === 'number' ? s.year : null,
  };
}

/** Average of customer → driver stars, one decimal; null when the driver has no ratings yet. */
export async function driverRating(db: Db, driverUserId: string) {
  const agg = await db.goRideRating.aggregate({
    where: { to_user_id: driverUserId, direction: GoRatingDirection.CUSTOMER_TO_DRIVER },
    _avg: { stars: true },
    _count: { _all: true },
  });
  const avg = agg._avg.stars;
  return {
    rating_avg: avg == null ? null : Math.round(avg * 10) / 10,
    rating_count: agg._count._all,
  };
}

/** Served only to the customer of this ride; versioned so a new photo is refetched. */
export function driverAvatarUrl(rideId: string, driver: { avatar_key: string | null; updated_at: Date }) {
  if (!driver.avatar_key) return null;
  return `/api/v1/go/customer/rides/${rideId}/driver-avatar?v=${driver.updated_at.getTime()}`;
}

export const customerDriverSelect = {
  id: true,
  user_id: true,
  avatar_key: true,
  updated_at: true,
  user: { select: { full_name: true, phone: true } },
} satisfies Prisma.GoDriverProfileSelect;

type CustomerDriverRow = Prisma.GoDriverProfileGetPayload<{ select: typeof customerDriverSelect }>;

/** Driver block of a customer ride: { id, user_id, user{full_name,phone} } plus rating and photo. */
export async function driverCard(db: Db, rideId: string, driver: CustomerDriverRow) {
  const { avatar_key: _key, updated_at: _updated, ...base } = driver;
  const phone = driver.user.phone?.trim() || null;
  return {
    ...base,
    user: { full_name: driver.user.full_name, phone },
    ...(await driverRating(db, driver.user_id)),
    avatar_url: driverAvatarUrl(rideId, driver),
    /** tel: URI for the Call button after assignment; null when the driver has no phone. */
    call_url: phone ? `tel:${phone}` : null,
  };
}
