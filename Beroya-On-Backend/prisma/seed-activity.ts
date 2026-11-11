import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createHash } from "crypto";
import { toH3Index } from "../src/modules/go/dispatch/h3.util";
import { seedBookedRoute } from "./seed-google-route";
import { seedIncentives } from "./seed-incentives";
import {
  GoBookingFor,
  GoCaseStatus,
  GoCaseType,
  GoAccidentSeverity,
  GoComplaintPriority,
  GoComplaintStatus,
  GoCompensationBearer,
  GoCompensationType,
  GoDevicePlatform,
  GoDiscountAudience,
  GoDiscountCodeStatus,
  GoDocumentType,
  GoDriverAvailability,
  GoDriverGender,
  GoDriverEntitlementStatus,
  GoEmergencyRecordingStatus,
  GoEmergencyStatus,
  GoIdempotencyStatus,
  GoAlertSeverity,
  GoOperationalAlertStatus,
  GoOperationalAlertType,
  GoOtpPurpose,
  GoPassportRewardGrantStatus,
  GoPassportRewardType,
  GoPassportScoreEventType,
  GoFareStackDecision,
  GoPaymentMethod,
  GoPaymentStatus,
  GoRatingDirection,
  GoRideDiscountReservationStatus,
  GoRideOfferStatus,
  GoRideRequirementType,
  GoRideStatus,
  GoRideType,
  GoRole,
  GoWalletTransactionType,
  Prisma,
  PrismaClient,
} from '../src/generated/prisma/client';

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

loadEnv({ path: resolve(__dirname, "../.env") });

export type SeedActivityInput = {
  branchId: string;
  categoryId: string;
  customerId: string;
  customerUserId: string;
  driverId: string;
  driverUserId: string;
  vehicleId: string;
};

const PICKUP = { lat: 33.5138, lng: 36.2765, address: 'المرجة، دمشق' };
const DROPOFF = { lat: 33.522, lng: 36.31, address: 'أبو رمانة، دمشق' };

