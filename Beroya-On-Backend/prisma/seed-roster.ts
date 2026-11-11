import {
  GoDocumentType,
  GoDriverGender,
  GoRideRequirementType,
  GoRole,
  PrismaClient,
} from '../src/generated/prisma/client';

/** Approx. lng/lat box for resolve-pickup demos. */
export function serviceArea(lng: number, lat: number, delta = 0.18) {
  return {
    type: 'Polygon' as const,
    coordinates: [
      [
        [lng - delta, lat - delta],
        [lng + delta, lat - delta],
        [lng + delta, lat + delta],
        [lng - delta, lat + delta],
        [lng - delta, lat - delta],
      ],
    ],
  };
}

export type BranchDef = {
  code: string;
  name_ar: string;
  name_en: string;
  /** Short slug for emails: ops.damascus@… */
  slug: string;
  /** Two-digit index for stable phone namespaces 01–14. */
  idx: string;
  lat: number;
  lng: number;
};

/** All Syrian governorates as operational branches. */
export const ALL_BRANCHES: BranchDef[] = [
  { code: 'DAMASCUS', name_ar: 'دمشق', name_en: 'Damascus', slug: 'damascus', idx: '01', lat: 33.5138, lng: 36.2765 },
  { code: 'RIF_DIMASHQ', name_ar: 'ريف دمشق', name_en: 'Rural Damascus', slug: 'rifdimashq', idx: '02', lat: 33.5167, lng: 36.4833 },
  { code: 'ALEPPO', name_ar: 'حلب', name_en: 'Aleppo', slug: 'aleppo', idx: '03', lat: 36.2021, lng: 37.1343 },
  { code: 'HOMS', name_ar: 'حمص', name_en: 'Homs', slug: 'homs', idx: '04', lat: 34.7268, lng: 36.7234 },
  { code: 'HAMA', name_ar: 'حماة', name_en: 'Hama', slug: 'hama', idx: '05', lat: 35.1318, lng: 36.7578 },
  { code: 'LATAKIA', name_ar: 'اللاذقية', name_en: 'Latakia', slug: 'latakia', idx: '06', lat: 35.5317, lng: 35.7906 },
  { code: 'TARTUS', name_ar: 'طرطوس', name_en: 'Tartus', slug: 'tartus', idx: '07', lat: 34.889, lng: 35.8866 },
  { code: 'IDLIB', name_ar: 'إدلب', name_en: 'Idlib', slug: 'idlib', idx: '08', lat: 35.9306, lng: 36.6339 },
  { code: 'RAQQA', name_ar: 'الرقة', name_en: 'Raqqa', slug: 'raqqa', idx: '09', lat: 35.9500, lng: 39.0167 },
  { code: 'DEIR_EZ_ZOR', name_ar: 'دير الزور', name_en: 'Deir ez-Zor', slug: 'deirezzor', idx: '10', lat: 35.3333, lng: 40.1500 },
  { code: 'HASAKAH', name_ar: 'الحسكة', name_en: 'Hasakah', slug: 'hasakah', idx: '11', lat: 36.5000, lng: 40.7500 },
  { code: 'DARAA', name_ar: 'درعا', name_en: 'Daraa', slug: 'daraa', idx: '12', lat: 32.6189, lng: 36.1021 },
  { code: 'SUWAYDA', name_ar: 'السويداء', name_en: 'As-Suwayda', slug: 'suwayda', idx: '13', lat: 32.7081, lng: 36.5695 },
  { code: 'QUNEITRA', name_ar: 'القنيطرة', name_en: 'Quneitra', slug: 'quneitra', idx: '14', lat: 33.1253, lng: 35.8249 },
];

const BRANCH_STAFF = [
  { role: GoRole.OPERATIONS, key: 'ops', titleAr: 'تشغيل', titleEn: 'Operations', roleIdx: '01' },
  { role: GoRole.CUSTOMER_SERVICE, key: 'cs', titleAr: 'خدمة عملاء', titleEn: 'CS', roleIdx: '02' },
  {
    role: GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    key: 'cssup',
    titleAr: 'مشرف خدمة عملاء',
    titleEn: 'CS Supervisor',
    roleIdx: '03',
  },
  { role: GoRole.WALLET_OPERATOR, key: 'wallet', titleAr: 'محفظة', titleEn: 'Wallet', roleIdx: '04' },
] as const;

