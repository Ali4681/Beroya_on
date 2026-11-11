import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';
import {
  GoDocumentType,
  GoDriverGender,
  GoDriverPassportScoreEventType,
  GoPassportRewardType,
  GoPassportScoreEventType,
  GoRideRequirementType,
  GoRole,
  PrismaClient,
} from '../src/generated/prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedActivity } from './seed-activity';
import { seedAllBranchActivity } from './seed-branch-activity';
import {
  ALL_BRANCHES,
  buildBranchStaff,
  buildGlobalStaff,
  formatStaffDirectory,
  seedBranchPeople,
  serviceArea,
} from './seed-roster';
import { seedRadarDemo } from './seed-radar';
import { formatStoreDirectory, seedStores } from './seed-stores';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Beroya@12345';

/**
 * Wipe every application table, keep Prisma migration history.
 * Then seed recreates catalog + demo data from scratch.
 */
async function wipeDatabase() {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename <> '_prisma_migrations'
     ORDER BY tablename`,
  );
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename.replace(/"/g, '""')}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  console.log(`Wiped ${rows.length} tables (kept _prisma_migrations).`);
}

/** Re-insert service catalog (normally created by migrations; wiped above). */
async function seedServiceCatalog() {
  const services: {
    code: 'DAILY' | 'RENTAL' | 'AIRPORT' | 'ACCESSIBILITY' | 'INTERCITY' | 'TOURIST' | 'FLEET' | 'AMBULANCE';
    name_ar: string;
    name_en: string;
    is_available: boolean;
    sort_order: number;
  }[] = [
    { code: 'DAILY', name_ar: 'يومي', name_en: 'Daily', is_available: true, sort_order: 1 },
    { code: 'RENTAL', name_ar: 'استئجار مع سائق', name_en: 'Rental with driver', is_available: true, sort_order: 2 },
    { code: 'AIRPORT', name_ar: 'مطارات', name_en: 'Airport', is_available: false, sort_order: 3 },
    { code: 'ACCESSIBILITY', name_ar: 'ذوي الاحتياجات الخاصة', name_en: 'Accessibility', is_available: true, sort_order: 4 },
    { code: 'INTERCITY', name_ar: 'بين المحافظات', name_en: 'Intercity', is_available: true, sort_order: 5 },
    { code: 'TOURIST', name_ar: 'نقل سياحي', name_en: 'Tourist', is_available: true, sort_order: 6 },
    { code: 'FLEET', name_ar: 'أسطول', name_en: 'Fleet', is_available: true, sort_order: 7 },
    { code: 'AMBULANCE', name_ar: 'إسعاف', name_en: 'Ambulance', is_available: true, sort_order: 8 },
  ];
  for (const s of services) {
    await prisma.goService.upsert({
      where: { code: s.code },
      update: {
        name_ar: s.name_ar,
        name_en: s.name_en,
        is_available: s.is_available,
        is_visible: true,
        sort_order: s.sort_order,
      },
      create: {
        code: s.code,
        name_ar: s.name_ar,
        name_en: s.name_en,
        is_available: s.is_available,
        is_visible: true,
        sort_order: s.sort_order,
      },
    });
  }
}

const BRANCHES = ALL_BRANCHES.map((b) => ({
  code: b.code,
  name_ar: b.name_ar,
  name_en: b.name_en,
  center_lat: b.lat,
  center_lng: b.lng,
  service_area: serviceArea(b.lng, b.lat),
}));

const USERS = [...buildGlobalStaff(), ...buildBranchStaff(ALL_BRANCHES)];

/** Codes are a contract with the apps. COMFORT stays inactive for ride history only. */
const CATEGORIES = [
  { code: 'ECONOMY', name_ar: 'يومي', name_en: 'Daily', sort_order: 1, seats: 4, active: true, base: 1000, km: 400, min: 80, minimum: 2500 },
  { code: 'VIP', name_ar: 'VIP', name_en: 'VIP', sort_order: 2, seats: 4, active: true, base: 4000, km: 1000, min: 200, minimum: 8000 },
  { code: 'FAMILY', name_ar: 'عائلي', name_en: 'Family', sort_order: 3, seats: 6, active: true, base: 2000, km: 650, min: 120, minimum: 4500 },
  { code: 'WOMEN', name_ar: 'سيدات', name_en: 'Women', sort_order: 4, seats: 4, active: true, base: 1200, km: 450, min: 90, minimum: 3000 },
  { code: 'XL', name_ar: 'مجموعات كبيرة', name_en: 'Large group', sort_order: 5, seats: 7, active: true, base: 2500, km: 750, min: 140, minimum: 5500 },
  { code: 'TAXI', name_ar: 'تكسي', name_en: 'Taxi', sort_order: 6, seats: 4, active: true, base: 1000, km: 400, min: 80, minimum: 2500 },
  { code: 'COMFORT', name_ar: 'مريح', name_en: 'Comfort', sort_order: 7, seats: 4, active: false, base: 1500, km: 550, min: 100, minimum: 3500 },
  { code: 'AMBULANCE', name_ar: 'إسعاف', name_en: 'Ambulance', sort_order: 8, seats: 3, active: true, base: 2000, km: 600, min: 100, minimum: 4000 },
];

const RADIUS_STEPS = [500, 700, 800, 1000, 1200, 1300];

async function main() {
  await wipeDatabase();
  await seedServiceCatalog();

  const branchIds: Record<string, string> = {};
  for (const b of BRANCHES) {
    const branch = await prisma.goBranch.upsert({
      where: { code: b.code },
      update: {
        name_ar: b.name_ar,
        name_en: b.name_en,
        service_area: b.service_area,
        center_lat: b.center_lat,
        center_lng: b.center_lng,
        is_active: true,
      },
      create: {
        code: b.code,
        name_ar: b.name_ar,
        name_en: b.name_en,
        service_area: b.service_area,
        center_lat: b.center_lat,
        center_lng: b.center_lng,
      },
    });
    branchIds[b.code] = branch.id;
  }

  const password_hash = await bcrypt.hash(PASSWORD, 10);
  for (const u of USERS) {
    const email = u.email?.trim() || null;
    const data = {
      role: u.role,
      phone: u.phone,
      full_name: u.full_name,
      branch_id: u.branch ? branchIds[u.branch] : null,
      password_hash,
      email,
    };
    // phone+role is the stable key; email-only upsert fails when env email is empty or remapped.
    await prisma.user.upsert({
      where: { phone_role: { phone: u.phone, role: u.role } },
      update: data,
      create: data,
    });
  }

  const categoryIds: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const cat = await prisma.goRideCategory.upsert({
      where: { code: c.code },
      update: { name_ar: c.name_ar, name_en: c.name_en, sort_order: c.sort_order, is_active: c.active },
      create: {
        code: c.code,
        name_ar: c.name_ar,
        name_en: c.name_en,
        sort_order: c.sort_order,
        max_passengers: c.seats,
        is_active: c.active,
      },
    });
    categoryIds[c.code] = cat.id;
    await prisma.goRidePricing.upsert({
      where: { ride_category_id: cat.id },
      update: {
        base_fare: c.base,
        price_per_km: c.km,
        price_per_minute: c.min,
        minimum_fare: c.minimum,
        currency: 'SYP',
        is_active: true,
      },
      create: {
        ride_category_id: cat.id,
        base_fare: c.base,
        price_per_km: c.km,
        price_per_minute: c.min,
        minimum_fare: c.minimum,
        currency: 'SYP',
      },
    });
  }

  await prisma.goDispatchConfig.upsert({
    where: { id: 'default' },
    update: {
      radius_steps_json: RADIUS_STEPS,
      driver_offer_radius_m: 500,
      min_search_seconds: 90,
      empty_search_retry_seconds: 10,
    },
    create: {
      id: 'default',
      radius_steps_json: RADIUS_STEPS,
      driver_offer_radius_m: 500,
      min_search_seconds: 90,
      empty_search_retry_seconds: 10,
    },
  });

  for (const appId of ['customer', 'driver'] as const) {
    await prisma.goAppInfo.upsert({
      where: { id: appId },
      update: {},
      create: {
        id: appId,
        support_phone: '+963989901010',
        support_whatsapp: '+963989901010',
        support_email: 'support@beroyaon.com',
        terms_url: 'https://beroyaon.com/ar/terms',
        privacy_url: 'https://beroyaon.com/ar/privacy',
        about_ar: 'برويا — تطبيق نقل يوصلك بأمان في سوريا.',
        min_supported_version: '1.0.0',
        latest_version: '1.0.0',
      },
    });
  }

  const cities = ALL_BRANCHES.map((b, i) => ({
    name_ar: b.name_ar,
    name_en: b.name_en,
    sort_order: i + 1,
    lat: b.lat,
    lng: b.lng,
  }));
  for (const c of cities) {
    const existing = await prisma.goCity.findUnique({ where: { name_ar: c.name_ar } });
    if (existing) {
      await prisma.goCity.update({
        where: { id: existing.id },
        data: {
          name_en: c.name_en,
          sort_order: c.sort_order,
          lat: c.lat,
          lng: c.lng,
          is_active: true,
        },
      });
    } else {
      await prisma.goCity.create({ data: { ...c, is_active: true } });
    }
  }

  await prisma.goWalletConfig.upsert({
    where: { id: 'default' },
    update: {
      minimum_initial_topup: 10000,
      commission_percentage: 10,
      system_average_fare: 5000,
      low_balance_amount: 20000,
      low_balance_remaining_rides: 3,
    },
    create: {
      id: 'default',
      minimum_initial_topup: 10000,
      commission_percentage: 10,
      system_average_fare: 5000,
      low_balance_amount_enabled: true,
      low_balance_amount: 20000,
      low_balance_rides_enabled: true,
      low_balance_remaining_rides: 3,
    },
  });

  const customerUser = await prisma.user.upsert({
    where: { phone_role: { phone: '+963911111111', role: GoRole.CUSTOMER } },
    update: { full_name: 'Demo Customer' },
    create: { phone: '+963911111111', role: GoRole.CUSTOMER, full_name: 'Demo Customer' },
  });
  const customerProfile = await prisma.goCustomerProfile.upsert({
    where: { user_id: customerUser.id },
    update: {},
    create: { user_id: customerUser.id },
  });

  const driverUser = await prisma.user.upsert({
    where: { phone_role: { phone: '+963922222222', role: GoRole.DRIVER } },
    update: { full_name: 'Demo Driver', branch_id: branchIds.DAMASCUS },
    create: {
      phone: '+963922222222',
      role: GoRole.DRIVER,
      full_name: 'Demo Driver',
      branch_id: branchIds.DAMASCUS,
    },
  });

  let driver = await prisma.goDriverProfile.findUnique({ where: { user_id: driverUser.id } });
  if (!driver) {
    driver = await prisma.goDriverProfile.create({
      data: {
        user_id: driverUser.id,
        branch_id: branchIds.DAMASCUS,
        gender: GoDriverGender.MALE,
      },
    });
  } else {
    driver = await prisma.goDriverProfile.update({
      where: { id: driver.id },
      data: { branch_id: branchIds.DAMASCUS, gender: GoDriverGender.MALE, is_suspended: false, operational_blocked: false },
    });
  }

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 2);
  for (const type of [GoDocumentType.LICENSE, GoDocumentType.VEHICLE_REGISTRATION]) {
    await prisma.goDriverDocument.upsert({
      where: { driver_id_type: { driver_id: driver.id, type } },
      update: { expires_at: expires, is_valid: true },
      create: { driver_id: driver.id, type, expires_at: expires, is_valid: true },
    });
  }

  const vehicle = await prisma.goVehicle.upsert({
    where: { plate_number: 'دمشق-GO-001' },
    update: {
      driver_id: driver.id,
      branch_id: branchIds.DAMASCUS,
      ride_category_id: categoryIds.ECONOMY,
      is_active: true,
      make: 'Toyota',
      model: 'Corolla',
      color: 'White',
      year: 2020,
    },
    create: {
      plate_number: 'دمشق-GO-001',
      driver_id: driver.id,
      branch_id: branchIds.DAMASCUS,
      ride_category_id: categoryIds.ECONOMY,
      make: 'Toyota',
      model: 'Corolla',
      color: 'White',
      year: 2020,
      capabilities: {
        create: [{ type: GoRideRequirementType.CHILD_SEAT }, { type: GoRideRequirementType.EXTRA_LUGGAGE }],
      },
    },
  });

  await prisma.goDriverProfile.update({
    where: { id: driver.id },
    data: { active_vehicle_id: vehicle.id },
  });

  // Fund demo driver so Phase 0–8 e2e dispatch/accept keeps working.
  await prisma.goDriverWallet.upsert({
    where: { driver_id: driver.id },
    update: { balance: 100000, outstanding_due: 0 },
    create: { driver_id: driver.id, balance: 100000 },
  });

  await prisma.goCustomerPassportConfig.upsert({
    where: { id: 'default' },
    update: { initial_score: 100, minimum_score: -100, maximum_score: 1000, review_interval_minutes: 1440 },
    create: {
      id: 'default',
      initial_score: 100,
      minimum_score: -100,
      maximum_score: 1000,
      review_interval_minutes: 1440,
    },
  });
  await prisma.goPassportStreakConfig.upsert({
    where: { id: 'default' },
    update: { milestone_every_rides: 5, is_active: true },
    create: { id: 'default', milestone_every_rides: 5, is_active: true },
  });

  const levels = [
    { order: 1, name_ar: 'مبتدئ', name_en: 'Starter', stamp_name_ar: 'بداية موفقة', score: 0, rides: 0 },
    { order: 2, name_ar: 'فضّي', name_en: 'Silver', stamp_name_ar: 'أنت مميز', score: 120, rides: 5 },
    { order: 3, name_ar: 'ذهبي', name_en: 'Gold', stamp_name_ar: 'أنت استثنائي', score: 200, rides: 20 },
    { order: 4, name_ar: 'بلاتيني', name_en: 'Platinum', stamp_name_ar: 'أنت أيقونة', score: 350, rides: 50 },
    { order: 5, name_ar: 'ماسي', name_en: 'Diamond', stamp_name_ar: 'أنت الأسطورة', score: 500, rides: 100 },
  ];
  for (const l of levels) {
    const existing = await prisma.goCustomerPassportLevel.findUnique({ where: { level_order: l.order } });
    if (existing) {
      await prisma.goCustomerPassportLevel.update({
        where: { id: existing.id },
        data: {
          name_ar: l.name_ar,
          name_en: l.name_en,
          stamp_name_ar: l.stamp_name_ar,
          minimum_score: l.score,
          minimum_completed_rides: l.rides,
          is_active: true,
        },
      });
    } else {
      await prisma.goCustomerPassportLevel.create({
        data: {
          level_order: l.order,
          name_ar: l.name_ar,
          name_en: l.name_en,
          stamp_name_ar: l.stamp_name_ar,
          minimum_score: l.score,
          minimum_completed_rides: l.rides,
        },
      });
    }
  }

  const scoreRules: { event_type: GoPassportScoreEventType; score_delta: number }[] = [
    { event_type: GoPassportScoreEventType.RIDE_COMPLETED, score_delta: 5 },
    { event_type: GoPassportScoreEventType.LATE_CANCELLATION, score_delta: -10 },
    { event_type: GoPassportScoreEventType.EN_ROUTE_CANCELLATION, score_delta: -25 },
    { event_type: GoPassportScoreEventType.NO_SHOW, score_delta: -15 },
    { event_type: GoPassportScoreEventType.CONFIRMED_COMPLAINT, score_delta: -20 },
    { event_type: GoPassportScoreEventType.DRIVER_RATING_1, score_delta: -10 },
    { event_type: GoPassportScoreEventType.DRIVER_RATING_2, score_delta: -5 },
    { event_type: GoPassportScoreEventType.DRIVER_RATING_3, score_delta: 0 },
    { event_type: GoPassportScoreEventType.DRIVER_RATING_4, score_delta: 3 },
    { event_type: GoPassportScoreEventType.DRIVER_RATING_5, score_delta: 5 },
    { event_type: GoPassportScoreEventType.STREAK_BONUS, score_delta: 10 },
  ];
  for (const r of scoreRules) {
    const found = await prisma.goPassportScoreRule.findFirst({
      where: { event_type: r.event_type, ride_category_id: null },
    });
    if (found) {
      await prisma.goPassportScoreRule.update({
        where: { id: found.id },
        data: { score_delta: r.score_delta, is_active: true },
      });
    } else {
      await prisma.goPassportScoreRule.create({
        data: { event_type: r.event_type, score_delta: r.score_delta, is_active: true },
      });
    }
  }

  await prisma.goPassportMilestoneRewardConfig.upsert({
    where: { milestone_multiple: 5 },
    update: {
      reward_type: GoPassportRewardType.SCORE_AND_DISCOUNT,
      score_bonus: 10,
      discount_percentage: 10,
      requires_admin_approval: true,
      is_active: true,
    },
    create: {
      milestone_multiple: 5,
      reward_type: GoPassportRewardType.SCORE_AND_DISCOUNT,
      score_bonus: 10,
      discount_percentage: 10,
      requires_admin_approval: true,
      is_active: true,
    },
  });

  // Phase 10 — driver passport levels + cancel penalty score rules.
  const driverLevels = [
    { order: 1, name_ar: 'سائق جديد', name_en: 'New Driver' },
    { order: 2, name_ar: 'معتمد', name_en: 'Verified' },
    { order: 3, name_ar: 'متميز', name_en: 'Pro' },
  ];
  for (const l of driverLevels) {
    const existing = await prisma.goDriverPassportLevel.findUnique({ where: { level_order: l.order } });
    if (existing) {
      await prisma.goDriverPassportLevel.update({
        where: { id: existing.id },
        data: { name_ar: l.name_ar, name_en: l.name_en, is_active: true },
      });
    } else {
      await prisma.goDriverPassportLevel.create({
        data: { level_order: l.order, name_ar: l.name_ar, name_en: l.name_en, is_active: true },
      });
    }
  }
  const driverScoreRules: { event_type: GoDriverPassportScoreEventType; score_delta: number }[] = [
    { event_type: GoDriverPassportScoreEventType.RIDE_COMPLETED, score_delta: 5 },
    { event_type: GoDriverPassportScoreEventType.DRIVER_CANCELLED_RIDE, score_delta: -20 },
  ];
  for (const r of driverScoreRules) {
    await prisma.goDriverPassportScoreRule.upsert({
      where: { event_type: r.event_type },
      update: { score_delta: r.score_delta, is_active: true },
      create: { event_type: r.event_type, score_delta: r.score_delta, is_active: true },
    });
  }
  const driverLevel1 = await prisma.goDriverPassportLevel.findUnique({ where: { level_order: 1 } });
  if (driverLevel1) {
    await prisma.goDriverPassport.upsert({
      where: { driver_id: driver.id },
      update: {},
      create: {
        driver_id: driver.id,
        hidden_score: 0,
        current_level_id: driverLevel1.id,
        completed_rides: 0,
      },
    });
  }

  if ((await prisma.goPackage.count()) === 0) {
    await prisma.goPackage.createMany({
      data: [
        {
          name_ar: 'باقة الأسبوع',
          name_en: 'Weekly pack',
          description_ar: '5 رحلات خلال 7 أيام',
          description_en: '5 rides within 7 days',
          price: 12000,
          duration_days: 7,
          ride_count: 5,
          sort_order: 1,
        },
        {
          name_ar: 'باقة الشهر',
          name_en: 'Monthly pack',
          description_ar: 'خصم 15% على كل رحلاتك لمدة 30 يوم',
          description_en: '15% off every ride for 30 days',
          price: 25000,
          duration_days: 30,
          discount_percentage: 15,
          sort_order: 2,
        },
      ],
    });
  }

  const starterLevel = await prisma.goCustomerPassportLevel.findUnique({ where: { level_order: 1 } });
  const roster = await seedBranchPeople(prisma, {
    branchIds,
    categoryId: categoryIds.ECONOMY,
    driverLevelId: driverLevel1?.id ?? null,
    customerLevelId: starterLevel?.id ?? null,
  });

  const branchActivity = await seedAllBranchActivity(prisma, {
    branchIds,
    categoryId: categoryIds.ECONOMY,
  });

  await seedActivity(prisma, {
    branchId: branchIds.DAMASCUS,
    categoryId: categoryIds.ECONOMY,
    customerId: customerProfile.id,
    customerUserId: customerUser.id,
    driverId: driver.id,
    driverUserId: driverUser.id,
    vehicleId: vehicle.id,
  });

  const storeSeed = await seedStores(prisma, { branchIds, password: PASSWORD });

  await seedRadarDemo();

  console.log(
    [
      `Seeded ${BRANCHES.length} governorate branches (service areas + centers),`,
      `${USERS.length} staff (global + 4 roles × every branch),`,
      `${CATEGORIES.length} categories+pricing, sample packages,`,
      'dispatch + wallet + customer passport (5 levels) + driver passport framework,',
      `branch roster: ${roster.customers} customers + ${roster.drivers} drivers (plus demo + activity volume),`,
      `per-branch ops: ${branchActivity.rides} rides / ${branchActivity.branches} governorates,`,
      `POS stores: ${storeSeed.stores} stores + ${storeSeed.operators} operators,`,
      'radar/command-center legend (heat, waiting, available, busy, stale, forecast),',
      'rides across statuses, payment states, and fare-stack decisions,',
      'offers, alerts, complaints, emergencies, cases, finance, discounts, and audit rows.',
      formatStaffDirectory(USERS, PASSWORD),
      formatStoreDirectory(PASSWORD),
    ].join('\n'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