export async function seedActivity(prisma: PrismaClient, input: SeedActivityInput) {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@beroyaon.com' } });
  const supervisor = await prisma.user.findUniqueOrThrow({ where: { email: 'cssup.dam@beroyaon.com' } });
  const silver = await prisma.goCustomerPassportLevel.findUniqueOrThrow({ where: { level_order: 2 } });
  const wallet = await prisma.goDriverWallet.findUniqueOrThrow({ where: { driver_id: input.driverId } });

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const docsExpire = new Date(now);
  docsExpire.setFullYear(docsExpire.getFullYear() + 2);

  for (const type of [GoDocumentType.INSURANCE, GoDocumentType.IDENTITY]) {
    await prisma.goDriverDocument.upsert({
      where: { driver_id_type: { driver_id: input.driverId, type } },
      update: { expires_at: docsExpire, is_valid: true },
      create: { driver_id: input.driverId, type, expires_at: docsExpire, is_valid: true },
    });
  }

  await prisma.goVehicleCapability.upsert({
    where: { vehicle_id_type: { vehicle_id: input.vehicleId, type: GoRideRequirementType.ACCESSIBILITY } },
    update: {},
    create: { vehicle_id: input.vehicleId, type: GoRideRequirementType.ACCESSIBILITY },
  });

  await prisma.goDriverState.upsert({
    where: { driver_id: input.driverId },
    update: {
      availability: GoDriverAvailability.ONLINE,
      last_lat: PICKUP.lat,
      last_lng: PICKUP.lng,
      h3_index: toH3Index(PICKUP.lat, PICKUP.lng),
      last_location_at: now,
      current_ride_id: null,
      next_ride_id: null,
    },
    create: {
      driver_id: input.driverId,
      availability: GoDriverAvailability.ONLINE,
      last_lat: PICKUP.lat,
      last_lng: PICKUP.lng,
      h3_index: toH3Index(PICKUP.lat, PICKUP.lng),
      last_location_at: now,
    },
  });

  const completed = await upsertRide(prisma, {
    public_number: 'SEED-1001',
    customer_id: input.customerId,
    driver_id: input.driverId,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.IMMEDIATE,
    status: GoRideStatus.COMPLETED,
    payment_method: GoPaymentMethod.CASH,
    pickup_lat: PICKUP.lat,
    pickup_lng: PICKUP.lng,
    pickup_address: PICKUP.address,
    original_destination_lat: DROPOFF.lat,
    original_destination_lng: DROPOFF.lng,
    original_destination_address: DROPOFF.address,
    actual_dropoff_lat: DROPOFF.lat,
    actual_dropoff_lng: DROPOFF.lng,
    estimated_distance_m: 4200,
    estimated_duration_sec: 900,
    estimated_fare: 4500,
    actual_distance_m: 4500,
    actual_duration_sec: 1020,
    gross_final_fare: 4800,
    discount_total: 480,
    compensation_total: 500,
    customer_payable: 3820,
    payment_status: GoPaymentStatus.COLLECTED,
    fare_stack_decision: GoFareStackDecision.BOTH,
    assigned_at: yesterday,
    started_at: yesterday,
    completed_at: hourAgo,
  });

  const active = await upsertRide(prisma, {
    public_number: 'SEED-1002',
    customer_id: input.customerId,
    driver_id: input.driverId,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.IMMEDIATE,
    status: GoRideStatus.COMPLETED,
    payment_method: GoPaymentMethod.CASH,
    pickup_lat: PICKUP.lat,
    pickup_lng: PICKUP.lng,
    pickup_address: PICKUP.address,
    original_destination_lat: DROPOFF.lat,
    original_destination_lng: DROPOFF.lng,
    original_destination_address: DROPOFF.address,
    actual_dropoff_lat: DROPOFF.lat,
    actual_dropoff_lng: DROPOFF.lng,
    estimated_distance_m: 3100,
    estimated_duration_sec: 720,
    estimated_fare: 3800,
    actual_distance_m: 3200,
    actual_duration_sec: 740,
    gross_final_fare: 3900,
    customer_payable: 3900,
    payment_status: GoPaymentStatus.COLLECTED,
    assigned_at: yesterday,
    arrived_at: yesterday,
    started_at: yesterday,
    completed_at: hourAgo,
  });

  await upsertRide(prisma, {
    public_number: 'SEED-1003',
    customer_id: input.customerId,
    driver_id: null,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.IMMEDIATE,
    status: GoRideStatus.SEARCHING,
    payment_method: GoPaymentMethod.SHAM_CASH,
    booking_for: GoBookingFor.OTHER,
    other_passenger_name: 'ضيف تجريبي',
    other_passenger_phone: '+963944444444',
    pickup_lat: 33.505,
    pickup_lng: 36.29,
    pickup_address: 'البرامكة، دمشق',
    original_destination_lat: 33.53,
    original_destination_lng: 36.25,
    original_destination_address: 'المزة، دمشق',
    estimated_distance_m: 6000,
    estimated_duration_sec: 1200,
    estimated_fare: 5200,
    payment_status: GoPaymentStatus.PENDING,
  });

  await upsertRide(prisma, {
    public_number: 'SEED-1004',
    customer_id: input.customerId,
    driver_id: null,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.SCHEDULED,
    status: GoRideStatus.SEARCHING,
    payment_method: GoPaymentMethod.CASH,
    scheduled_at: tomorrow,
    pickup_lat: PICKUP.lat,
    pickup_lng: PICKUP.lng,
    pickup_address: 'باب توما، دمشق',
    original_destination_lat: DROPOFF.lat,
    original_destination_lng: DROPOFF.lng,
    original_destination_address: 'الشعلان، دمشق',
    estimated_distance_m: 2800,
    estimated_duration_sec: 600,
    estimated_fare: 3200,
  });

  /** Formerly INTERRUPTED breakdown demo — completed so Demo Driver has no live ride. */
  const interrupted = await upsertRide(prisma, {
    public_number: 'SEED-1005',
    customer_id: input.customerId,
    driver_id: input.driverId,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.IMMEDIATE,
    status: GoRideStatus.COMPLETED,
    payment_method: GoPaymentMethod.CASH,
    pickup_lat: PICKUP.lat,
    pickup_lng: PICKUP.lng,
    pickup_address: PICKUP.address,
    original_destination_lat: DROPOFF.lat,
    original_destination_lng: DROPOFF.lng,
    original_destination_address: DROPOFF.address,
    actual_start_lat: PICKUP.lat,
    actual_start_lng: PICKUP.lng,
    actual_dropoff_lat: DROPOFF.lat,
    actual_dropoff_lng: DROPOFF.lng,
    estimated_distance_m: 4000,
    estimated_duration_sec: 900,
    estimated_fare: 4000,
    actual_distance_m: 4100,
    actual_duration_sec: 920,
    gross_final_fare: 4100,
    customer_payable: 4100,
    payment_status: GoPaymentStatus.COLLECTED,
    assigned_at: yesterday,
    arrived_at: yesterday,
    started_at: yesterday,
    completed_at: hourAgo,
  });

  /** Standalone searching ride (not a replacement — reassignment demo is SEED-BREAK-* below). */
  await upsertRide(prisma, {
    public_number: 'SEED-1006',
    customer_id: input.customerId,
    driver_id: null,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.IMMEDIATE,
    status: GoRideStatus.SEARCHING,
    payment_method: GoPaymentMethod.CASH,
    pickup_lat: 33.518,
    pickup_lng: 36.288,
    pickup_address: 'نقطة البدل، دمشق',
    original_destination_lat: DROPOFF.lat,
    original_destination_lng: DROPOFF.lng,
    original_destination_address: DROPOFF.address,
    estimated_fare: 2500,
  });

  const unrated = await upsertRide(prisma, {
    public_number: 'SEED-1007',
    customer_id: input.customerId,
    driver_id: input.driverId,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.IMMEDIATE,
    status: GoRideStatus.COMPLETED,
    payment_method: GoPaymentMethod.CASH,
    pickup_lat: 33.505,
    pickup_lng: 36.29,
    pickup_address: 'البرامكة، دمشق',
    original_destination_lat: DROPOFF.lat,
    original_destination_lng: DROPOFF.lng,
    original_destination_address: DROPOFF.address,
    actual_dropoff_lat: DROPOFF.lat,
    actual_dropoff_lng: DROPOFF.lng,
    estimated_distance_m: 3600,
    estimated_duration_sec: 780,
    estimated_fare: 3900,
    actual_distance_m: 3700,
    actual_duration_sec: 820,
    gross_final_fare: 4000,
    customer_payable: 4000,
    payment_status: GoPaymentStatus.COLLECTED,
    assigned_at: yesterday,
    arrived_at: yesterday,
    started_at: yesterday,
    completed_at: hourAgo,
  });
  // Re-seeding must leave this ride unrated and complaint-free for the customer app.
  await prisma.goRideRating.deleteMany({
    where: { ride_id: unrated.id, direction: GoRatingDirection.CUSTOMER_TO_DRIVER },
  });
  await prisma.goComplaint.deleteMany({ where: { ride_id: unrated.id } });

  // Was a pending offer for Demo Driver (+963922222222); now completed like the rest.
  const awaitingAccept = await upsertRide(prisma, {
    public_number: 'SEED-1008',
    customer_id: input.customerId,
    driver_id: input.driverId,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.IMMEDIATE,
    status: GoRideStatus.COMPLETED,
    payment_method: GoPaymentMethod.CASH,
    pickup_lat: 33.511,
    pickup_lng: 36.285,
    pickup_address: 'الشعلان، دمشق',
    original_destination_lat: 33.522,
    original_destination_lng: 36.31,
    original_destination_address: 'أبو رمانة، دمشق',
    actual_dropoff_lat: 33.522,
    actual_dropoff_lng: 36.31,
    estimated_distance_m: 2800,
    estimated_duration_sec: 600,
    estimated_fare: 3500,
    actual_distance_m: 2900,
    actual_duration_sec: 620,
    gross_final_fare: 3600,
    customer_payable: 3600,
    payment_status: GoPaymentStatus.COLLECTED,
    assigned_at: yesterday,
    arrived_at: yesterday,
    started_at: yesterday,
    completed_at: hourAgo,
  });

  await prisma.goRideStop.upsert({
    where: { ride_id_sequence: { ride_id: completed.id, sequence: 1 } },
    update: { latitude: 33.516, longitude: 36.29, address: 'محطة وسطية', arrived_at: yesterday, departed_at: yesterday },
    create: {
      ride_id: completed.id,
      sequence: 1,
      latitude: 33.516,
      longitude: 36.29,
      address: 'محطة وسطية',
      arrived_at: yesterday,
      departed_at: yesterday,
      waiting_seconds: 120,
    },
  });

  await prisma.goRideRequirement.upsert({
    where: { ride_id_type: { ride_id: completed.id, type: GoRideRequirementType.CHILD_SEAT } },
    update: {},
    create: { ride_id: completed.id, type: GoRideRequirementType.CHILD_SEAT },
  });

  await prisma.goRideOffer.upsert({
    where: { ride_id_driver_id: { ride_id: completed.id, driver_id: input.driverId } },
    update: { status: GoRideOfferStatus.ACCEPTED, responded_at: yesterday },
    create: {
      ride_id: completed.id,
      driver_id: input.driverId,
      batch_number: 1,
      radius_m: 500,
      status: GoRideOfferStatus.ACCEPTED,
      offered_at: yesterday,
      expires_at: hourAgo,
      responded_at: yesterday,
      effective_eta_sec: 240,
    },
  });

  await prisma.goRideOffer.upsert({
    where: { ride_id_driver_id: { ride_id: awaitingAccept.id, driver_id: input.driverId } },
    update: {
      status: GoRideOfferStatus.ACCEPTED,
      offered_at: yesterday,
      expires_at: hourAgo,
      responded_at: yesterday,
      batch_number: 1,
      radius_m: 700,
      effective_eta_sec: 300,
    },
    create: {
      ride_id: awaitingAccept.id,
      driver_id: input.driverId,
      batch_number: 1,
      radius_m: 700,
      status: GoRideOfferStatus.ACCEPTED,
      offered_at: yesterday,
      expires_at: hourAgo,
      responded_at: yesterday,
      effective_eta_sec: 300,
    },
  });

  const customerRating = await prisma.goRideRating.upsert({
    where: { ride_id_direction: { ride_id: completed.id, direction: GoRatingDirection.CUSTOMER_TO_DRIVER } },
    update: { stars: 5 },
    create: {
      ride_id: completed.id,
      direction: GoRatingDirection.CUSTOMER_TO_DRIVER,
      from_user_id: input.customerUserId,
      to_user_id: input.driverUserId,
      stars: 5,
      notes: 'رحلة تجريبية مكتملة',
    },
  });
  const driverRating = await prisma.goRideRating.upsert({
    where: { ride_id_direction: { ride_id: completed.id, direction: GoRatingDirection.DRIVER_TO_CUSTOMER } },
    update: { stars: 5 },
    create: {
      ride_id: completed.id,
      direction: GoRatingDirection.DRIVER_TO_CUSTOMER,
      from_user_id: input.driverUserId,
      to_user_id: input.customerUserId,
      stars: 5,
    },
  });
  await ensureRatingReason(prisma, customerRating.id, 'CLEAN_CAR');
  await ensureRatingReason(prisma, driverRating.id, 'ON_TIME');

  await ensureAlert(prisma, {
    rideId: active.id,
    branchId: input.branchId,
    type: GoOperationalAlertType.LONG_STOP,
    status: GoOperationalAlertStatus.RESOLVED,
    claimedById: supervisor.id,
    resolvedAt: hourAgo,
    autoResolved: true,
  });
  await ensureAlert(prisma, {
    rideId: completed.id,
    branchId: input.branchId,
    type: GoOperationalAlertType.LOCATION_STALE,
    status: GoOperationalAlertStatus.RESOLVED,
    claimedById: supervisor.id,
    resolvedAt: hourAgo,
    autoResolved: true,
  });

  await ensureComplaint(prisma, {
    rideId: active.id,
    customerId: input.customerId,
    driverId: input.driverId,
    branchId: input.branchId,
    priority: GoComplaintPriority.URGENT,
    status: GoComplaintStatus.CLOSED,
    reasonCode: 'ROUTE',
    notes: 'الطريق أطول من المتوقع — اكتملت الرحلة',
    duringRide: false,
    assignedToId: supervisor.id,
    resolvedById: supervisor.id,
    resolvedAt: hourAgo,
  });
  await ensureComplaint(prisma, {
    rideId: completed.id,
    customerId: input.customerId,
    driverId: input.driverId,
    branchId: input.branchId,
    priority: GoComplaintPriority.NORMAL,
    status: GoComplaintStatus.CLOSED,
    reasonCode: 'DELAY',
    notes: 'تأخير بسيط ثم اكتملت الرحلة',
    assignedToId: supervisor.id,
    resolvedById: supervisor.id,
    resolvedAt: hourAgo,
  });

  await ensureEmergency(prisma, {
    rideId: active.id,
    customerId: input.customerId,
    branchId: input.branchId,
    status: GoEmergencyStatus.CLOSED,
    recordingStatus: GoEmergencyRecordingStatus.SAVED,
    startedAt: yesterday,
    endedAt: hourAgo,
    handledById: supervisor.id,
    storageKey: 'seed/emergency/SEED-1002.webm',
    savedById: supervisor.id,
    savedAt: hourAgo,
  });
  await ensureEmergency(prisma, {
    rideId: completed.id,
    customerId: input.customerId,
    branchId: input.branchId,
    status: GoEmergencyStatus.CLOSED,
    recordingStatus: GoEmergencyRecordingStatus.SAVED,
    startedAt: yesterday,
    endedAt: hourAgo,
    handledById: supervisor.id,
    storageKey: 'seed/emergency/SEED-1001.webm',
    savedById: supervisor.id,
    savedAt: hourAgo,
  });

  const rideCase = await prisma.goRideCase.upsert({
    where: { case_number: 'SEED-CASE-001' },
    update: {
      status: GoCaseStatus.CLOSED,
      ride_id: interrupted.id,
      replacement_ride_id: null,
      reason_code: 'ENGINE',
      latitude: 33.5175,
      longitude: 36.286,
      customer_statement: 'توقفت الرحلة بعد عطل ثم اكتملت',
      driver_statement: 'عطل مؤقت — اكتملت الرحلة بدون بديل',
      supervisor_decision: 'SEED: أُغلقت بعد اكتمال الرحلة',
    },
    create: {
      case_number: 'SEED-CASE-001',
      ride_id: interrupted.id,
      branch_id: input.branchId,
      customer_id: input.customerId,
      driver_id: input.driverId,
      type: GoCaseType.BREAKDOWN,
      status: GoCaseStatus.CLOSED,
      accident_severity: GoAccidentSeverity.SIMPLE,
      reason_code: 'ENGINE',
      occurred_at: yesterday,
      latitude: 33.5175,
      longitude: 36.286,
      customer_statement: 'توقفت الرحلة بعد عطل ثم اكتملت',
      driver_statement: 'عطل مؤقت — اكتملت الرحلة بدون بديل',
      supervisor_decision: 'SEED: أُغلقت بعد اكتمال الرحلة',
      negligence_suspected: false,
      replacement_ride_id: null,
    },
  });
  const existingNote = await prisma.goRideCaseNote.findFirst({
    where: { case_id: rideCase.id, note: 'SEED: فتح الملف من البذرة' },
  });
  if (!existingNote) {
    await prisma.goRideCaseNote.create({
      data: { case_id: rideCase.id, author_id: supervisor.id, note: 'SEED: فتح الملف من البذرة' },
    });
  }

  await prisma.goDriverEntitlement.upsert({
    where: { ride_id_driver_id: { ride_id: completed.id, driver_id: input.driverId } },
    update: { status: GoDriverEntitlementStatus.SETTLED, approved_amount: 4320 },
    create: {
      ride_id: completed.id,
      driver_id: input.driverId,
      calculated_amount: 4320,
      approved_amount: 4320,
      status: GoDriverEntitlementStatus.SETTLED,
      reviewed_by_id: admin.id,
      reviewed_at: hourAgo,
    },
  });
  await prisma.goDriverEntitlement.upsert({
    where: { ride_id_driver_id: { ride_id: interrupted.id, driver_id: input.driverId } },
    update: {
      status: GoDriverEntitlementStatus.SETTLED,
      calculated_amount: 3690,
      approved_amount: 3690,
      reviewed_by_id: admin.id,
      reviewed_at: hourAgo,
    },
    create: {
      ride_id: interrupted.id,
      driver_id: input.driverId,
      calculated_amount: 3690,
      approved_amount: 3690,
      status: GoDriverEntitlementStatus.SETTLED,
      negligence_related: false,
      reviewed_by_id: admin.id,
      reviewed_at: hourAgo,
    },
  });

  await ensureAlert(prisma, {
    rideId: interrupted.id,
    branchId: input.branchId,
    type: GoOperationalAlertType.REPLACEMENT_NEEDED,
    status: GoOperationalAlertStatus.RESOLVED,
    severity: GoAlertSeverity.CRITICAL,
    claimedById: supervisor.id,
    resolvedAt: hourAgo,
    autoResolved: true,
    metadata: {
      source: 'seed',
      action_required: 'NONE',
      phase: 'completed',
      case_type: 'BREAKDOWN',
      subtype: 'ENGINE',
      note: 'اكتملت الرحلة — لا حاجة لسائق بديل',
      public_number: 'SEED-1005',
      case_id: rideCase.id,
      case_number: 'SEED-CASE-001',
      location_label: 'نقطة التعطّل، شارع بغداد — دمشق',
      lat: 33.5175,
      lng: 36.286,
    },
  });

  await ensureWalletTxn(prisma, {
    reason: 'SEED:TOP_UP',
    walletId: wallet.id,
    driverId: input.driverId,
    type: GoWalletTransactionType.TOP_UP,
    amount: 99500,
    balanceBefore: 0,
    balanceAfter: 99500,
    createdById: admin.id,
  });
  await ensureWalletTxn(prisma, {
    reason: 'SEED:ADJUSTMENT',
    walletId: wallet.id,
    driverId: input.driverId,
    type: GoWalletTransactionType.ADJUSTMENT,
    amount: 500,
    balanceBefore: 99500,
    balanceAfter: 100000,
    createdById: admin.id,
  });
  const commission = await ensureWalletTxn(prisma, {
    reason: 'SEED:COMMISSION',
    walletId: wallet.id,
    driverId: input.driverId,
    type: GoWalletTransactionType.COMMISSION_DEDUCTION,
    amount: 800,
    balanceBefore: 100000,
    balanceAfter: 99200,
    rideId: completed.id,
    createdById: admin.id,
    createdAt: hourAgo,
  });
  // Partial reversal only — keeps real commission in finance reports (not a full wipe).
  const reversal = await prisma.goDriverWalletTransaction.findFirst({ where: { reason: 'SEED:REVERSAL' } });
  if (!reversal) {
    await prisma.goDriverWalletTransaction.create({
      data: {
        wallet_id: wallet.id,
        driver_id: input.driverId,
        type: GoWalletTransactionType.REVERSAL,
        amount: 200,
        balance_before: 99200,
        balance_after: 99400,
        ride_id: completed.id,
        reversed_transaction_id: commission.id,
        reason: 'SEED:REVERSAL',
        created_by_id: admin.id,
        created_at: hourAgo,
      },
    });
  } else if (Number(reversal.amount) !== 200) {
    await prisma.goDriverWalletTransaction.update({
      where: { id: reversal.id },
      data: {
        amount: 200,
        balance_before: 99200,
        balance_after: 99400,
        reversed_transaction_id: commission.id,
        created_at: hourAgo,
      },
    });
  }
  await ensureWalletTxn(prisma, {
    reason: 'SEED:CANCEL_PENALTY',
    walletId: wallet.id,
    driverId: input.driverId,
    type: GoWalletTransactionType.DRIVER_CANCEL_PENALTY,
    amount: 2000,
    balanceBefore: 99400,
    balanceAfter: 97400,
    createdById: admin.id,
    createdAt: hourAgo,
  });
  await prisma.goDriverWalletTransaction.updateMany({
    where: { reason: 'SEED:CANCEL_PENALTY' },
    data: { created_at: hourAgo, amount: 2000 },
  });
  await prisma.goDriverWalletTransaction.updateMany({
    where: { reason: 'SEED:COMMISSION' },
    data: { created_at: hourAgo },
  });

  await prisma.goWalletCommissionHold.upsert({
    where: { ride_id: completed.id },
    update: { released_at: hourAgo, reserved_amount: 480 },
    create: {
      driver_id: input.driverId,
      wallet_id: wallet.id,
      ride_id: completed.id,
      reserved_amount: 480,
      released_at: hourAgo,
    },
  });
  await prisma.goWalletCommissionHold.upsert({
    where: { ride_id: active.id },
    update: { reserved_amount: 390, released_at: hourAgo },
    create: {
      driver_id: input.driverId,
      wallet_id: wallet.id,
      ride_id: active.id,
      reserved_amount: 390,
      released_at: hourAgo,
    },
  });

  const compensation = await prisma.goRideCompensation.findFirst({
    where: { ride_id: completed.id, reason: 'SEED: تأخير الوصول' },
  });
  if (!compensation) {
    await prisma.goRideCompensation.create({
      data: {
        ride_id: completed.id,
        type: GoCompensationType.FIXED_AMOUNT,
        fixed_amount: 500,
        applied_amount: 500,
        reason: 'SEED: تأخير الوصول',
        created_by_id: supervisor.id,
        bearer: GoCompensationBearer.BEROYA,
        beroya_share: 500,
        driver_share: 0,
        finance_reviewed_by_id: admin.id,
        finance_reviewed_at: hourAgo,
      },
    });
  }

  await prisma.goCustomerPassport.upsert({
    where: { customer_id: input.customerId },
    update: { hidden_score: 130, current_level_id: silver.id, completed_rides: 6, current_streak: 5 },
    create: {
      customer_id: input.customerId,
      hidden_score: 130,
      current_level_id: silver.id,
      completed_rides: 6,
      current_streak: 5,
    },
  });

  const ledger = await prisma.goPassportScoreLedger.findFirst({
    where: { ride_id: completed.id, event_type: GoPassportScoreEventType.RIDE_COMPLETED },
  });
  if (!ledger) {
    await prisma.goPassportScoreLedger.create({
      data: {
        customer_id: input.customerId,
        event_type: GoPassportScoreEventType.RIDE_COMPLETED,
        ride_id: completed.id,
        delta: 5,
        score_before: 125,
        score_after: 130,
        metadata: { source: 'seed' },
      },
    });
  }

  let grant = await prisma.goPassportRewardGrant.findFirst({
    where: { customer_id: input.customerId, streak_value: 5 },
  });
  if (!grant) {
    grant = await ensureRewardGrant(prisma, {
      customerId: input.customerId,
      streak: 5,
      type: GoPassportRewardType.SCORE_AND_DISCOUNT,
      status: GoPassportRewardGrantStatus.APPROVED,
      createdAt: hourAgo,
      approvedById: admin.id,
      approvedAt: hourAgo,
    });
  }

  const code = await prisma.goCustomerDiscountCode.upsert({
    where: { code: 'SEED-WELCOME' },
    update: {
      status: GoDiscountCodeStatus.ACTIVE,
      percentage: 10,
      expires_at: nextMonth,
      milestone_grant_id: grant.id,
    },
    create: {
      customer_id: input.customerId,
      code: 'SEED-WELCOME',
      name: 'خصم ترحيبي',
      percentage: 10,
      maximum_discount_amount: 2000,
      valid_from: yesterday,
      expires_at: nextMonth,
      usage_limit: 5,
      usage_count: 1,
      immediate_allowed: true,
      scheduled_allowed: true,
      status: GoDiscountCodeStatus.ACTIVE,
      milestone_grant_id: grant.id,
      created_by_id: admin.id,
    },
  });
  await prisma.goCustomerDiscountCategory.upsert({
    where: { discount_code_id_ride_category_id: { discount_code_id: code.id, ride_category_id: input.categoryId } },
    update: {},
    create: { discount_code_id: code.id, ride_category_id: input.categoryId },
  });
  await prisma.goRideDiscountReservation.upsert({
    where: { ride_id: completed.id },
    update: { status: GoRideDiscountReservationStatus.APPLIED, applied_at: hourAgo },
    create: {
      ride_id: completed.id,
      discount_code_id: code.id,
      status: GoRideDiscountReservationStatus.APPLIED,
      applied_at: hourAgo,
    },
  });

  const session = await prisma.goUserSession.findFirst({ where: { device_id: 'seed-web', user_id: input.customerUserId } });
  if (!session) {
    await prisma.goUserSession.create({
      data: {
        user_id: input.customerUserId,
        refresh_token_hash: hash('seed-refresh-token'),
        device_id: 'seed-web',
        device_name: 'Seed browser',
        platform: GoDevicePlatform.WEB,
        expires_at: nextMonth,
      },
    });
  }

  await ensureOtp(prisma, '+963911111111', GoOtpPurpose.CUSTOMER_LOGIN, yesterday);
  await ensureOtp(prisma, '+963922222222', GoOtpPurpose.DRIVER_LOGIN, yesterday);

  const audit = await prisma.goAuditLog.findFirst({ where: { action: 'SEED_BOOTSTRAP' } });
  if (!audit) {
    await prisma.goAuditLog.create({
      data: {
        actor_user_id: admin.id,
        actor_role: GoRole.ADMIN,
        branch_id: input.branchId,
        action: 'SEED_BOOTSTRAP',
        entity_type: 'go_branch',
        entity_id: input.branchId,
        metadata: { source: 'seed' },
      },
    });
  }

  await prisma.goIdempotencyKey.upsert({
    where: { user_id_key: { user_id: input.customerUserId, key: 'seed-book-ride' } },
    update: { status: GoIdempotencyStatus.COMPLETED, response_status: 200 },
    create: {
      key: 'seed-book-ride',
      user_id: input.customerUserId,
      method: 'POST',
      path: '/rides',
      request_hash: hash('seed-book-ride'),
      status: GoIdempotencyStatus.COMPLETED,
      response_status: 200,
      response_body: { public_number: 'SEED-1001' },
      expires_at: nextMonth,
    },
  });

  await prisma.goDriverPassport.update({
    where: { driver_id: input.driverId },
    data: { completed_rides: 1, hidden_score: 10 },
  });

  await seedVolume(prisma, input, { adminId: admin.id, supervisorId: supervisor.id, now, yesterday, hourAgo, tomorrow, nextMonth });
}

