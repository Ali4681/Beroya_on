import { toH3Index } from '../src/modules/go/dispatch/h3.util';
import {
  GoAlertSeverity,
  GoComplaintPriority,
  GoComplaintStatus,
  GoDriverAvailability,
  GoOperationalAlertStatus,
  GoOperationalAlertType,
  GoPaymentMethod,
  GoPaymentStatus,
  GoRatingDirection,
  GoRideStatus,
  GoRideType,
  GoRole,
  GoWalletTransactionType,
  PrismaClient,
} from '../src/generated/prisma/client';
import { seedBookedRoute } from './seed-google-route';
import { ALL_BRANCHES, type BranchDef } from './seed-roster';

export type SeedBranchActivityInput = {
  branchIds: Record<string, string>;
  categoryId: string;
};

function offsetPoint(lat: number, lng: number, dLat: number, dLng: number) {
  return { lat: lat + dLat, lng: lng + dLng };
}

async function findCustomer(prisma: PrismaClient, phone: string) {
  const user = await prisma.user.findUnique({
    where: { phone_role: { phone, role: GoRole.CUSTOMER } },
    include: { customerProfile: true },
  });
  if (!user?.customerProfile) return null;
  return { userId: user.id, customerId: user.customerProfile.id, name: user.full_name ?? phone };
}

async function findDriver(prisma: PrismaClient, phone: string) {
  const user = await prisma.user.findUnique({
    where: { phone_role: { phone, role: GoRole.DRIVER } },
    include: { driverProfile: { include: { active_vehicle: true } } },
  });
  const profile = user?.driverProfile;
  if (!user || !profile) return null;
  return {
    userId: user.id,
    driverId: profile.id,
    vehicleId: profile.active_vehicle_id ?? profile.active_vehicle?.id ?? null,
    name: user.full_name ?? phone,
  };
}

async function upsertBranchRide(
  prisma: PrismaClient,
  input: {
    public_number: string;
    customer_id: string;
    driver_id: string | null;
    vehicle_id?: string | null;
    branch_id: string;
    ride_category_id: string;
    status: GoRideStatus;
    payment_method: GoPaymentMethod;
    payment_status?: GoPaymentStatus;
    pickup: { lat: number; lng: number; address: string };
    dropoff: { lat: number; lng: number; address: string };
    estimated_fare?: number;
    gross_final_fare?: number;
    customer_payable?: number;
    assigned_at?: Date | null;
    arrived_at?: Date | null;
    started_at?: Date | null;
    completed_at?: Date | null;
    cancelled_at?: Date | null;
  },
) {
  const route = await seedBookedRoute(input.pickup, input.dropoff);
  const data = {
    customer_id: input.customer_id,
    driver_id: input.driver_id,
    vehicle_id: input.vehicle_id ?? null,
    branch_id: input.branch_id,
    ride_category_id: input.ride_category_id,
    type: GoRideType.IMMEDIATE,
    status: input.status,
    payment_method: input.payment_method,
    pickup_lat: input.pickup.lat,
    pickup_lng: input.pickup.lng,
    pickup_address: input.pickup.address,
    original_destination_lat: input.dropoff.lat,
    original_destination_lng: input.dropoff.lng,
    original_destination_address: input.dropoff.address,
    estimated_distance_m: route.distance_m,
    estimated_duration_sec: route.duration_sec,
    estimated_fare: input.estimated_fare ?? 3500,
    estimated_route_polyline: route.encoded_polyline,
    estimated_route_source: route.source,
    estimated_route_summary: route.summary || `${input.pickup.address} → ${input.dropoff.address}`,
    actual_distance_m: input.completed_at ? route.distance_m : null,
    actual_duration_sec: input.completed_at ? route.duration_sec : null,
    actual_start_lat: input.started_at ? input.pickup.lat : null,
    actual_start_lng: input.started_at ? input.pickup.lng : null,
    actual_dropoff_lat: input.completed_at ? input.dropoff.lat : null,
    actual_dropoff_lng: input.completed_at ? input.dropoff.lng : null,
    gross_final_fare: input.gross_final_fare ?? null,
    customer_payable: input.customer_payable ?? null,
    payment_status: input.payment_status ?? GoPaymentStatus.PENDING,
    assigned_at: input.assigned_at ?? null,
    arrived_at: input.arrived_at ?? null,
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? null,
    cancelled_at: input.cancelled_at ?? null,
  };
  return prisma.goRide.upsert({
    where: { public_number: input.public_number },
    update: data,
    create: { public_number: input.public_number, ...data },
  });
}