/** Keep historic Damascus/Aleppo phones used by README + older tests. */
const LEGACY_STAFF: Record<string, { phone: string; email: string }> = {
  'DAMASCUS:ops': { phone: '+963900000004', email: 'ops.dam@beroyaon.com' },
  'DAMASCUS:cs': { phone: '+963900000005', email: 'cs.dam@beroyaon.com' },
  'DAMASCUS:cssup': { phone: '+963900000006', email: 'cssup.dam@beroyaon.com' },
  'DAMASCUS:wallet': { phone: '+963900000007', email: 'wallet.dam@beroyaon.com' },
  'ALEPPO:cs': { phone: '+963900000008', email: 'cs.alp@beroyaon.com' },
};

export type SeedStaffUser = {
  role: GoRole;
  email: string;
  phone: string;
  full_name: string;
  branch?: string;
};

export function buildGlobalStaff(): SeedStaffUser[] {
  return [
    {
      role: GoRole.SUPER_ADMIN,
      email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@beroyaon.com',
      phone: process.env.SEED_SUPER_ADMIN_PHONE ?? '+963900000001',
      full_name: 'Super Admin',
    },
    { role: GoRole.ADMIN, email: 'admin@beroyaon.com', phone: '+963900000002', full_name: 'Go Admin' },
    { role: GoRole.FINANCE, email: 'finance@beroyaon.com', phone: '+963900000003', full_name: 'Finance Officer' },
  ];
}

/** One OPERATIONS / CS / CSSUP / WALLET account per branch — same password as all staff. */
export function buildBranchStaff(branches: BranchDef[] = ALL_BRANCHES): SeedStaffUser[] {
  const users: SeedStaffUser[] = [];
  for (const branch of branches) {
    for (const staff of BRANCH_STAFF) {
      const legacy = LEGACY_STAFF[`${branch.code}:${staff.key}`];
      const phone = legacy?.phone ?? `+963902${branch.idx}${staff.roleIdx}`;
      const email = legacy?.email ?? `${staff.key}.${branch.slug}@beroyaon.com`;
      users.push({
        role: staff.role,
        email,
        phone,
        full_name: `${staff.titleEn} ${branch.name_en}`,
        branch: branch.code,
      });
    }
  }
  return users;
}

const CUSTOMER_NAMES = [
  ['عميل', 'Customer'],
  ['زبون', 'Rider'],
] as const;

const DRIVER_NAMES = [
  ['سائق أ', 'Driver A'],
  ['سائق ب', 'Driver B'],
  ['سائق ج', 'Driver C'],
] as const;

/**
 * Per branch: 2 customers + 3 drivers (shared password not used — OTP login).
 * Skips Damascus demo pair phones already created in seed.ts (+963911111111 / +963922222222).
 */