type RideSeed = {
  public_number: string;
  customer_id: string;
  driver_id: string | null;
  branch_id: string;
  ride_category_id: string;
  type: GoRideType;
  status: GoRideStatus;
  payment_method: GoPaymentMethod;
  booking_for?: GoBookingFor;
  other_passenger_name?: string;
  other_passenger_phone?: string;
  scheduled_at?: Date;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  original_destination_lat: number;
  original_destination_lng: number;
  original_destination_address: string;
  actual_start_lat?: number;
  actual_start_lng?: number;
  actual_dropoff_lat?: number;
  actual_dropoff_lng?: number;
  estimated_distance_m?: number;
  estimated_duration_sec?: number;
  estimated_fare?: number;
  actual_distance_m?: number;
  actual_duration_sec?: number;
  gross_final_fare?: number;
  discount_total?: number;
  compensation_total?: number;
  customer_payable?: number;
  payment_status?: GoPaymentStatus;
  fare_stack_decision?: GoFareStackDecision | null;
  assigned_at?: Date;
  arrived_at?: Date;
  started_at?: Date;
  completed_at?: Date;
  cancelled_at?: Date;
  no_show_at?: Date;
  replacement_of_ride_id?: string;
  estimated_route_polyline?: string;
  estimated_route_source?: string;
  estimated_route_summary?: string;
};

async function upsertRide(prisma: PrismaClient, ride: RideSeed) {
  const route = ride.estimated_route_polyline
    ? null
    : await seedBookedRoute(
        { lat: ride.pickup_lat, lng: ride.pickup_lng },
        { lat: ride.original_destination_lat, lng: ride.original_destination_lng },
      );
  const data = {
    customer_id: ride.customer_id,
    driver_id: ride.driver_id,
    branch_id: ride.branch_id,
    ride_category_id: ride.ride_category_id,
    type: ride.type,
    status: ride.status,
    payment_method: ride.payment_method,
    booking_for: ride.booking_for ?? GoBookingFor.SELF,
    other_passenger_name: ride.other_passenger_name ?? null,
    other_passenger_phone: ride.other_passenger_phone ?? null,
    scheduled_at: ride.scheduled_at ?? null,
    pickup_lat: ride.pickup_lat,
    pickup_lng: ride.pickup_lng,
    pickup_address: ride.pickup_address,
    original_destination_lat: ride.original_destination_lat,
    original_destination_lng: ride.original_destination_lng,
    original_destination_address: ride.original_destination_address,
    actual_start_lat: ride.actual_start_lat ?? null,
    actual_start_lng: ride.actual_start_lng ?? null,
    actual_dropoff_lat: ride.actual_dropoff_lat ?? null,
    actual_dropoff_lng: ride.actual_dropoff_lng ?? null,
    estimated_distance_m: ride.estimated_distance_m ?? route?.distance_m ?? null,
    estimated_duration_sec: ride.estimated_duration_sec ?? route?.duration_sec ?? null,
    estimated_fare: ride.estimated_fare ?? null,
    estimated_route_polyline: ride.estimated_route_polyline ?? route?.encoded_polyline ?? null,
    estimated_route_source: ride.estimated_route_source ?? route?.source ?? 'google',
    estimated_route_summary: ride.estimated_route_summary ?? (route?.summary || `${ride.pickup_address} → ${ride.original_destination_address}`),
    actual_distance_m: ride.actual_distance_m ?? null,
    actual_duration_sec: ride.actual_duration_sec ?? null,
    gross_final_fare: ride.gross_final_fare ?? null,
    discount_total: ride.discount_total ?? null,
    compensation_total: ride.compensation_total ?? null,
    customer_payable: ride.customer_payable ?? null,
    payment_status: ride.payment_status,
    fare_stack_decision: ride.fare_stack_decision,
    assigned_at: ride.assigned_at ?? null,
    arrived_at: ride.arrived_at ?? null,
    started_at: ride.started_at ?? null,
    completed_at: ride.completed_at ?? null,
    cancelled_at: ride.cancelled_at ?? null,
    no_show_at: ride.no_show_at ?? null,
    replacement_of_ride_id: ride.replacement_of_ride_id ?? null,
  };
  return prisma.goRide.upsert({
    where: { public_number: ride.public_number },
    update: data,
    create: { public_number: ride.public_number, ...data },
  });
}