async function ensureAlertForRide(
  prisma: PrismaClient,
  rideId: string,
  branchId: string,
  type: GoOperationalAlertType,
) {
  const found = await prisma.goOperationalAlert.findFirst({ where: { ride_id: rideId, type } });
  if (found) {
    await prisma.goOperationalAlert.update({
      where: { id: found.id },
      data: { status: GoOperationalAlertStatus.OPEN, severity: GoAlertSeverity.WARNING, branch_id: branchId },
    });
    return;
  }
  await prisma.goOperationalAlert.create({
    data: {
      ride_id: rideId,
      branch_id: branchId,
      type,
      status: GoOperationalAlertStatus.OPEN,
      severity: GoAlertSeverity.WARNING,
      metadata: { source: 'seed-branch-activity' },
    },
  });
}

async function ensureComplaintForRide(
  prisma: PrismaClient,
  input: {
    rideId: string;
    customerId: string;
    driverId: string;
    branchId: string;
    notes: string;
  },
) {
  const reason = 'SEED_BRANCH_FARE';
  const found = await prisma.goComplaint.findFirst({ where: { ride_id: input.rideId, reason_code: reason } });
  const data = {
    priority: GoComplaintPriority.NORMAL,
    status: GoComplaintStatus.OPEN,
    notes: input.notes,
    submitted_during_ride: false,
  };
  if (found) {
    await prisma.goComplaint.update({ where: { id: found.id }, data });
    return;
  }
  await prisma.goComplaint.create({
    data: {
      ride_id: input.rideId,
      customer_id: input.customerId,
      driver_id: input.driverId,
      branch_id: input.branchId,
      reason_code: reason,
      ...data,
    },
  });
}

async function ensureCustomerTopUp(
  prisma: PrismaClient,
  customerId: string,
  actorId: string | null,
  reason: string,
  amount: number,
) {
  const wallet = await prisma.goCustomerWallet.upsert({
    where: { customer_id: customerId },
    update: {},
    create: { customer_id: customerId, balance: amount },
  });
  const existing = await prisma.goCustomerWalletTransaction.findFirst({ where: { reason } });
  if (existing) return;
  const before = Number(wallet.balance);
  const after = Math.max(before, amount);
  if (after !== before) {
    await prisma.goCustomerWallet.update({ where: { id: wallet.id }, data: { balance: after } });
  }
  await prisma.goCustomerWalletTransaction.create({
    data: {
      wallet_id: wallet.id,
      customer_id: customerId,
      type: GoWalletTransactionType.TOP_UP,
      amount,
      balance_before: before,
      balance_after: after,
      reason,
      created_by_id: actorId,
    },
  });
}