export async function seedBranchPeople(
  prisma: PrismaClient,
  input: {
    branchIds: Record<string, string>;
    categoryId: string;
    driverLevelId: string | null;
    customerLevelId: string | null;
  },
) {
  const docsExpire = new Date();
  docsExpire.setFullYear(docsExpire.getFullYear() + 2);

  let customers = 0;
  let drivers = 0;

  for (const branch of ALL_BRANCHES) {
    const branchId = input.branchIds[branch.code];
    if (!branchId) continue;

    for (let i = 0; i < CUSTOMER_NAMES.length; i++) {
      const [ar, en] = CUSTOMER_NAMES[i];
      const phone = `+963911${branch.idx}${String(i + 1).padStart(2, '0')}`;
      const name = `${ar} ${branch.name_ar}`;
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
      if (input.customerLevelId) {
        await prisma.goCustomerPassport.upsert({
          where: { customer_id: profile.id },
          update: {},
          create: {
            customer_id: profile.id,
            hidden_score: 100,
            current_level_id: input.customerLevelId,
            completed_rides: 0,
          },
        });
      }
      await prisma.goCustomerWallet.upsert({
        where: { customer_id: profile.id },
        update: { balance: 15000 },
        create: { customer_id: profile.id, balance: 15000 },
      });
      customers += 1;
      void en;
    }

    for (let i = 0; i < DRIVER_NAMES.length; i++) {
      const [ar] = DRIVER_NAMES[i];
      const phone = `+963922${branch.idx}${String(i + 1).padStart(2, '0')}`;
      // Preserve historic demo driver on Damascus first slot if it collides — use 04+ for extras only when needed.
      if (phone === '+963922222222') continue;
      const name = `${ar} ${branch.name_ar}`;
      const plate = `${branch.code}-GO-${String(i + 1).padStart(3, '0')}`;
      const user = await prisma.user.upsert({
        where: { phone_role: { phone, role: GoRole.DRIVER } },
        update: { full_name: name, branch_id: branchId },
        create: { phone, role: GoRole.DRIVER, full_name: name, branch_id: branchId },
      });
      const driver = await prisma.goDriverProfile.upsert({
        where: { user_id: user.id },
        update: {
          branch_id: branchId,
          gender: i === 1 ? GoDriverGender.FEMALE : GoDriverGender.MALE,
          is_suspended: false,
          operational_blocked: false,
        },
        create: {
          user_id: user.id,
          branch_id: branchId,
          gender: i === 1 ? GoDriverGender.FEMALE : GoDriverGender.MALE,
        },
      });
      for (const type of [
        GoDocumentType.LICENSE,
        GoDocumentType.VEHICLE_REGISTRATION,
        GoDocumentType.INSURANCE,
        GoDocumentType.IDENTITY,
      ]) {
        await prisma.goDriverDocument.upsert({
          where: { driver_id_type: { driver_id: driver.id, type } },
          update: { expires_at: docsExpire, is_valid: true },
          create: { driver_id: driver.id, type, expires_at: docsExpire, is_valid: true },
        });
      }
      const vehicle = await prisma.goVehicle.upsert({
        where: { plate_number: plate },
        update: {
          driver_id: driver.id,
          branch_id: branchId,
          ride_category_id: input.categoryId,
          is_active: true,
          make: 'Toyota',
          model: i === 0 ? 'Corolla' : i === 1 ? 'Yaris' : 'Camry',
          color: i === 1 ? 'Black' : 'White',
          year: 2020 + i,
        },
        create: {
          plate_number: plate,
          driver_id: driver.id,
          branch_id: branchId,
          ride_category_id: input.categoryId,
          make: 'Toyota',
          model: i === 0 ? 'Corolla' : i === 1 ? 'Yaris' : 'Camry',
          color: i === 1 ? 'Black' : 'White',
          year: 2020 + i,
          ...(i === 0
            ? {
                capabilities: {
                  create: [{ type: GoRideRequirementType.CHILD_SEAT }],
                },
              }
            : {}),
        },
      });
      await prisma.goDriverProfile.update({
        where: { id: driver.id },
        data: { active_vehicle_id: vehicle.id },
      });
      await prisma.goDriverWallet.upsert({
        where: { driver_id: driver.id },
        update: { balance: 75000, outstanding_due: 0 },
        create: { driver_id: driver.id, balance: 75000 },
      });
      if (input.driverLevelId) {
        await prisma.goDriverPassport.upsert({
          where: { driver_id: driver.id },
          update: {},
          create: {
            driver_id: driver.id,
            hidden_score: 0,
            current_level_id: input.driverLevelId,
            completed_rides: 0,
          },
        });
      }
      drivers += 1;
    }
  }

  return { customers, drivers };
}

export function formatPeopleDirectory() {
  const lines = [
    '',
    '── Customers / drivers by governorate (OTP 123456 when OTP_DEV_MODE=true) ──',
    'Demo customer +963911111111 · Demo driver +963922222222',
  ];
  for (const branch of ALL_BRANCHES) {
    lines.push(`${branch.name_ar} (${branch.code}):`);
    lines.push(
      `  customers +963911${branch.idx}01 · +963911${branch.idx}02`,
    );
    lines.push(
      `  drivers   +963922${branch.idx}01 · +963922${branch.idx}02 · +963922${branch.idx}03`,
    );
    lines.push(`  branch rides SEED-B${branch.idx}-01…05`);
  }
  return lines.join('\n');
}

export function formatStaffDirectory(users: SeedStaffUser[], password: string) {
  const lines = [
    '',
    '── Staff directory (same password for all) ──',
    `Password: ${password}`,
    'Role | Email | Phone | Branch',
  ];
  for (const u of users) {
    lines.push(`${u.role} | ${u.email} | ${u.phone} | ${u.branch ?? 'GLOBAL'}`);
  }
  lines.push(formatPeopleDirectory());
  return lines.join('\n');
}