async function ensureRatingReason(prisma: PrismaClient, ratingId: string, reasonCode: string) {
  const found = await prisma.goRideRatingReason.findFirst({ where: { rating_id: ratingId, reason_code: reasonCode } });
  if (!found) await prisma.goRideRatingReason.create({ data: { rating_id: ratingId, reason_code: reasonCode } });
}

async function ensureAlert(
  prisma: PrismaClient,
  input: {
    rideId: string;
    branchId: string;
    type: GoOperationalAlertType;
    status: GoOperationalAlertStatus;
    claimedById?: string;
    resolvedAt?: Date;
    autoResolved?: boolean;
    severity?: GoAlertSeverity;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const found = await prisma.goOperationalAlert.findFirst({ where: { ride_id: input.rideId, type: input.type } });
  const data = {
    status: input.status,
    severity: input.severity ?? GoAlertSeverity.WARNING,
    claimed_by_id: input.claimedById ?? null,
    resolved_at: input.resolvedAt ?? null,
    auto_resolved: input.autoResolved ?? false,
    metadata: (input.metadata ?? { source: 'seed' }) satisfies Prisma.InputJsonValue,
  };
  if (found) {
    await prisma.goOperationalAlert.update({ where: { id: found.id }, data });
    return;
  }
  await prisma.goOperationalAlert.create({
    data: { ride_id: input.rideId, branch_id: input.branchId, type: input.type, ...data },
  });
}

async function ensureComplaint(
  prisma: PrismaClient,
  input: {
    rideId: string;
    customerId: string;
    driverId: string;
    branchId: string;
    priority: GoComplaintPriority;
    status: GoComplaintStatus;
    reasonCode: string;
    notes: string;
    duringRide?: boolean;
    assignedToId?: string;
    resolvedById?: string;
    resolvedAt?: Date;
  },
) {
  const found = await prisma.goComplaint.findFirst({ where: { ride_id: input.rideId, reason_code: input.reasonCode } });
  const data = {
    priority: input.priority,
    status: input.status,
    notes: input.notes,
    submitted_during_ride: input.duringRide ?? false,
    assigned_to_id: input.assignedToId ?? null,
    resolved_by_id: input.resolvedById ?? null,
    resolved_at: input.resolvedAt ?? null,
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
      reason_code: input.reasonCode,
      ...data,
    },
  });
}

async function ensureEmergency(
  prisma: PrismaClient,
  input: {
    rideId: string;
    customerId: string;
    branchId: string;
    status: GoEmergencyStatus;
    recordingStatus: GoEmergencyRecordingStatus;
    startedAt: Date;
    endedAt?: Date;
    handledById?: string;
    storageKey?: string;
    savedById?: string;
    savedAt?: Date;
  },
) {
  const found = await prisma.goEmergencySession.findFirst({ where: { ride_id: input.rideId } });
  const data = {
    status: input.status,
    recording_status: input.recordingStatus,
    started_at: input.startedAt,
    ended_at: input.endedAt ?? null,
    started_lat: PICKUP.lat,
    started_lng: PICKUP.lng,
    handled_by_id: input.handledById ?? null,
    recording_storage_key: input.storageKey ?? null,
    saved_by_id: input.savedById ?? null,
    saved_at: input.savedAt ?? null,
  };
  if (found) {
    await prisma.goEmergencySession.update({ where: { id: found.id }, data });
    return;
  }
  await prisma.goEmergencySession.create({
    data: { ride_id: input.rideId, customer_id: input.customerId, branch_id: input.branchId, ...data },
  });
}

async function ensureWalletTxn(
  prisma: PrismaClient,
  input: {
    reason: string;
    walletId: string;
    driverId: string;
    type: GoWalletTransactionType;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    rideId?: string;
    createdById: string;
    createdAt?: Date;
  },
) {
  const found = await prisma.goDriverWalletTransaction.findFirst({ where: { reason: input.reason } });
  if (found) return found;
  return prisma.goDriverWalletTransaction.create({
    data: {
      wallet_id: input.walletId,
      driver_id: input.driverId,
      type: input.type,
      amount: input.amount,
      balance_before: input.balanceBefore,
      balance_after: input.balanceAfter,
      ride_id: input.rideId,
      reason: input.reason,
      created_by_id: input.createdById,
      ...(input.createdAt ? { created_at: input.createdAt } : {}),
    },
  });
}

/** Real seed ledger rows for the finance desk — no invented UI numbers. */
async function seedFinanceLedger(
  prisma: PrismaClient,
  input: {
    adminId: string;
    hourAgo: Date;
    yesterday: Date;
    rows: { reason: string; driverId: string; rideId: string; amount: number; at: Date }[];
  },
) {
  for (const row of input.rows) {
    const wallet = await prisma.goDriverWallet.upsert({
      where: { driver_id: row.driverId },
      update: {},
      create: { driver_id: row.driverId, balance: 50_000 },
    });
    const before = Number(wallet.balance);
    const after = Math.max(0, before - row.amount);
    await ensureWalletTxn(prisma, {
      reason: row.reason,
      walletId: wallet.id,
      driverId: row.driverId,
      type: GoWalletTransactionType.COMMISSION_DEDUCTION,
      amount: row.amount,
      balanceBefore: before,
      balanceAfter: after,
      rideId: row.rideId,
      createdById: input.adminId,
      createdAt: row.at,
    });
    if (after !== before) {
      await prisma.goDriverWallet.update({ where: { id: wallet.id }, data: { balance: after, last_commission_amount: row.amount } });
    }
  }
}