async function seedOneBranch(
  prisma: PrismaClient,
  branch: BranchDef,
  branchId: string,
  categoryId: string,
) {
  const c1 = await findCustomer(prisma, `+963911${branch.idx}01`);
  const c2 = await findCustomer(prisma, `+963911${branch.idx}02`);
  const d1 = await findDriver(prisma, `+963922${branch.idx}01`);
  const d2 = await findDriver(prisma, `+963922${branch.idx}02`);
  const d3 = await findDriver(prisma, `+963922${branch.idx}03`);
  if (!c1 || !c2 || !d1 || !d2 || !d3) {
    console.warn(`Branch activity skip ${branch.code}: missing roster people`);
    return { rides: 0 };
  }

  const walletStaff = await prisma.user.findFirst({
    where: { role: GoRole.WALLET_OPERATOR, branch_id: branchId },
  });

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Offsets are wide on both axes so Google returns a street-following path (not a near-straight corridor).
  const pickup = {
    lat: branch.lat,
    lng: branch.lng,
    address: `مركز ${branch.name_ar}`,
  };
  const dropoff = {
    ...offsetPoint(branch.lat, branch.lng, 0.018, 0.024),
    address: `وجهة ${branch.name_ar}`,
  };
  const pickup2 = {
    ...offsetPoint(branch.lat, branch.lng, -0.014, 0.018),
    address: `التقاط ${branch.name_ar}`,
  };
  const dropoff2 = {
    ...offsetPoint(branch.lat, branch.lng, 0.012, -0.02),
    address: `إنزال ${branch.name_ar}`,
  };

  const pn = (n: string) => `SEED-B${branch.idx}-${n}`;

  const completed = await upsertBranchRide(prisma, {
    public_number: pn('01'),
    customer_id: c1.customerId,
    driver_id: d1.driverId,
    vehicle_id: d1.vehicleId,
    branch_id: branchId,
    ride_category_id: categoryId,
    status: GoRideStatus.COMPLETED,
    payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.COLLECTED,
    pickup,
    dropoff,
    estimated_fare: 4200,
    gross_final_fare: 4500,
    customer_payable: 4500,
    assigned_at: yesterday,
    arrived_at: yesterday,
    started_at: yesterday,
    completed_at: hourAgo,
  });

  await prisma.goRideRating.upsert({
    where: { ride_id_direction: { ride_id: completed.id, direction: GoRatingDirection.CUSTOMER_TO_DRIVER } },
    update: { stars: 5 },
    create: {
      ride_id: completed.id,
      direction: GoRatingDirection.CUSTOMER_TO_DRIVER,
      from_user_id: c1.userId,
      to_user_id: d1.userId,
      stars: 5,
      notes: `تقييم seed — ${branch.name_ar}`,
    },
  });
  await prisma.goRideRating.upsert({
    where: { ride_id_direction: { ride_id: completed.id, direction: GoRatingDirection.DRIVER_TO_CUSTOMER } },
    update: { stars: 5 },
    create: {
      ride_id: completed.id,
      direction: GoRatingDirection.DRIVER_TO_CUSTOMER,
      from_user_id: d1.userId,
      to_user_id: c1.userId,
      stars: 5,
    },
  });

  const cancelled = await upsertBranchRide(prisma, {
    public_number: pn('02'),
    customer_id: c2.customerId,
    driver_id: d2.driverId,
    vehicle_id: d2.vehicleId,
    branch_id: branchId,
    ride_category_id: categoryId,
    status: GoRideStatus.CANCELLED_BY_CUSTOMER,
    payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.WAIVED,
    pickup: pickup2,
    dropoff: dropoff2,
    estimated_fare: 3800,
    assigned_at: twoHoursAgo,
    cancelled_at: hourAgo,
  });

  await upsertBranchRide(prisma, {
    public_number: pn('03'),
    customer_id: c1.customerId,
    driver_id: null,
    branch_id: branchId,
    ride_category_id: categoryId,
    status: GoRideStatus.SEARCHING,
    payment_method: GoPaymentMethod.WALLET,
    payment_status: GoPaymentStatus.PENDING,
    pickup: pickup2,
    dropoff,
    estimated_fare: 3600,
  });

  await upsertBranchRide(prisma, {
    public_number: pn('04'),
    customer_id: c2.customerId,
    driver_id: d2.driverId,
    vehicle_id: d2.vehicleId,
    branch_id: branchId,
    ride_category_id: categoryId,
    status: GoRideStatus.DRIVER_EN_ROUTE,
    payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.CASH_EXPECTED,
    pickup,
    dropoff: dropoff2,
    estimated_fare: 4000,
    assigned_at: hourAgo,
  });

  const inProgress = await upsertBranchRide(prisma, {
    public_number: pn('05'),
    customer_id: c1.customerId,
    driver_id: d3.driverId,
    vehicle_id: d3.vehicleId,
    branch_id: branchId,
    ride_category_id: categoryId,
    status: GoRideStatus.IN_PROGRESS,
    payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.CASH_EXPECTED,
    pickup: pickup2,
    dropoff,
    estimated_fare: 4100,
    assigned_at: twoHoursAgo,
    arrived_at: hourAgo,
    started_at: hourAgo,
  });

  await ensureAlertForRide(prisma, inProgress.id, branchId, GoOperationalAlertType.LONG_STOP);
  await ensureComplaintForRide(prisma, {
    rideId: cancelled.id,
    customerId: c2.customerId,
    driverId: d2.driverId,
    branchId,
    notes: `شكوى تجريبية — فرع ${branch.name_ar}`,
  });

  await ensureCustomerTopUp(
    prisma,
    c1.customerId,
    walletStaff?.id ?? null,
    `seed-branch-topup-${branch.code}`,
    15000,
  );

  const mid = offsetPoint(branch.lat, branch.lng, 0.003, 0.002);
  await prisma.goDriverState.upsert({
    where: { driver_id: d1.driverId },
    update: {
      availability: GoDriverAvailability.ONLINE,
      last_lat: mid.lat,
      last_lng: mid.lng,
      h3_index: toH3Index(mid.lat, mid.lng),
      last_location_at: now,
      current_ride_id: null,
      next_ride_id: null,
    },
    create: {
      driver_id: d1.driverId,
      availability: GoDriverAvailability.ONLINE,
      last_lat: mid.lat,
      last_lng: mid.lng,
      h3_index: toH3Index(mid.lat, mid.lng),
      last_location_at: now,
    },
  });
  await prisma.goDriverState.upsert({
    where: { driver_id: d2.driverId },
    update: {
      availability: GoDriverAvailability.ONLINE,
      last_lat: pickup.lat,
      last_lng: pickup.lng,
      h3_index: toH3Index(pickup.lat, pickup.lng),
      last_location_at: now,
      current_ride_id: null,
      next_ride_id: null,
    },
    create: {
      driver_id: d2.driverId,
      availability: GoDriverAvailability.ONLINE,
      last_lat: pickup.lat,
      last_lng: pickup.lng,
      h3_index: toH3Index(pickup.lat, pickup.lng),
      last_location_at: now,
    },
  });
  await prisma.goDriverState.upsert({
    where: { driver_id: d3.driverId },
    update: {
      availability: GoDriverAvailability.BUSY,
      last_lat: pickup2.lat,
      last_lng: pickup2.lng,
      h3_index: toH3Index(pickup2.lat, pickup2.lng),
      last_location_at: now,
      current_ride_id: inProgress.id,
      next_ride_id: null,
    },
    create: {
      driver_id: d3.driverId,
      availability: GoDriverAvailability.BUSY,
      last_lat: pickup2.lat,
      last_lng: pickup2.lng,
      h3_index: toH3Index(pickup2.lat, pickup2.lng),
      last_location_at: now,
      current_ride_id: inProgress.id,
    },
  });

  await prisma.goDriverPassport.updateMany({
    where: { driver_id: d1.driverId },
    data: { completed_rides: { increment: 1 } },
  });

  return { rides: 5 };
}

/** Light operational rows for every governorate roster (desk demos per branch). */
export async function seedAllBranchActivity(prisma: PrismaClient, input: SeedBranchActivityInput) {
  let branches = 0;
  let rides = 0;
  for (const branch of ALL_BRANCHES) {
    const branchId = input.branchIds[branch.code];
    if (!branchId) continue;
    const result = await seedOneBranch(prisma, branch, branchId, input.categoryId);
    if (result.rides > 0) {
      branches += 1;
      rides += result.rides;
    }
  }
  console.log(`Branch activity: ${rides} rides across ${branches} governorates.`);
  return { branches, rides };
}