async function seedVolume(
  prisma: PrismaClient,
  input: SeedActivityInput,
  clock: { adminId: string; supervisorId: string; now: Date; yesterday: Date; hourAgo: Date; tomorrow: Date; nextMonth: Date },
) {
  const aleppo = await prisma.goBranch.findUniqueOrThrow({ where: { code: 'ALEPPO' } });
  const categoryOf = new Map((await prisma.goRideCategory.findMany()).map((row) => [row.code, row.id]));
  const starter = await prisma.goCustomerPassportLevel.findUniqueOrThrow({ where: { level_order: 1 } });
  const gold = await prisma.goCustomerPassportLevel.findUniqueOrThrow({ where: { level_order: 3 } });
  const driverLevel = await prisma.goDriverPassportLevel.findUnique({ where: { level_order: 1 } });
  const docsExpire = new Date(clock.now);
  docsExpire.setFullYear(docsExpire.getFullYear() + 1);

  const layla = await ensureCustomer(prisma, 'ليلى الحسن', '+963911111112', starter.id, 45, 4);
  const karam = await ensureCustomer(prisma, 'كرم ناصر', '+963911111113', gold.id, 240, 28);
  const huda = await ensureCustomer(prisma, 'هدى العلي', '+963911111114', starter.id, 20, 2);
  const sami = await ensureCustomer(prisma, 'سامي خليل', '+963911111115', starter.id, 5, 0);

  const comfort = categoryOf.get('COMFORT') ?? input.categoryId;
  const family = categoryOf.get('FAMILY') ?? input.categoryId;
  const vip = categoryOf.get('VIP') ?? input.categoryId;
  const economy = categoryOf.get('ECONOMY') ?? input.categoryId;

  const rana = await ensureDriver(prisma, {
    name: 'رنا الخطيب', phone: '+963922222223', branchId: input.branchId, gender: GoDriverGender.FEMALE,
    plate: 'دمشق-GO-002', categoryId: comfort, make: 'Kia', model: 'Cerato', color: 'فضي', year: 2022,
    balance: 75000, docsExpire, levelId: driverLevel?.id ?? null,
  });
  const sara = await ensureDriver(prisma, {
    name: 'سارة قضماني', phone: '+963922222224', branchId: input.branchId, gender: GoDriverGender.FEMALE,
    plate: 'دمشق-GO-003', categoryId: vip, make: 'Hyundai', model: 'Sonata', color: 'أسود', year: 2023,
    balance: 150000, docsExpire, levelId: driverLevel?.id ?? null,
  });
  const mazen = await ensureDriver(prisma, {
    name: 'مازن درويش', phone: '+963922222225', branchId: input.branchId, gender: GoDriverGender.MALE,
    plate: 'دمشق-GO-004', categoryId: family, make: 'Kia', model: 'Carnival', color: 'أبيض', year: 2021,
    balance: 42000, docsExpire, levelId: driverLevel?.id ?? null,
  });
  const fadi = await ensureDriver(prisma, {
    name: 'فادي عمر', phone: '+963922222226', branchId: aleppo.id, gender: GoDriverGender.MALE,
    plate: 'حلب-GO-001', categoryId: economy, make: 'Toyota', model: 'Yaris', color: 'أزرق', year: 2019,
    balance: 88000, docsExpire, levelId: driverLevel?.id ?? null,
  });
  const kanan = await ensureDriver(prisma, {
    name: 'كنان صالح', phone: '+963922222227', branchId: aleppo.id, gender: GoDriverGender.MALE,
    plate: 'حلب-GO-002', categoryId: economy, make: 'Hyundai', model: 'Accent', color: 'رمادي', year: 2018,
    balance: 3000, outstanding: 12000, docsExpire, levelId: driverLevel?.id ?? null,
    blocked: true, blockedReason: 'وثيقة التأمين قاربت على الانتهاء',
  });

  const aleppoFleet = [
    { name: 'أحمد حمدان', phone: '+963922222228', gender: GoDriverGender.MALE, plate: 'حلب-GO-003', category: 'ECONOMY', make: 'Kia', model: 'Rio', color: 'أبيض', year: 2020, balance: 65000, lat: 36.212, lng: 37.145, online: true },
    { name: 'محمد شيخ الأرض', phone: '+963922222229', gender: GoDriverGender.MALE, plate: 'حلب-GO-004', category: 'TAXI', make: 'Hyundai', model: 'Elantra', color: 'أصفر', year: 2017, balance: 54000, lat: 36.203, lng: 37.153, online: true },
    { name: 'لمى حداد', phone: '+963922222230', gender: GoDriverGender.FEMALE, plate: 'حلب-GO-005', category: 'WOMEN', make: 'Kia', model: 'Picanto', color: 'أحمر', year: 2021, balance: 70000, lat: 36.205, lng: 37.144, online: true },
    { name: 'نور الهدى قصاب', phone: '+963922222231', gender: GoDriverGender.FEMALE, plate: 'حلب-GO-006', category: 'WOMEN', make: 'Toyota', model: 'Yaris', color: 'سماوي', year: 2022, balance: 82000, lat: 36.213, lng: 37.118, online: true },
    { name: 'عمر جبري', phone: '+963922222232', gender: GoDriverGender.MALE, plate: 'حلب-GO-007', category: 'VIP', make: 'Mercedes', model: 'E-Class', color: 'أسود', year: 2019, balance: 160000, lat: 36.229, lng: 37.125, online: true },
    { name: 'يوسف كيالي', phone: '+963922222233', gender: GoDriverGender.MALE, plate: 'حلب-GO-008', category: 'FAMILY', make: 'Kia', model: 'Carnival', color: 'فضي', year: 2020, balance: 95000, lat: 36.209, lng: 37.095, online: true },
    { name: 'خالد عنتابي', phone: '+963922222234', gender: GoDriverGender.MALE, plate: 'حلب-GO-009', category: 'XL', make: 'Hyundai', model: 'H-1', color: 'أبيض', year: 2018, balance: 110000, lat: 36.221, lng: 37.137, online: true },
    { name: 'جورج سعادة', phone: '+963922222235', gender: GoDriverGender.MALE, plate: 'حلب-GO-010', category: 'ECONOMY', make: 'Chevrolet', model: 'Aveo', color: 'رمادي', year: 2016, balance: 40000, lat: 36.219, lng: 37.122, online: false },
  ];
  for (const d of aleppoFleet) {
    const seeded = await ensureDriver(prisma, {
      name: d.name, phone: d.phone, branchId: aleppo.id, gender: d.gender,
      plate: d.plate, categoryId: categoryOf.get(d.category) ?? economy, make: d.make, model: d.model, color: d.color, year: d.year,
      balance: d.balance, docsExpire, levelId: driverLevel?.id ?? null,
    });
    await setDriverState(
      prisma, seeded.id, d.online ? GoDriverAvailability.ONLINE : GoDriverAvailability.OFFLINE,
      d.lat, d.lng, null, d.online ? clock.now : clock.yesterday,
    );
  }

  const assigned = await upsertRide(prisma, {
    public_number: 'SEED-2001',
    customer_id: layla.id, driver_id: rana.id, branch_id: input.branchId, ride_category_id: comfort,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.DRIVER_ASSIGNED, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.CASH_EXPECTED,
    pickup_lat: 33.51, pickup_lng: 36.292, pickup_address: 'المالكي، دمشق',
    original_destination_lat: 33.522, original_destination_lng: 36.31, original_destination_address: 'أبو رمانة، دمشق',
    estimated_distance_m: 2600, estimated_duration_sec: 540, estimated_fare: 4100, assigned_at: clock.hourAgo,
  });
  const enRoute = await upsertRide(prisma, {
    public_number: 'SEED-2002',
    customer_id: karam.id, driver_id: sara.id, branch_id: input.branchId, ride_category_id: vip,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.DRIVER_EN_ROUTE, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.CASH_EXPECTED,
    pickup_lat: 33.535, pickup_lng: 36.292, pickup_address: 'ركن الدين، دمشق',
    original_destination_lat: 33.49, original_destination_lng: 36.3, original_destination_address: 'الميدان، دمشق',
    estimated_distance_m: 7400, estimated_duration_sec: 1500, estimated_fare: 12500, assigned_at: clock.hourAgo,
  });
  const arrived = await upsertRide(prisma, {
    public_number: 'SEED-2003',
    customer_id: sami.id, driver_id: input.driverId, branch_id: input.branchId, ride_category_id: economy,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.ARRIVED, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.CASH_EXPECTED,
    pickup_lat: 33.515, pickup_lng: 36.31, pickup_address: 'القصاع، دمشق',
    original_destination_lat: 33.505, original_destination_lng: 36.29, original_destination_address: 'البرامكة، دمشق',
    estimated_distance_m: 1800, estimated_duration_sec: 420, estimated_fare: 2900,
    assigned_at: clock.hourAgo, arrived_at: clock.now,
  });
  await upsertRide(prisma, {
    public_number: 'SEED-2004',
    customer_id: layla.id, driver_id: rana.id, branch_id: input.branchId, ride_category_id: comfort,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.CANCELLED_BY_CUSTOMER, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.WAIVED,
    pickup_lat: 33.492, pickup_lng: 36.275, pickup_address: 'كفرسوسة، دمشق',
    original_destination_lat: 33.5138, original_destination_lng: 36.2765, original_destination_address: 'المرجة، دمشق',
    estimated_fare: 3600, assigned_at: clock.yesterday, cancelled_at: clock.yesterday,
  });
  await upsertRide(prisma, {
    public_number: 'SEED-2005',
    customer_id: karam.id, driver_id: mazen.id, branch_id: input.branchId, ride_category_id: family,
    type: GoRideType.SCHEDULED, status: GoRideStatus.NO_SHOW, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.CASH_EXPECTED, scheduled_at: clock.yesterday,
    pickup_lat: 33.51, pickup_lng: 36.292, pickup_address: 'المالكي، دمشق',
    original_destination_lat: 33.522, original_destination_lng: 36.31, original_destination_address: 'أبو رمانة، دمشق',
    estimated_fare: 6200, assigned_at: clock.yesterday, arrived_at: clock.yesterday, no_show_at: clock.yesterday,
  });
  await upsertRide(prisma, {
    public_number: 'SEED-2006',
    customer_id: huda.id, driver_id: null, branch_id: aleppo.id, ride_category_id: economy,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.FAILED_NO_DRIVER, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.WAIVED,
    pickup_lat: 36.202, pickup_lng: 37.155, pickup_address: 'العزيزية، حلب',
    original_destination_lat: 36.185, original_destination_lng: 37.12, original_destination_address: 'الفرقان، حلب',
    estimated_distance_m: 5100, estimated_duration_sec: 1100, estimated_fare: 4700,
  });
  const waived = await upsertRide(prisma, {
    public_number: 'SEED-2007',
    customer_id: layla.id, driver_id: rana.id, branch_id: input.branchId, ride_category_id: comfort,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.COMPLETED, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.WAIVED,
    pickup_lat: 33.51, pickup_lng: 36.292, pickup_address: 'المالكي، دمشق',
    original_destination_lat: 33.5138, original_destination_lng: 36.2765, original_destination_address: 'المرجة، دمشق',
    estimated_distance_m: 2200, estimated_duration_sec: 480, estimated_fare: 3900,
    actual_distance_m: 2300, actual_duration_sec: 510,
    gross_final_fare: 3900, discount_total: 3900, customer_payable: 0,
    assigned_at: clock.yesterday, started_at: clock.yesterday, completed_at: clock.hourAgo,
  });
  const pendingStack = await upsertRide(prisma, {
    public_number: 'SEED-2008',
    customer_id: karam.id, driver_id: sara.id, branch_id: input.branchId, ride_category_id: vip,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.COMPLETED, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.COLLECTED, fare_stack_decision: GoFareStackDecision.PENDING,
    pickup_lat: 33.535, pickup_lng: 36.292, pickup_address: 'ركن الدين، دمشق',
    original_destination_lat: 33.5138, original_destination_lng: 36.2765, original_destination_address: 'المرجة، دمشق',
    actual_dropoff_lat: 33.5138, actual_dropoff_lng: 36.2765,
    estimated_distance_m: 4800, estimated_duration_sec: 960, estimated_fare: 9800,
    actual_distance_m: 5100, actual_duration_sec: 1080,
    gross_final_fare: 10200, discount_total: 0, compensation_total: 1500, customer_payable: 10200,
    assigned_at: clock.yesterday, started_at: clock.yesterday, completed_at: clock.hourAgo,
  });
  const aleppoDone = await upsertRide(prisma, {
    public_number: 'SEED-2009',
    customer_id: huda.id, driver_id: fadi.id, branch_id: aleppo.id, ride_category_id: economy,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.COMPLETED, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.COLLECTED,
    pickup_lat: 36.202, pickup_lng: 37.155, pickup_address: 'العزيزية، حلب',
    original_destination_lat: 36.21, original_destination_lng: 37.14, original_destination_address: 'الشهباء، حلب',
    actual_dropoff_lat: 36.21, actual_dropoff_lng: 37.14,
    estimated_distance_m: 3400, estimated_duration_sec: 780, estimated_fare: 3600,
    actual_distance_m: 3600, actual_duration_sec: 840,
    gross_final_fare: 3800, customer_payable: 3800,
    assigned_at: clock.yesterday, started_at: clock.yesterday, completed_at: clock.hourAgo,
  });
  const aleppoSearch = await upsertRide(prisma, {
    public_number: 'SEED-2010',
    customer_id: huda.id, driver_id: null, branch_id: aleppo.id, ride_category_id: economy,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.SEARCHING, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.CASH_EXPECTED,
    pickup_lat: 36.185, pickup_lng: 37.12, pickup_address: 'الفرقان، حلب',
    original_destination_lat: 36.202, original_destination_lng: 37.155, original_destination_address: 'العزيزية، حلب',
    estimated_distance_m: 4100, estimated_duration_sec: 900, estimated_fare: 4200,
  });
  await upsertRide(prisma, {
    public_number: 'SEED-2011',
    customer_id: sami.id, driver_id: fadi.id, branch_id: aleppo.id, ride_category_id: economy,
    type: GoRideType.SCHEDULED, status: GoRideStatus.SEARCHING, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.CASH_EXPECTED, scheduled_at: clock.tomorrow,
    pickup_lat: 36.21, pickup_lng: 37.14, pickup_address: 'الشهباء، حلب',
    original_destination_lat: 36.185, original_destination_lng: 37.12, original_destination_address: 'الفرقان، حلب',
    estimated_distance_m: 3900, estimated_duration_sec: 840, estimated_fare: 4000,
  });
  const moving = await upsertRide(prisma, {
    public_number: 'SEED-2012',
    customer_id: karam.id, driver_id: mazen.id, branch_id: input.branchId, ride_category_id: family,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.IN_PROGRESS, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.CASH_EXPECTED,
    pickup_lat: 33.49, pickup_lng: 36.3, pickup_address: 'الميدان، دمشق',
    original_destination_lat: 33.535, original_destination_lng: 36.292, original_destination_address: 'ركن الدين، دمشق',
    estimated_distance_m: 6800, estimated_duration_sec: 1320, estimated_fare: 7900,
    assigned_at: clock.hourAgo, arrived_at: clock.hourAgo, started_at: clock.hourAgo,
  });
  const replaced = await upsertRide(prisma, {
    public_number: 'SEED-2013',
    customer_id: layla.id, driver_id: sara.id, branch_id: input.branchId, ride_category_id: vip,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.REPLACED, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.WAIVED,
    pickup_lat: 33.5138, pickup_lng: 36.2765, pickup_address: 'المرجة، دمشق',
    original_destination_lat: 33.522, original_destination_lng: 36.31, original_destination_address: 'أبو رمانة، دمشق',
    estimated_fare: 9000, gross_final_fare: 2200, customer_payable: 0,
    assigned_at: clock.yesterday, started_at: clock.yesterday,
  });
  const firstPeopleRide = await upsertRide(prisma, {
    public_number: 'SEED-2014',
    customer_id: layla.id, driver_id: rana.id, branch_id: input.branchId, ride_category_id: comfort,
    type: GoRideType.IMMEDIATE, status: GoRideStatus.COMPLETED, payment_method: GoPaymentMethod.CASH,
    payment_status: GoPaymentStatus.COLLECTED,
    pickup_lat: 33.518, pickup_lng: 36.288, pickup_address: 'نقطة البدل، دمشق',
    original_destination_lat: 33.522, original_destination_lng: 36.31, original_destination_address: 'أبو رمانة، دمشق',
    estimated_distance_m: 1900, estimated_duration_sec: 420, estimated_fare: 3400,
    actual_distance_m: 2000, actual_duration_sec: 460,
    gross_final_fare: 3500, customer_payable: 3500,
    assigned_at: clock.yesterday, started_at: clock.yesterday, completed_at: clock.hourAgo,
    replacement_of_ride_id: replaced.id,
  });

  await setDriverState(prisma, rana.id, GoDriverAvailability.ONLINE, 33.51, 36.292, null, clock.now);
  await setDriverState(prisma, sara.id, GoDriverAvailability.BUSY, 33.528, 36.295, enRoute.id, clock.now);
  await setDriverState(prisma, mazen.id, GoDriverAvailability.BUSY, 33.5, 36.298, moving.id, clock.now);
  await setDriverState(prisma, fadi.id, GoDriverAvailability.ONLINE, 36.202, 37.155, null, clock.now);
  await setDriverState(prisma, kanan.id, GoDriverAvailability.OFFLINE, 36.19, 37.13, null, clock.yesterday);

  await prisma.goRideOffer.upsert({
    where: { ride_id_driver_id: { ride_id: assigned.id, driver_id: rana.id } },
    update: { status: GoRideOfferStatus.ACCEPTED, responded_at: clock.hourAgo },
    create: {
      ride_id: assigned.id, driver_id: rana.id, batch_number: 1, radius_m: 700,
      status: GoRideOfferStatus.ACCEPTED, offered_at: clock.hourAgo, expires_at: clock.tomorrow,
      responded_at: clock.hourAgo, effective_eta_sec: 180,
    },
  });
  await prisma.goRideOffer.upsert({
    where: { ride_id_driver_id: { ride_id: aleppoSearch.id, driver_id: fadi.id } },
    update: { status: GoRideOfferStatus.PENDING, expires_at: clock.tomorrow },
    create: {
      ride_id: aleppoSearch.id, driver_id: fadi.id, batch_number: 1, radius_m: 1000,
      status: GoRideOfferStatus.PENDING, offered_at: clock.now, expires_at: clock.tomorrow, effective_eta_sec: 360,
    },
  });
  await prisma.goRideOffer.upsert({
    where: { ride_id_driver_id: { ride_id: aleppoSearch.id, driver_id: kanan.id } },
    update: { status: GoRideOfferStatus.DECLINED },
    create: {
      ride_id: aleppoSearch.id, driver_id: kanan.id, batch_number: 1, radius_m: 1000,
      status: GoRideOfferStatus.DECLINED, offered_at: clock.hourAgo, expires_at: clock.now,
      responded_at: clock.hourAgo, effective_eta_sec: 900,
    },
  });

  await ensureAlert(prisma, { rideId: enRoute.id, branchId: input.branchId, type: GoOperationalAlertType.MAJOR_ROUTE_DEVIATION, status: GoOperationalAlertStatus.OPEN });
  await ensureAlert(prisma, { rideId: moving.id, branchId: input.branchId, type: GoOperationalAlertType.LONG_STOP, status: GoOperationalAlertStatus.CLAIMED, claimedById: clock.supervisorId });
  await ensureAlert(prisma, { rideId: aleppoSearch.id, branchId: aleppo.id, type: GoOperationalAlertType.SCHEDULED_DRIVER_OFFLINE, status: GoOperationalAlertStatus.OPEN });

  await ensureComplaint(prisma, {
    rideId: enRoute.id, customerId: karam.id, driverId: sara.id, branchId: input.branchId,
    priority: GoComplaintPriority.NORMAL, status: GoComplaintStatus.IN_REVIEW, reasonCode: 'BEHAVIOR',
    notes: 'أسلوب القيادة غير مريح', assignedToId: clock.supervisorId,
  });
  await ensureComplaint(prisma, {
    rideId: aleppoDone.id, customerId: huda.id, driverId: fadi.id, branchId: aleppo.id,
    priority: GoComplaintPriority.URGENT, status: GoComplaintStatus.RESOLVED, reasonCode: 'FARE',
    notes: 'الأجرة أعلى من التقدير', assignedToId: clock.supervisorId, resolvedById: clock.supervisorId, resolvedAt: clock.hourAgo,
  });

  await ensureEmergency(prisma, {
    rideId: enRoute.id, customerId: karam.id, branchId: input.branchId,
    status: GoEmergencyStatus.HANDLED, recordingStatus: GoEmergencyRecordingStatus.PENDING_DECISION,
    startedAt: clock.hourAgo, handledById: clock.supervisorId,
  });

  const accident = await prisma.goRideCase.upsert({
    where: { case_number: 'SEED-CASE-002' },
    update: { status: GoCaseStatus.CLOSED, closed_at: clock.hourAgo },
    create: {
      case_number: 'SEED-CASE-002',
      ride_id: replaced.id,
      branch_id: input.branchId,
      customer_id: layla.id,
      driver_id: sara.id,
      type: GoCaseType.ACCIDENT,
      status: GoCaseStatus.CLOSED,
      accident_severity: GoAccidentSeverity.MEDIUM,
      reason_code: 'ACCIDENT',
      occurred_at: clock.yesterday,
      latitude: 33.516,
      longitude: 36.29,
      customer_statement: 'اصطدام خفيف ثم أُنشئت رحلة بديلة',
      driver_statement: 'مركبة أخرى غيّرت المسار فجأة',
      negligence_suspected: false,
      supervisor_decision: 'لا إهمال على السائقة',
      closed_at: clock.hourAgo,
    },
  });
  const accidentNote = await prisma.goRideCaseNote.findFirst({ where: { case_id: accident.id, note: 'SEED: أُغلق الملف بعد الرحلة البديلة' } });
  if (!accidentNote) {
    await prisma.goRideCaseNote.create({
      data: { case_id: accident.id, author_id: clock.supervisorId, note: 'SEED: أُغلق الملف بعد الرحلة البديلة' },
    });
  }

  await prisma.goDriverEntitlement.upsert({
    where: { ride_id_driver_id: { ride_id: aleppoDone.id, driver_id: fadi.id } },
    update: { status: GoDriverEntitlementStatus.APPROVED, approved_amount: 3420 },
    create: {
      ride_id: aleppoDone.id, driver_id: fadi.id, calculated_amount: 3420, approved_amount: 3420,
      status: GoDriverEntitlementStatus.APPROVED, reviewed_by_id: clock.adminId, reviewed_at: clock.hourAgo,
    },
  });
  await prisma.goDriverEntitlement.upsert({
    where: { ride_id_driver_id: { ride_id: waived.id, driver_id: rana.id } },
    update: { status: GoDriverEntitlementStatus.UNDER_REVIEW },
    create: {
      ride_id: waived.id, driver_id: rana.id, calculated_amount: 0, status: GoDriverEntitlementStatus.UNDER_REVIEW,
    },
  });

  const welcome = await prisma.goCustomerDiscountCode.findUnique({ where: { code: 'SEED-WELCOME' } });
  if (welcome) {
    await prisma.goRideDiscountReservation.upsert({
      where: { ride_id: waived.id },
      update: { status: GoRideDiscountReservationStatus.APPLIED, applied_at: clock.hourAgo },
      create: {
        ride_id: waived.id, discount_code_id: welcome.id, status: GoRideDiscountReservationStatus.APPLIED, applied_at: clock.hourAgo,
      },
    });
    await prisma.goRideDiscountReservation.upsert({
      where: { ride_id: pendingStack.id },
      update: { status: GoRideDiscountReservationStatus.RESERVED },
      create: {
        ride_id: pendingStack.id, discount_code_id: welcome.id, status: GoRideDiscountReservationStatus.RESERVED,
      },
    });
  }

  const stackCompensation = await prisma.goRideCompensation.findFirst({ where: { ride_id: pendingStack.id, reason: 'SEED: انتظار عند الالتقاط' } });
  if (!stackCompensation) {
    await prisma.goRideCompensation.create({
      data: {
        ride_id: pendingStack.id, type: GoCompensationType.FIXED_AMOUNT, fixed_amount: 1500, applied_amount: 1500,
        reason: 'SEED: انتظار عند الالتقاط', created_by_id: clock.supervisorId, bearer: GoCompensationBearer.UNASSIGNED,
      },
    });
  }

  await prisma.goCustomerDiscountCode.upsert({
    where: { code: 'SEED-EXPIRED' },
    update: { status: GoDiscountCodeStatus.EXPIRED },
    create: {
      customer_id: sami.id, code: 'SEED-EXPIRED', name: 'خصم منتهٍ', percentage: 20,
      valid_from: clock.yesterday, expires_at: clock.yesterday, usage_limit: 1, usage_count: 0,
      status: GoDiscountCodeStatus.EXPIRED, created_by_id: clock.adminId,
    },
  });
  await prisma.goCustomerDiscountCode.upsert({
    where: { code: 'SEED-ALEPPO' },
    update: { status: GoDiscountCodeStatus.ACTIVE, expires_at: clock.nextMonth },
    create: {
      customer_id: huda.id, code: 'SEED-ALEPPO', name: 'خصم حلب', percentage: 15, maximum_discount_amount: 1500,
      valid_from: clock.yesterday, expires_at: clock.nextMonth, usage_limit: 3, usage_count: 0,
      immediate_allowed: true, scheduled_allowed: true, status: GoDiscountCodeStatus.ACTIVE, created_by_id: clock.adminId,
    },
  });
  await seedCampaignCodes(prisma, { ...clock, damascusId: input.branchId, firstRideId: firstPeopleRide.id });

  await ensureCustomerWallet(prisma, layla.id, 25000, 'SEED:CUSTOMER_LAYLA', clock.adminId);
  await ensureCustomerWallet(prisma, karam.id, 8000, 'SEED:CUSTOMER_KARAM', clock.adminId);

  await ensureRewardGrant(prisma, {
    customerId: layla.id,
    streak: 5,
    type: GoPassportRewardType.SCORE_AND_DISCOUNT,
    status: GoPassportRewardGrantStatus.PENDING,
    createdAt: clock.hourAgo,
  });
  await ensureRewardGrant(prisma, {
    customerId: karam.id,
    streak: 10,
    type: GoPassportRewardType.SCORE_AND_DISCOUNT,
    status: GoPassportRewardGrantStatus.PENDING,
    createdAt: clock.now,
  });
  await ensureRewardGrant(prisma, {
    customerId: huda.id,
    streak: 5,
    type: GoPassportRewardType.SCORE,
    status: GoPassportRewardGrantStatus.PENDING,
    createdAt: clock.yesterday,
  });

  await prisma.goPushToken.upsert({
    where: { token: 'seed-push-layla' },
    update: { user_id: layla.userId, platform: GoDevicePlatform.ANDROID },
    create: { user_id: layla.userId, token: 'seed-push-layla', platform: GoDevicePlatform.ANDROID },
  });
  await prisma.goPushToken.upsert({
    where: { token: 'seed-push-fadi' },
    update: { user_id: fadi.userId, platform: GoDevicePlatform.IOS },
    create: { user_id: fadi.userId, token: 'seed-push-fadi', platform: GoDevicePlatform.IOS },
  });

  const rating = await prisma.goRideRating.upsert({
    where: { ride_id_direction: { ride_id: aleppoDone.id, direction: GoRatingDirection.CUSTOMER_TO_DRIVER } },
    update: { stars: 4 },
    create: {
      ride_id: aleppoDone.id, direction: GoRatingDirection.CUSTOMER_TO_DRIVER,
      from_user_id: huda.userId, to_user_id: fadi.userId, stars: 4, notes: 'وصول جيد وتأخير بسيط',
    },
  });
  await ensureRatingReason(prisma, rating.id, 'ON_TIME');

  await seedFinanceLedger(prisma, {
    adminId: clock.adminId,
    hourAgo: clock.hourAgo,
    yesterday: clock.yesterday,
    rows: [
      { reason: 'SEED:COMMISSION:2007', driverId: rana.id, rideId: waived.id, amount: 390, at: clock.hourAgo },
      { reason: 'SEED:COMMISSION:2008', driverId: sara.id, rideId: pendingStack.id, amount: 1020, at: clock.hourAgo },
      { reason: 'SEED:COMMISSION:2009', driverId: fadi.id, rideId: aleppoDone.id, amount: 380, at: clock.hourAgo },
      { reason: 'SEED:COMMISSION:2014', driverId: rana.id, rideId: firstPeopleRide.id, amount: 350, at: clock.hourAgo },
    ],
  });

  const stackComp = await prisma.goRideCompensation.findFirst({
    where: { ride_id: pendingStack.id, reason: 'SEED: تعويض مسار' },
  });
  if (!stackComp) {
    await prisma.goRideCompensation.create({
      data: {
        ride_id: pendingStack.id,
        type: GoCompensationType.FIXED_AMOUNT,
        fixed_amount: 1500,
        applied_amount: 1500,
        reason: 'SEED: تعويض مسار',
        created_by_id: clock.supervisorId,
        bearer: GoCompensationBearer.SPLIT,
        beroya_share: 900,
        driver_share: 600,
        finance_reviewed_by_id: clock.adminId,
        finance_reviewed_at: clock.hourAgo,
        created_at: clock.hourAgo,
      },
    });
  }

  await seedIncentives(prisma, {
    now: clock.now,
    adminId: clock.adminId,
    damascusId: input.branchId,
    aleppoId: aleppo.id,
    categoryId: input.categoryId,
    customerId: karam.id,
    drivers: { rana, sara, mazen, fadi, kanan, demo: { id: input.driverId, userId: input.driverUserId } },
  });

  await seedBreakdownHandoff(prisma, {
    customerId: input.customerId,
    branchId: input.branchId,
    categoryId: input.categoryId,
    firstDriverId: input.driverId,
    secondDriver: mazen,
    hourAgo: clock.hourAgo,
    yesterday: clock.yesterday,
    adminId: clock.adminId,
  });

  void arrived;
}

/**
 * Demo: first driver breaks down → second driver continues.
 * - SEED-BREAK-WAIT: COMPLETED (Demo Driver) — no live interrupted ride on demo.
 * - SEED-BREAK-ORIG + SEED-BREAK-NEXT: already handed off Demo → مازن درويش.
 */
async function seedBreakdownHandoff(
  prisma: PrismaClient,
  input: {
    customerId: string;
    branchId: string;
    categoryId: string;
    firstDriverId: string;
    secondDriver: { id: string; userId: string; vehicleId: string };
    hourAgo: Date;
    yesterday: Date;
    adminId: string;
  },
) {
  const BREAK = { lat: 33.5175, lng: 36.286, address: 'نقطة التعطّل، شارع بغداد — دمشق' };

  const waiting = await upsertRide(prisma, {
    public_number: 'SEED-BREAK-WAIT',
    customer_id: input.customerId,
    driver_id: input.firstDriverId,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.IMMEDIATE,
    status: GoRideStatus.COMPLETED,
    payment_method: GoPaymentMethod.CASH,
    pickup_lat: PICKUP.lat,
    pickup_lng: PICKUP.lng,
    pickup_address: PICKUP.address,
    original_destination_lat: DROPOFF.lat,
    original_destination_lng: DROPOFF.lng,
    original_destination_address: DROPOFF.address,
    actual_start_lat: PICKUP.lat,
    actual_start_lng: PICKUP.lng,
    actual_dropoff_lat: DROPOFF.lat,
    actual_dropoff_lng: DROPOFF.lng,
    estimated_distance_m: 4200,
    estimated_duration_sec: 900,
    estimated_fare: 4500,
    actual_distance_m: 4300,
    actual_duration_sec: 920,
    gross_final_fare: 4600,
    customer_payable: 4600,
    payment_status: GoPaymentStatus.COLLECTED,
    assigned_at: input.yesterday,
    arrived_at: input.yesterday,
    started_at: input.yesterday,
    completed_at: input.hourAgo,
  });

  const waitCase = await prisma.goRideCase.upsert({
    where: { case_number: 'SEED-CASE-BREAK-WAIT' },
    update: {
      status: GoCaseStatus.CLOSED,
      ride_id: waiting.id,
      driver_id: input.firstDriverId,
      reason_code: 'ENGINE',
      latitude: BREAK.lat,
      longitude: BREAK.lng,
      replacement_ride_id: null,
      driver_statement: 'SEED: عطل مؤقت — اكتملت الرحلة',
      supervisor_decision: 'SEED: أُغلقت بعد اكتمال الرحلة',
    },
    create: {
      case_number: 'SEED-CASE-BREAK-WAIT',
      ride_id: waiting.id,
      branch_id: input.branchId,
      customer_id: input.customerId,
      driver_id: input.firstDriverId,
      type: GoCaseType.BREAKDOWN,
      status: GoCaseStatus.CLOSED,
      reason_code: 'ENGINE',
      occurred_at: input.hourAgo,
      latitude: BREAK.lat,
      longitude: BREAK.lng,
      customer_statement: 'السائق أبلغ عن عطل ثم اكتملت الرحلة',
      driver_statement: 'SEED: عطل مؤقت — اكتملت الرحلة',
      supervisor_decision: 'SEED: أُغلقت بعد اكتمال الرحلة',
    },
  });

  await ensureAlert(prisma, {
    rideId: waiting.id,
    branchId: input.branchId,
    type: GoOperationalAlertType.REPLACEMENT_NEEDED,
    status: GoOperationalAlertStatus.RESOLVED,
    severity: GoAlertSeverity.CRITICAL,
    claimedById: input.adminId,
    resolvedAt: input.hourAgo,
    autoResolved: true,
    metadata: {
      source: 'seed',
      action_required: 'NONE',
      phase: 'completed',
      case_type: 'BREAKDOWN',
      subtype: 'ENGINE',
      note: 'SEED: اكتملت الرحلة — لا حاجة لسائق بديل',
      public_number: 'SEED-BREAK-WAIT',
      case_id: waitCase.id,
      case_number: 'SEED-CASE-BREAK-WAIT',
      location_label: BREAK.address,
      lat: BREAK.lat,
      lng: BREAK.lng,
    },
  });

  await prisma.goDriverEntitlement.upsert({
    where: { ride_id_driver_id: { ride_id: waiting.id, driver_id: input.firstDriverId } },
    update: {
      calculated_amount: 4140,
      approved_amount: 4140,
      status: GoDriverEntitlementStatus.SETTLED,
      reviewed_by_id: input.adminId,
      reviewed_at: input.hourAgo,
    },
    create: {
      ride_id: waiting.id,
      driver_id: input.firstDriverId,
      calculated_amount: 4140,
      approved_amount: 4140,
      status: GoDriverEntitlementStatus.SETTLED,
      reviewed_by_id: input.adminId,
      reviewed_at: input.hourAgo,
    },
  });

  const handedOrig = await upsertRide(prisma, {
    public_number: 'SEED-BREAK-ORIG',
    customer_id: input.customerId,
    driver_id: input.firstDriverId,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.IMMEDIATE,
    status: GoRideStatus.REPLACED,
    payment_method: GoPaymentMethod.CASH,
    pickup_lat: PICKUP.lat,
    pickup_lng: PICKUP.lng,
    pickup_address: PICKUP.address,
    original_destination_lat: DROPOFF.lat,
    original_destination_lng: DROPOFF.lng,
    original_destination_address: DROPOFF.address,
    actual_start_lat: PICKUP.lat,
    actual_start_lng: PICKUP.lng,
    actual_dropoff_lat: BREAK.lat,
    actual_dropoff_lng: BREAK.lng,
    estimated_fare: 4500,
    actual_distance_m: 2000,
    actual_duration_sec: 500,
    gross_final_fare: 1700,
    customer_payable: 0,
    payment_status: GoPaymentStatus.CASH_EXPECTED,
    assigned_at: input.yesterday,
    arrived_at: input.yesterday,
    started_at: input.yesterday,
  });

  const secondVehicle = await prisma.goVehicle.findUnique({ where: { id: input.secondDriver.vehicleId } });
  const handedNext = await upsertRide(prisma, {
    public_number: 'SEED-BREAK-NEXT',
    customer_id: input.customerId,
    driver_id: input.secondDriver.id,
    branch_id: input.branchId,
    ride_category_id: input.categoryId,
    type: GoRideType.IMMEDIATE,
    status: GoRideStatus.DRIVER_EN_ROUTE,
    payment_method: GoPaymentMethod.CASH,
    pickup_lat: BREAK.lat,
    pickup_lng: BREAK.lng,
    pickup_address: BREAK.address,
    original_destination_lat: DROPOFF.lat,
    original_destination_lng: DROPOFF.lng,
    original_destination_address: DROPOFF.address,
    estimated_distance_m: 2200,
    estimated_duration_sec: 480,
    estimated_fare: 2400,
    payment_status: GoPaymentStatus.CASH_EXPECTED,
    assigned_at: input.hourAgo,
    replacement_of_ride_id: handedOrig.id,
  });

  if (secondVehicle) {
    await prisma.goRide.update({
      where: { id: handedNext.id },
      data: {
        vehicle_id: secondVehicle.id,
        vehicle_snapshot: {
          plate_number: secondVehicle.plate_number,
          make: secondVehicle.make,
          model: secondVehicle.model,
          color: secondVehicle.color,
          year: secondVehicle.year,
        },
      },
    });
  }

  await prisma.goRideCase.upsert({
    where: { case_number: 'SEED-CASE-BREAK-DONE' },
    update: {
      status: GoCaseStatus.IN_REVIEW,
      ride_id: handedOrig.id,
      replacement_ride_id: handedNext.id,
      reason_code: 'TIRE',
      latitude: BREAK.lat,
      longitude: BREAK.lng,
      supervisor_decision: 'نُقل الراكب إلى مازن درويش — عمولة الأول حتى نقطة التعطّل',
    },
    create: {
      case_number: 'SEED-CASE-BREAK-DONE',
      ride_id: handedOrig.id,
      branch_id: input.branchId,
      customer_id: input.customerId,
      driver_id: input.firstDriverId,
      type: GoCaseType.BREAKDOWN,
      status: GoCaseStatus.IN_REVIEW,
      reason_code: 'TIRE',
      occurred_at: input.yesterday,
      latitude: BREAK.lat,
      longitude: BREAK.lng,
      customer_statement: 'تم استبدالي بسائق آخر بعد العطل',
      driver_statement: 'إطار مثقوب — سُلّم الراكب لمازن',
      supervisor_decision: 'نُقل الراكب إلى مازن درويش — عمولة الأول حتى نقطة التعطّل',
      replacement_ride_id: handedNext.id,
    },
  });

  await prisma.goDriverEntitlement.upsert({
    where: { ride_id_driver_id: { ride_id: handedOrig.id, driver_id: input.firstDriverId } },
    update: {
      calculated_amount: 1700,
      approved_amount: 1700,
      status: GoDriverEntitlementStatus.APPROVED,
      reviewed_by_id: input.adminId,
      reviewed_at: input.hourAgo,
    },
    create: {
      ride_id: handedOrig.id,
      driver_id: input.firstDriverId,
      calculated_amount: 1700,
      approved_amount: 1700,
      status: GoDriverEntitlementStatus.APPROVED,
      reviewed_by_id: input.adminId,
      reviewed_at: input.hourAgo,
    },
  });

  await prisma.goDriverState.upsert({
    where: { driver_id: input.firstDriverId },
    update: {
      availability: GoDriverAvailability.ONLINE,
      current_ride_id: null,
      next_ride_id: null,
      last_lat: PICKUP.lat,
      last_lng: PICKUP.lng,
      h3_index: toH3Index(PICKUP.lat, PICKUP.lng),
      last_location_at: input.hourAgo,
    },
    create: {
      driver_id: input.firstDriverId,
      availability: GoDriverAvailability.ONLINE,
      last_lat: PICKUP.lat,
      last_lng: PICKUP.lng,
      h3_index: toH3Index(PICKUP.lat, PICKUP.lng),
      last_location_at: input.hourAgo,
    },
  });
  await prisma.goDriverState.upsert({
    where: { driver_id: input.secondDriver.id },
    update: {
      availability: GoDriverAvailability.BUSY,
      current_ride_id: handedNext.id,
      next_ride_id: null,
      last_lat: BREAK.lat,
      last_lng: BREAK.lng,
      last_location_at: input.hourAgo,
    },
    create: {
      driver_id: input.secondDriver.id,
      availability: GoDriverAvailability.BUSY,
      current_ride_id: handedNext.id,
      last_lat: BREAK.lat,
      last_lng: BREAK.lng,
      last_location_at: input.hourAgo,
    },
  });
}

/**
 * One public code per offer rule. SEED-FIRST1 already has its single slot taken by Layla's
 * completed ride, so any other customer gets "انتهت المدة".
 */
async function seedCampaignCodes(
  prisma: PrismaClient,
  input: { adminId: string; yesterday: Date; nextMonth: Date; hourAgo: Date; damascusId: string; firstRideId: string },
) {
  const base = {
    audience: GoDiscountAudience.ALL,
    percentage: 15,
    maximum_discount_amount: 3000,
    valid_from: input.yesterday,
    expires_at: input.nextMonth,
    status: GoDiscountCodeStatus.ACTIVE,
    created_by_id: input.adminId,
  };
  const codes = [
    { code: 'SEED-FIRST100', name: 'خصم أول 100 شخص', usage_limit: 100, max_customers: 100, per_customer_limit: 1 },
    { code: 'SEED-FIRST1', name: 'خصم أول شخص (مكتمل)', usage_limit: 1, max_customers: 1, per_customer_limit: 1 },
    { code: 'SEED-NEWUSER', name: 'خصم المستخدمين الجدد', usage_limit: 1000, per_customer_limit: 1, new_users_only: true },
    { code: 'SEED-DAMASCUS', name: 'خصم محافظة دمشق', usage_limit: 500, per_customer_limit: 3, branch_id: input.damascusId },
    {
      code: 'SEED-EVENT',
      name: 'خصم معرض دمشق الدولي',
      usage_limit: 500,
      per_customer_limit: 2,
      event_name: 'معرض دمشق الدولي',
      event_area: {
        type: 'Polygon',
        coordinates: [[[36.31, 33.51], [36.33, 33.51], [36.33, 33.53], [36.31, 33.53], [36.31, 33.51]]],
      },
    },
  ];
  for (const row of codes) {
    await prisma.goCustomerDiscountCode.upsert({
      where: { code: row.code },
      update: { ...base, ...row, created_by_id: undefined },
      create: { ...base, ...row },
    });
  }

  const full = await prisma.goCustomerDiscountCode.findUniqueOrThrow({ where: { code: 'SEED-FIRST1' } });
  await prisma.goRideDiscountReservation.upsert({
    where: { ride_id: input.firstRideId },
    update: { discount_code_id: full.id, status: GoRideDiscountReservationStatus.APPLIED, applied_at: input.hourAgo },
    create: {
      ride_id: input.firstRideId, discount_code_id: full.id, status: GoRideDiscountReservationStatus.APPLIED, applied_at: input.hourAgo,
    },
  });
  await prisma.goCustomerDiscountCode.update({
    where: { id: full.id },
    data: { usage_count: 1, status: GoDiscountCodeStatus.CONSUMED },
  });
}

async function ensureRewardGrant(
  prisma: PrismaClient,
  input: {
    customerId: string;
    streak: number;
    type: GoPassportRewardType;
    status: GoPassportRewardGrantStatus;
    createdAt?: Date;
    approvedById?: string;
    approvedAt?: Date;
  },
) {
  const found = await prisma.goPassportRewardGrant.findFirst({
    where: {
      customer_id: input.customerId,
      streak_value: input.streak,
      status: { not: GoPassportRewardGrantStatus.REJECTED },
    },
  });
  if (found) return found;
  return prisma.goPassportRewardGrant.create({
    data: {
      customer_id: input.customerId,
      streak_value: input.streak,
      reward_type: input.type,
      status: input.status,
      approved_by_id: input.approvedById ?? null,
      approved_at: input.approvedAt ?? null,
      created_at: input.createdAt,
    },
  });
}

async function ensureCustomer(
  prisma: PrismaClient,
  name: string,
  phone: string,
  levelId: string,
  score: number,
  rides: number,
) {
  const user = await prisma.user.upsert({
    where: { phone_role: { phone, role: GoRole.CUSTOMER } },
    update: { full_name: name },
    create: { phone, role: GoRole.CUSTOMER, full_name: name },
  });
  const profile = await prisma.goCustomerProfile.upsert({
    where: { user_id: user.id },
    update: {},
    create: { user_id: user.id },
  });
  await prisma.goCustomerPassport.upsert({
    where: { customer_id: profile.id },
    update: { hidden_score: score, current_level_id: levelId, completed_rides: rides },
    create: { customer_id: profile.id, hidden_score: score, current_level_id: levelId, completed_rides: rides },
  });
  return { id: profile.id, userId: user.id };
}

async function ensureDriver(
  prisma: PrismaClient,
  input: {
    name: string;
    phone: string;
    branchId: string;
    gender: GoDriverGender;
    plate: string;
    categoryId: string;
    make: string;
    model: string;
    color: string;
    year: number;
    balance: number;
    outstanding?: number;
    docsExpire: Date;
    levelId: string | null;
    blocked?: boolean;
    blockedReason?: string;
  },
) {
  const user = await prisma.user.upsert({
    where: { phone_role: { phone: input.phone, role: GoRole.DRIVER } },
    update: { full_name: input.name, branch_id: input.branchId },
    create: { phone: input.phone, role: GoRole.DRIVER, full_name: input.name, branch_id: input.branchId },
  });
  const driver = await prisma.goDriverProfile.upsert({
    where: { user_id: user.id },
    update: {
      branch_id: input.branchId,
      gender: input.gender,
      operational_blocked: input.blocked ?? false,
      operational_reason: input.blockedReason ?? null,
      is_suspended: false,
    },
    create: {
      user_id: user.id,
      branch_id: input.branchId,
      gender: input.gender,
      operational_blocked: input.blocked ?? false,
      operational_reason: input.blockedReason ?? null,
    },
  });
  for (const type of [GoDocumentType.LICENSE, GoDocumentType.VEHICLE_REGISTRATION, GoDocumentType.INSURANCE, GoDocumentType.IDENTITY]) {
    await prisma.goDriverDocument.upsert({
      where: { driver_id_type: { driver_id: driver.id, type } },
      update: { expires_at: input.docsExpire, is_valid: true },
      create: { driver_id: driver.id, type, expires_at: input.docsExpire, is_valid: true },
    });
  }
  const vehicle = await prisma.goVehicle.upsert({
    where: { plate_number: input.plate },
    update: {
      driver_id: driver.id, branch_id: input.branchId, ride_category_id: input.categoryId, is_active: true,
      make: input.make, model: input.model, color: input.color, year: input.year,
    },
    create: {
      plate_number: input.plate, driver_id: driver.id, branch_id: input.branchId, ride_category_id: input.categoryId,
      make: input.make, model: input.model, color: input.color, year: input.year,
    },
  });
  await prisma.goDriverProfile.update({ where: { id: driver.id }, data: { active_vehicle_id: vehicle.id } });
  await prisma.goDriverWallet.upsert({
    where: { driver_id: driver.id },
    update: { balance: input.balance, outstanding_due: input.outstanding ?? 0 },
    create: { driver_id: driver.id, balance: input.balance, outstanding_due: input.outstanding ?? 0 },
  });
  if (input.levelId) {
    await prisma.goDriverPassport.upsert({
      where: { driver_id: driver.id },
      update: {},
      create: { driver_id: driver.id, hidden_score: 0, current_level_id: input.levelId, completed_rides: 0 },
    });
  }
  return { id: driver.id, userId: user.id, vehicleId: vehicle.id };
}

async function setDriverState(
  prisma: PrismaClient,
  driverId: string,
  availability: GoDriverAvailability,
  lat: number,
  lng: number,
  currentRideId: string | null,
  at: Date,
) {
  const h3_index = toH3Index(lat, lng);
  await prisma.goDriverState.upsert({
    where: { driver_id: driverId },
    update: { availability, last_lat: lat, last_lng: lng, h3_index, last_location_at: at, current_ride_id: currentRideId, next_ride_id: null },
    create: { driver_id: driverId, availability, last_lat: lat, last_lng: lng, h3_index, last_location_at: at, current_ride_id: currentRideId },
  });
}

async function ensureCustomerWallet(prisma: PrismaClient, customerId: string, balance: number, reason: string, actorId: string) {
  const wallet = await prisma.goCustomerWallet.upsert({
    where: { customer_id: customerId },
    update: { balance },
    create: { customer_id: customerId, balance },
  });
  const found = await prisma.goCustomerWalletTransaction.findFirst({ where: { reason } });
  if (!found) {
    await prisma.goCustomerWalletTransaction.create({
      data: {
        wallet_id: wallet.id, customer_id: customerId, type: GoWalletTransactionType.TOP_UP,
        amount: balance, balance_before: 0, balance_after: balance, reason, created_by_id: actorId,
      },
    });
  }
}

async function ensureOtp(prisma: PrismaClient, phone: string, purpose: GoOtpPurpose, consumedAt: Date) {
  const codeHash = hash(`${phone}:123456`);
  const found = await prisma.goOtpRequest.findFirst({ where: { phone, purpose, code_hash: codeHash } });
  if (found) return;
  await prisma.goOtpRequest.create({
    data: {
      phone,
      purpose,
      code_hash: codeHash,
      attempts: 1,
      expires_at: consumedAt,
      consumed_at: consumedAt,
    },
  });
}
